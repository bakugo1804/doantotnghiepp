import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(data: { title: string; description?: string; workDate: string; status?: 'TODO' | 'IN_PROGRESS' | 'DONE'; assignedToId: string }, assignedById: string, assignedByCompanyId?: string | null) {
    if (assignedByCompanyId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: data.assignedToId },
        select: { companyId: true },
      });
      if (!assignee || assignee.companyId !== assignedByCompanyId) {
        throw new ForbiddenException('Chỉ được giao việc cho người cùng tổ chức');
      }
    }
    return this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        workDate: new Date(data.workDate),
        status: data.status,
        assignedToId: data.assignedToId,
        assignedById,
      },
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true, role: true } },
        assignedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  findAll(userId: string, role: string, companyId: string | null | undefined, filters: { date?: string; assignedToId?: string; status?: string }) {
    const where: any = {};

    // 1 tổ chức: Giám đốc (ADMIN) & Quản lý (DIRECTOR) xem toàn bộ và lọc theo nhân viên;
    // các vai trò khác chỉ xem việc được giao cho mình.
    const isManager = role === 'ADMIN' || role === 'DIRECTOR';
    if (isManager) {
      if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    } else {
      where.assignedToId = userId;
    }

    if (filters.status) where.status = filters.status;

    if (filters.date) {
      const start = new Date(filters.date);
      const end = new Date(filters.date);
      end.setHours(23, 59, 59, 999);
      where.workDate = { gte: start, lte: end };
    }

    return this.prisma.task.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true, role: true } },
        assignedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ workDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async update(id: string, data: { title?: string; description?: string; workDate?: string; status?: 'TODO' | 'IN_PROGRESS' | 'DONE'; assignedToId?: string }, userId: string, role: string, companyId?: string | null) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { assignedTo: { select: { companyId: true } }, assignedBy: { select: { companyId: true } } },
    });
    if (!task) throw new NotFoundException('Không tìm thấy công việc');

    const isAssigner = role === 'ADMIN' || role === 'DIRECTOR';

    if (role === 'DIRECTOR') {
      if (companyId && task.assignedTo.companyId !== companyId && task.assignedBy.companyId !== companyId) {
        throw new ForbiddenException('Bạn không có quyền cập nhật công việc này');
      }
    } else if (role !== 'ADMIN') {
      if (task.assignedToId !== userId) {
        throw new ForbiddenException('Bạn không có quyền cập nhật công việc này');
      }
      if (companyId && task.assignedTo.companyId !== companyId) {
        throw new ForbiddenException('Bạn không có quyền cập nhật công việc này');
      }
    }

    const nextData: any = { ...data };
    if (!isAssigner) {
      delete nextData.title;
      delete nextData.description;
      delete nextData.workDate;
      delete nextData.assignedToId;
    }
    if (nextData.workDate) nextData.workDate = new Date(nextData.workDate);

    return this.prisma.task.update({
      where: { id },
      data: nextData,
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true, role: true } },
        assignedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async remove(id: string, role: string, companyId?: string | null) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { assignedTo: { select: { companyId: true } }, assignedBy: { select: { companyId: true } } },
    });
    if (!task) throw new NotFoundException('Không tìm thấy công việc');
    
    if (role === 'DIRECTOR') {
      if (companyId && task.assignedTo.companyId !== companyId && task.assignedBy.companyId !== companyId) {
        throw new ForbiddenException('Bạn không có quyền xóa công việc này');
      }
    } else if (role !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền xóa công việc này');
    }
    return this.prisma.task.delete({ where: { id } });
  }
}