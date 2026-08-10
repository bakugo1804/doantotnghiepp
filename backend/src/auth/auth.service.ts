import { BadRequestException, Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  normalizeUsername,
  suggestUsernameFromEmail,
  USERNAME_PATTERN,
  USERNAME_RULE_MESSAGE,
} from '../common/username';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Tìm tài khoản theo email hoặc tên đăng nhập.
   *
   * Nhận diện bằng dấu @ thay vì thử lần lượt hai cột: username không được phép
   * chứa @, nên chuỗi có @ chắc chắn là email.
   */
  private findByIdentifier(identifier: string) {
    const value = (identifier || '').trim();
    if (value.includes('@')) {
      return this.prisma.user.findUnique({ where: { email: value.toLowerCase() } });
    }
    return this.prisma.user.findUnique({ where: { username: normalizeUsername(value) } });
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    // Bỏ trống thì suy ra từ email, và thêm hậu tố nếu tên đó đã có người dùng.
    let username = dto.username ? normalizeUsername(dto.username) : suggestUsernameFromEmail(email);
    if (!username) throw new BadRequestException(USERNAME_RULE_MESSAGE);
    if (!USERNAME_PATTERN.test(username)) throw new BadRequestException(USERNAME_RULE_MESSAGE);

    const [emailTaken, usernameTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { username }, select: { id: true } }),
    ]);
    if (emailTaken) throw new ConflictException('Email đã tồn tại');
    if (usernameTaken) {
      // Người dùng tự nhập thì báo lỗi để họ chọn lại; còn tên do hệ thống suy ra
      // từ email thì tự nối số thứ tự, không bắt họ xử lý va chạm mình không tạo ra.
      if (dto.username) throw new ConflictException('Tên đăng nhập đã được sử dụng');
      username = `${username}${Date.now().toString().slice(-4)}`;
    }

    const hashed = await bcrypt.hash(dto.password, 12);

    // Hệ thống dùng cho 1 tổ chức: người đăng ký mới mặc định là Nhân viên,
    // Giám đốc (ADMIN) có thể nâng quyền sau trong phần Quản trị.
    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        password: hashed,
        fullName: dto.fullName,
        phone: dto.phone,
        role: 'STAFF',
        isActive: true,
      },
      select: { id: true, email: true, username: true, fullName: true, role: true, companyId: true, createdAt: true },
    });

    // Thông báo cho Giám đốc/Admin có nhân viên mới
    const approvers = await this.prisma.user.findMany({
      where: { OR: [{ role: 'ADMIN' }, { role: 'DIRECTOR' }] },
      select: { id: true },
    });
    if (approvers.length > 0) {
      await this.prisma.notification.createMany({
        data: approvers.map((approver) => ({
          userId: approver.id,
          subject: 'Tài khoản nhân viên mới',
          content: `${dto.fullName} (${dto.email}) vừa tạo tài khoản trong hệ thống.`,
          source: 'SYSTEM',
        })),
      });
    }

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.findByIdentifier(dto.identifier);

    // Dùng chung một thông báo cho "không tìm thấy" và "sai mật khẩu": tách hai
    // trường hợp sẽ cho phép người ngoài dò xem tài khoản nào có thật.
    const invalid = 'Tài khoản hoặc mật khẩu không đúng';
    if (!user) throw new UnauthorizedException(invalid);

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException(invalid);

    // Tài khoản bị khoá thì nói rõ, vì lúc này mật khẩu đã đúng - người dùng cần
    // biết phải đi tìm quản trị viên chứ không phải loay hoay nhập lại mật khẩu.
    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = { sub: user.id, email: user.email, role: user.role, companyId: user.companyId };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        companyId: user.companyId,
      },
    };
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, fullName: true, phone: true, avatarUrl: true, role: true, companyId: true, lastLoginAt: true, createdAt: true, updatedAt: true },
    });
  }

  /** Kiểm tra tên đăng nhập còn trống hay không, dùng cho ô nhập ở trang đăng ký. */
  async checkUsername(username: string) {
    const value = normalizeUsername(username);
    if (!USERNAME_PATTERN.test(value)) {
      return { available: false, reason: USERNAME_RULE_MESSAGE };
    }
    const existing = await this.prisma.user.findUnique({ where: { username: value }, select: { id: true } });
    return existing
      ? { available: false, reason: 'Tên đăng nhập đã được sử dụng' }
      : { available: true };
  }

  listCompanyOptions() {
    return this.prisma.company.findMany({
      select: {
        id: true,
        name: true,
        role: true,
        contactEmail: true,
        createdBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
}
