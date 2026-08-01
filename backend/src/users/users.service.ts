import { ConflictException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

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
      select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, role: true, isActive: true, companyId: true, company: { select: { id: true, name: true } }, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, role: true, isActive: true, companyId: true, company: { select: { id: true, name: true } }, createdAt: true, updatedAt: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  async update(id: string, data: { fullName?: string; phone?: string; role?: string; isActive?: boolean; password?: string; email?: string; avatarUrl?: string | null; companyId?: string | null }) {
    if (data.email) {
      const existing = await this.prisma.user.findFirst({ where: { email: data.email, NOT: { id } }, select: { id: true } });
      if (existing) throw new ConflictException('Email đã tồn tại');
    }
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 12);
    }
    return this.prisma.user.update({ where: { id }, data: data as any });
  }

  async updateMe(id: string, data: { fullName?: string; phone?: string; email?: string; password?: string; avatarUrl?: string | null }) {
    const updated = await this.update(id, data);
    return this.findOne(updated.id);
  }

  remove(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }
}
