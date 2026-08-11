import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(
    data: {
      title: string;
      description?: string;
      workDate: string;
      status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
      assignedToId: string;
      /** Gắn công việc vào một tờ khai cụ thể, dùng khi giao việc ngay từ trang chi tiết. */
      customsRecordId?: string;
    },
    assignedById: string,
    assignedByCompanyId?: string | null,
  ) {
    if (assignedByCompanyId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: data.assignedToId },
        select: { companyId: true },
      });
      if (!assignee || assignee.companyId !== assignedByCompanyId) {
        throw new ForbiddenException('Chỉ được giao việc cho người cùng tổ chức');
      }
    }
    const task = await this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        workDate: new Date(data.workDate),
        status: data.status,
        assignedToId: data.assignedToId,
        assignedById,
        customsRecordId: data.customsRecordId,
      },
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true, role: true } },
        assignedBy: { select: { id: true, fullName: true } },
        customsRecord: { select: { id: true, recordNo: true } },
      },
    });

    // Báo cho người được giao. Trước đây bước này không tồn tại, nên nhân viên chỉ
    // biết mình có việc mới nếu tự mở trang Công việc ra xem.
    await this.notifyAssignee(task, 'Bạn được giao công việc mới');

    return task;
  }

  /**
   * Gửi thông báo trong ứng dụng cho người nhận việc.
   *
   * Không để lỗi thông báo làm hỏng cả thao tác giao việc: việc đã được tạo rồi,
   * chuông không kêu là phiền chứ không phải mất dữ liệu.
   */
  private async notifyAssignee(task: any, subject: string) {
    // Tự giao việc cho chính mình thì không cần báo.
    if (task.assignedToId === task.assignedById) return;

    const dueDate = new Date(task.workDate).toLocaleDateString('vi-VN');
    const relatedRecord = task.customsRecord ? ` (tờ khai ${task.customsRecord.recordNo})` : '';
    const content =
      `${task.assignedBy?.fullName ?? 'Quản lý'} giao cho bạn: "${task.title}"${relatedRecord}. ` +
      `Hạn xử lý: ${dueDate}.`;

    try {
      await this.prisma.notification.create({
        data: {
          userId: task.assignedToId,
          subject,
          content,
          source: 'APP',
          link: task.customsRecordId ? `/dashboard/customs/${task.customsRecordId}` : '/dashboard/tasks',
        },
      });
    } catch (error) {
      console.error('Không tạo được thông báo giao việc:', error);
    }
  }

  findAll(
    userId: string,
    role: string,
    companyId: string | null | undefined,
    filters: { date?: string; assignedToId?: string; status?: string; customsRecordId?: string },
  ) {
    const where: any = {};

    // Lọc theo tờ khai: trang chi tiết dùng để liệt kê ai đang phụ trách hồ sơ này.
    if (filters.customsRecordId) where.customsRecordId = filters.customsRecordId;

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
      // "2026-08-10" được Date hiểu là nửa đêm theo UTC, nhưng setHours lại đặt giờ
      // theo múi giờ của máy chủ. Trộn hai hệ quy chiếu như trước khiến cửa sổ lọc
      // chỉ dài 17 tiếng (ở múi +07) và bỏ sót việc của những giờ đầu ngày.
      const start = new Date(`${filters.date}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      where.workDate = { gte: start, lt: end };
    }

    return this.prisma.task.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true, role: true, avatarUrl: true } },
        assignedBy: { select: { id: true, fullName: true } },
        customsRecord: { select: { id: true, recordNo: true, status: true } },
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

    const updated = await this.prisma.task.update({
      where: { id },
      data: nextData,
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true, role: true } },
        assignedBy: { select: { id: true, fullName: true } },
        customsRecord: { select: { id: true, recordNo: true } },
      },
    });

    // Chuyển việc sang người khác cũng là "được giao việc mới" với người nhận.
    if (nextData.assignedToId && nextData.assignedToId !== task.assignedToId) {
      await this.notifyAssignee(updated, 'Bạn được giao công việc mới');
    }

    return updated;
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