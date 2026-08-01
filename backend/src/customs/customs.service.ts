import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomsDto } from './dto/create-customs.dto';
import { calculateShippingFee, DEFAULT_EXCHANGE_RATE, getVatRateByCountry } from './financial-rules';

type AuthUser = { sub: string; role: string; companyId?: string | null };

@Injectable()
export class CustomsService {
  constructor(private prisma: PrismaService) {}

  private toRecordScope(_user: AuthUser) {
    // Hệ thống dùng cho 1 tổ chức duy nhất -> mọi vai trò xem chung dữ liệu.
    return {};
  }

  async checkRecordNo(recordNo: string): Promise<{ available: boolean }> {
    const value = (recordNo || '').trim();
    if (!value) return { available: false };
    const existing = await this.prisma.customsRecord.findUnique({ where: { recordNo: value }, select: { id: true } });
    return { available: !existing };
  }

  private calcFinancials(materials: any[], vatRate: number, shippingFee: number) {
    const totalValue = materials.reduce((sum, m) => sum + m.quantity * m.unitPrice, 0);
    const vatAmount = (totalValue * vatRate) / 100;
    const totalPayable = totalValue + vatAmount + shippingFee;
    return {
      totalValue: Number(totalValue.toFixed(2)),
      vatAmount: Number(vatAmount.toFixed(2)),
      totalPayable: Number(totalPayable.toFixed(2)),
    };
  }

  private async generateRecordNo(date: Date) {
    const y = date.getFullYear().toString();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    const prefix = `TK${y}${m}${d}`;
    const count = await this.prisma.customsRecord.count({
      where: { recordNo: { startsWith: prefix } },
    });
    return `${prefix}-${`${count + 1}`.padStart(4, '0')}`;
  }

  async create(dto: CreateCustomsDto, user: AuthUser) {
    let recordNo = (dto as any).recordNo?.trim();
    if (recordNo) {
      const exists = await this.prisma.customsRecord.findUnique({ where: { recordNo }, select: { id: true } });
      if (exists) throw new ConflictException(`Số tờ khai "${recordNo}" đã tồn tại, vui lòng nhập số khác`);
    } else {
      recordNo = await this.generateRecordNo(new Date());
    }
    const {
      recordNo: _ignoredRecordNo,
      materials,
      journeys,
      currency = 'USD',
      exporterCountry = 'VN',
      importerCountry = 'VN',
      distanceKm = 0,
      exchangeRate = DEFAULT_EXCHANGE_RATE,
      leg1Origin,
      leg1Destination,
      leg2Origin,
      leg2Destination,
      ...rest
    } = dto;
    const vatRate = dto.vatRate ?? getVatRateByCountry(importerCountry);
    const shippingFee = calculateShippingFee(distanceKm, exporterCountry, importerCountry);

    const materialsWithTotal = materials.map((m) => ({
      ...m,
      totalPrice: Number((m.quantity * m.unitPrice).toFixed(2)),
    }));

    const { totalValue, vatAmount, totalPayable } = this.calcFinancials(materialsWithTotal, vatRate, shippingFee);

    // If journeys are provided, use them; otherwise use leg1Origin/leg1Destination
    const legData = journeys && journeys.length > 0
      ? {
          leg1Origin: journeys[0]?.origin || '',
          leg1Destination: journeys[0]?.destination || '',
          leg2Origin: journeys[1]?.origin || undefined,
          leg2Destination: journeys[1]?.destination || undefined,
        }
      : {
          leg1Origin: leg1Origin || '',
          leg1Destination: leg1Destination || '',
          leg2Origin,
          leg2Destination,
        };

    return this.prisma.customsRecord.create({
      data: {
        recordNo,
        ...rest,
        ...legData,
        entryDate: new Date(dto.entryDate),
        exitDate: dto.exitDate ? new Date(dto.exitDate) : undefined,
        currency,
        exporterCountry: exporterCountry.toUpperCase(),
        importerCountry: importerCountry.toUpperCase(),
        vatRate,
        shippingFee,
        distanceKm,
        exchangeRate,
        totalValue,
        vatAmount,
        totalPayable,
        createdById: user.sub,
        companyId: user.companyId ?? undefined,
        materials: { create: materialsWithTotal },
        ...(journeys && journeys.length > 0 && { journeys: { create: journeys } }),
      },
      include: {
        materials: true,
        journeys: { orderBy: { legNumber: 'asc' } },
        createdBy: { select: { fullName: true, email: true } },
      },
    });
  }

