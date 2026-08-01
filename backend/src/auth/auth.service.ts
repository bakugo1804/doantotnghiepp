import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: any) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email đã tồn tại');

    const hashed = await bcrypt.hash(dto.password, 12);

    // Hệ thống dùng cho 1 tổ chức: người đăng ký mới mặc định là Nhân viên,
    // Giám đốc (ADMIN) có thể nâng quyền sau trong phần Quản trị.
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        fullName: dto.fullName,
        phone: dto.phone,
        role: 'STAFF',
        isActive: true,
      },
      select: { id: true, email: true, fullName: true, role: true, companyId: true, createdAt: true },
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
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');

    const payload = { sub: user.id, email: user.email, role: user.role, companyId: user.companyId };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
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
      select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, role: true, companyId: true, createdAt: true, updatedAt: true },
    });
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
