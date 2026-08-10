import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tiền tố id của các công ty "suy ra" - tên chỉ tồn tại trong tờ khai, chưa có
 * bản ghi riêng trong danh bạ. Tên công ty chính là khoá nối giữa hai nguồn này.
 */
const DERIVED_PREFIX = 'derived-';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async findAll(search?: string, user?: { role: string; companyId?: string | null }) {
    const companies = await this.prisma.company.findMany({
      where: search
        ? { name: { contains: search, mode: 'insensitive' } }
        : undefined,
      include: { createdBy: { select: { id: true, fullName: true } } },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });

    const customs = await this.prisma.customsRecord.findMany({
      where: user?.role === 'ADMIN'
        ? undefined
        : user?.companyId
          ? { companyId: user.companyId }
          : undefined,
      select: {
        exporterName: true,
        importerName: true,
        totalPayable: true,
        currency: true,
        updatedAt: true,
      },
    });

    const statsMap = new Map<string, { role: string; recordsCount: number; totalPayable: number; currency: string; lastActivity: Date }>();

    for (const record of customs) {
      const merge = (name: string, role: 'EXPORTER' | 'IMPORTER') => {
        const current = statsMap.get(name) ?? {
          role,
          recordsCount: 0,
          totalPayable: 0,
          currency: record.currency,
          lastActivity: record.updatedAt,
        };

        current.role = current.role === role ? role : 'BOTH';
        current.recordsCount += 1;
        current.totalPayable += record.totalPayable;
        if (record.updatedAt > current.lastActivity) current.lastActivity = record.updatedAt;
        statsMap.set(name, current);
      };

      merge(record.exporterName, 'EXPORTER');
      merge(record.importerName, 'IMPORTER');
    }

    const dbMap = new Map(companies.map((company) => [company.name, company]));
    const names = new Set<string>([...dbMap.keys(), ...statsMap.keys()]);

    return Array.from(names).map((name) => {
      const company = dbMap.get(name);
      const stats = statsMap.get(name);
      return {
        id: company?.id ?? `${DERIVED_PREFIX}${name}`,
        name,
        role: company?.role ?? stats?.role ?? 'BOTH',
        contactEmail: company?.contactEmail ?? null,
        contactPhone: company?.contactPhone ?? null,
        address: company?.address ?? null,
        notes: company?.notes ?? null,
        recordsCount: stats?.recordsCount ?? 0,
        totalPayable: stats?.totalPayable ?? 0,
        currency: stats?.currency ?? 'USD',
        lastActivity: stats?.lastActivity ?? company?.updatedAt ?? company?.createdAt ?? new Date(),
        createdBy: company?.createdBy ?? null,
        createdAt: company?.createdAt ?? null,
        updatedAt: company?.updatedAt ?? null,
        isDirectoryEntry: Boolean(company),
      };
    }).filter((company) => !search || company.name.toLowerCase().includes(search.toLowerCase()))
      .sort((left, right) => right.recordsCount - left.recordsCount || left.name.localeCompare(right.name));
  }

  async create(data: { name: string; role: string; contactEmail?: string; contactPhone?: string; address?: string; notes?: string }, userId: string) {
    const existing = await this.prisma.company.findUnique({ where: { name: data.name } });
    if (existing) throw new ConflictException('Công ty đã tồn tại');
    return this.prisma.company.create({
      data: { ...data, createdById: userId },
    });
  }

  /**
   * Sửa một công ty, kể cả công ty mới chỉ "suy ra" từ tờ khai.
   *
   * Với công ty suy ra, không có gì để cập nhật nên bản ghi danh bạ được tạo mới
   * ngay tại đây. Trước kia người dùng phải tự vào form "Thêm công ty" gõ lại
   * đúng tên - làm sai một ký tự là sinh ra hai thẻ công ty riêng biệt.
   *
   * Đổi tên thì đổi luôn trên các tờ khai đang mang tên cũ, vì tên chính là thứ
   * nối bản ghi danh bạ với tờ khai; chỉ đổi một bên sẽ tách thành hai thẻ.
   */
  async update(
    id: string,
    data: { name?: string; role?: string; contactEmail?: string | null; contactPhone?: string | null; address?: string | null; notes?: string | null },
    userId: string,
  ) {
    const derivedName = id.startsWith(DERIVED_PREFIX) ? id.slice(DERIVED_PREFIX.length) : null;
    const existing = derivedName
      ? await this.prisma.company.findUnique({ where: { name: derivedName } })
      : await this.prisma.company.findUnique({ where: { id } });

    const currentName = existing?.name ?? derivedName;
    if (!currentName) throw new NotFoundException('Không tìm thấy công ty');

    const nextName = data.name?.trim() || currentName;
    if (nextName !== currentName) {
      const duplicate = await this.prisma.company.findUnique({ where: { name: nextName } });
      if (duplicate) throw new ConflictException('Tên công ty đã tồn tại');
    }

    return this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.company.update({ where: { id: existing.id }, data: { ...data, name: nextName } })
        : await tx.company.create({
            data: {
              name: nextName,
              role: data.role || 'BOTH',
              contactEmail: data.contactEmail ?? undefined,
              contactPhone: data.contactPhone ?? undefined,
              address: data.address ?? undefined,
              notes: data.notes ?? undefined,
              createdById: userId,
            },
          });

      if (nextName !== currentName) {
        await tx.customsRecord.updateMany({ where: { exporterName: currentName }, data: { exporterName: nextName } });
        await tx.customsRecord.updateMany({ where: { importerName: currentName }, data: { importerName: nextName } });
      }

      return saved;
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy công ty');
    return this.prisma.company.delete({ where: { id } });
  }
}