  async findAll(
    user: AuthUser,
    options: {
      page: number;
      limit: number;
      search?: string;
      status?: string;
      transportType?: string;
      companyName?: string;
    },
  ) {
    const skip = (options.page - 1) * options.limit;
    const where: any = { ...this.toRecordScope(user) };

    if (options.search) {
      where.OR = [
        { recordNo: { contains: options.search, mode: 'insensitive' } },
        { exporterName: { contains: options.search, mode: 'insensitive' } },
        { importerName: { contains: options.search, mode: 'insensitive' } },
      ];
    }
    if (options.status) where.status = options.status;
    if (options.transportType) where.transportType = options.transportType;
    if (options.companyName) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { exporterName: { contains: options.companyName, mode: 'insensitive' } },
            { importerName: { contains: options.companyName, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.customsRecord.findMany({
        where,
        skip,
        take: options.limit,
        orderBy: { createdAt: 'desc' },
        include: { materials: true, createdBy: { select: { fullName: true } } },
      }),
      this.prisma.customsRecord.count({ where }),
    ]);
    return { data, total, page: options.page, limit: options.limit, totalPages: Math.ceil(total / options.limit) };
  }

  async findOne(id: string, user: AuthUser) {
    const record = await this.prisma.customsRecord.findFirst({
      where: { id, ...this.toRecordScope(user) },
      include: {
        materials: true,
        attachments: true,
        journeys: { orderBy: { legNumber: 'asc' } },
        createdBy: { select: { fullName: true, email: true } },
      },
    });
    if (!record) throw new NotFoundException('Không tìm thấy tờ khai');
    return record;
  }

  async updateStatus(id: string, status: string, user: AuthUser) {
    const found = await this.prisma.customsRecord.findFirst({
      where: { id, ...this.toRecordScope(user) },
      select: { id: true },
    });
    if (!found) throw new ForbiddenException('Bạn không có quyền cập nhật tờ khai này');
    return this.prisma.customsRecord.update({
      where: { id },
      data: { status: status as any },
    });
  }

  async remove(id: string, user: AuthUser) {
    const record = await this.findOne(id, user);
    return this.prisma.customsRecord.delete({ where: { id: record.id } });
  }

  async getStats(user: AuthUser) {
    const where = this.toRecordScope(user);
    const [total, byStatus, byTransport] = await Promise.all([
      this.prisma.customsRecord.count({ where }),
      this.prisma.customsRecord.groupBy({ by: ['status'], _count: true, where }),
      this.prisma.customsRecord.groupBy({ by: ['transportType'], _count: true, where }),
    ]);
    return { total, byStatus, byTransport };
  }

  async getCompanies(user: AuthUser, search?: string) {
    const records = await this.prisma.customsRecord.findMany({
      where: {
        ...this.toRecordScope(user),
        ...(search
          ? {
              OR: [
                { exporterName: { contains: search, mode: 'insensitive' } },
                { importerName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        exporterName: true,
        importerName: true,
        totalPayable: true,
        currency: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const companies = new Map<string, { name: string; roles: Set<string>; recordsCount: number; totalPayable: number; currency: string; lastActivity: Date }>();

    for (const record of records) {
      const touchCompany = (name: string, role: 'EXPORTER' | 'IMPORTER') => {
        const current = companies.get(name) ?? {
          name,
          roles: new Set<string>(),
          recordsCount: 0,
          totalPayable: 0,
          currency: record.currency,
          lastActivity: record.updatedAt,
        };

        current.roles.add(role);
        current.recordsCount += 1;
        current.totalPayable += record.totalPayable;
        if (record.updatedAt > current.lastActivity) current.lastActivity = record.updatedAt;

        companies.set(name, current);
      };

      touchCompany(record.exporterName, 'EXPORTER');
      touchCompany(record.importerName, 'IMPORTER');
    }

    return Array.from(companies.values())
      .map((company) => ({
        name: company.name,
        role: company.roles.size > 1 ? 'BOTH' : Array.from(company.roles)[0],
        recordsCount: company.recordsCount,
        totalPayable: company.totalPayable,
        currency: company.currency,
        lastActivity: company.lastActivity,
      }))
      .sort((left, right) => right.recordsCount - left.recordsCount || left.name.localeCompare(right.name));
  }
}
