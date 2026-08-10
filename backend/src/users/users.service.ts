import { BadRequestException, ConflictException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeUsername, USERNAME_PATTERN, USERNAME_RULE_MESSAGE } from '../common/username';
import * as bcrypt from 'bcryptjs';

/** Các trường an toàn để trả ra ngoài - cố ý không có password. */
const USER_FIELDS = {
  id: true,
  email: true,
  username: true,
  fullName: true,
  phone: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  companyId: true,
  company: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

type UpdatableUser = {
  fullName?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
  password?: string;
  email?: string;
  username?: string;
  avatarUrl?: string | null;
  companyId?: string | null;
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll(user?: { role: string; companyId?: string | null }) {
    const where: any = {};
    if (user) {
      if (user.role === 'DIRECTOR') {
        if (!user.companyId) return [];
        where.companyId = user.companyId;
      } else if (user.role !== 'ADMIN') {
        throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
      }
    }

    return this.prisma.user.findMany({
      where,
      select: USER_FIELDS,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_FIELDS });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  async update(id: string, data: UpdatableUser, requesterId?: string) {
    const payload: UpdatableUser = { ...data };

    // Khoá tài khoản: chặn tự khoá mình và chặn khoá quản trị viên cuối cùng,
    // vì cả hai đều dẫn tới trạng thái không còn ai vào được phần Quản trị.
    if (payload.isActive === false) {
      if (requesterId === id) throw new ForbiddenException('Bạn không thể tự khoá tài khoản của mình');
      const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
      if (target?.role === 'ADMIN') {
        const activeAdmins = await this.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
        if (activeAdmins <= 1) throw new ForbiddenException('Không thể khoá quản trị viên cuối cùng đang hoạt động');
      }
    }

    // Hạ quyền quản trị viên cuối cùng cũng gây hậu quả y hệt.
    if (payload.role && payload.role !== 'ADMIN') {
      const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
      if (target?.role === 'ADMIN') {
        const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN' } });
        if (adminCount <= 1) throw new ForbiddenException('Không thể hạ quyền quản trị viên cuối cùng');
      }
    }

    if (payload.email) {
      payload.email = payload.email.trim().toLowerCase();
      const existing = await this.prisma.user.findFirst({
        where: { email: payload.email, NOT: { id } },
        select: { id: true },
      });
      if (existing) throw new ConflictException('Email đã tồn tại');
    }

    if (payload.username !== undefined) {
      payload.username = normalizeUsername(payload.username);
      if (!USERNAME_PATTERN.test(payload.username)) throw new BadRequestException(USERNAME_RULE_MESSAGE);
      const existing = await this.prisma.user.findFirst({
        where: { username: payload.username, NOT: { id } },
        select: { id: true },
      });
      if (existing) throw new ConflictException('Tên đăng nhập đã được sử dụng');
    }

    if (payload.password) {
      payload.password = await bcrypt.hash(payload.password, 12);
    }

    await this.prisma.user.update({ where: { id }, data: payload as any });
    return this.findOne(id);
  }

  updateMe(id: string, data: Pick<UpdatableUser, 'fullName' | 'phone' | 'email' | 'username' | 'password' | 'avatarUrl'>) {
    // Người dùng tự sửa hồ sơ thì không được đụng tới role, isActive hay companyId -
    // chỉ nhận đúng những trường liệt kê ở đây, tránh nâng quyền bằng cách gửi
    // thêm field vào body.
    return this.update(id, {
      fullName: data.fullName,
      phone: data.phone,
      email: data.email,
      username: data.username,
      password: data.password,
      avatarUrl: data.avatarUrl,
    });
  }

  async remove(id: string, requesterId?: string) {
    if (requesterId && requesterId === id) {
      throw new ForbiddenException('Bạn không thể tự xoá tài khoản của chính mình');
    }

    const target = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');

    // Xoá quản trị viên cuối cùng sẽ khiến không còn ai vào được phần Quản trị,
    // và không có cách nào khôi phục từ trong giao diện.
    if (target.role === 'ADMIN') {
      const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        throw new ForbiddenException('Không thể xoá quản trị viên cuối cùng của hệ thống');
      }
    }

    return this.prisma.user.delete({ where: { id } });
  }

  /** Khoá/mở khoá tài khoản, kèm các ràng buộc giống như khi xoá. */
  async setActive(id: string, isActive: boolean, requesterId?: string) {
    if (!isActive) {
      if (requesterId === id) throw new ForbiddenException('Bạn không thể tự khoá tài khoản của mình');
      const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
      if (target?.role === 'ADMIN') {
        const activeAdmins = await this.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
        if (activeAdmins <= 1) throw new ForbiddenException('Không thể khoá quản trị viên cuối cùng đang hoạt động');
      }
    }
    return this.update(id, { isActive });
  }
}
