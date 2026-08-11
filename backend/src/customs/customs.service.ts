import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomsDto } from './dto/create-customs.dto';
import { calcDeclarationTotals, calcMaterialTax, DEFAULT_EXCHANGE_RATE } from './financial-rules';
import { HsCodesService, normalizeHsCode } from '../hs-codes/hs-codes.service';
import {
  ALLOWED_TRANSITIONS,
  canRoleSet,
  canTransition,
  CustomsStatus,
  isBackwardTransition,
  isValidStatus,
  nextStatusesFor,
  STATUS_LABELS,
} from './status-workflow';

type AuthUser = { sub: string; role: string; companyId?: string | null };

/** Số tháng hiển thị trên biểu đồ xu hướng của dashboard. */
const TREND_MONTHS = 12;

/** Cấp được sửa nội dung hồ sơ đã duyệt và được kéo hồ sơ lùi lại. */
const MANAGER_ROLES = ['ADMIN', 'DIRECTOR'];

/**
 * Hồ sơ đã mang hiệu lực quyết định. Nhân viên vẫn sửa được hồ sơ ở các trạng
 * thái khác (kể cả "Đã nộp" hay "Đang xử lý" - sai sót thường lộ ra đúng lúc đó),
 * nhưng sửa một hồ sơ đã duyệt thì phải là cấp quản lý.
 */
const LOCKED_FOR_STAFF: CustomsStatus[] = ['APPROVED', 'COMPLETED'];

@Injectable()
export class CustomsService {
  constructor(
    private prisma: PrismaService,
    private hsCodes: HsCodesService,
  ) {}

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

  /**
   * Chuẩn bị các dòng hàng và toàn bộ số liệu tài chính của tờ khai.
   *
   * Thuế được suy ra từ chính hàng hoá (mã HS + xuất xứ từng dòng) chứ không còn
   * là một con số 10% cố định, và phí vận chuyển bám theo tổng trọng lượng - xem
   * financial-rules.ts. Gom vào một chỗ để đường tạo mới và đường sửa không bao
   * giờ tính ra hai kết quả khác nhau.
   */
  private buildFinancials(dto: CreateCustomsDto) {
    const importerCountry = (dto.importerCountry || 'VN').toUpperCase();
    const exporterCountry = (dto.exporterCountry || 'VN').toUpperCase();

    const materials = dto.materials.map((material, index) => {
      const hsCode = normalizeHsCode(material.hsCode) || null;
      const origin = material.origin ? material.origin.toUpperCase() : null;
      const tax = calcMaterialTax({ ...material, hsCode, origin }, importerCountry);
      return {
        itemNo: material.itemNo ?? index + 1,
        hsCode,
        description: material.description,
        quantity: Number(material.quantity) || 0,
        unit: material.unit,
        unitPrice: Number(material.unitPrice) || 0,
        totalPrice: tax.totalPrice,
        origin,
        weight: material.weight ?? null,
      };
    });

    const totals = calcDeclarationTotals(
      dto.materials.map((material) => ({
        hsCode: normalizeHsCode(material.hsCode) || null,
        quantity: Number(material.quantity) || 0,
        unitPrice: Number(material.unitPrice) || 0,
        origin: material.origin ? material.origin.toUpperCase() : null,
        weight: material.weight ?? null,
      })),
      {
        exporterCountry,
        importerCountry,
        transportType: dto.transportType,
        distanceKm: dto.distanceKm,
        vatRateOverride: dto.vatRate,
        // Đơn giá hàng hoá đang ghi bằng đồng tiền này, nên phí vận chuyển (niêm
        // yết bằng USD) phải quy đổi về đây mới cộng chung được.
        currency: dto.currency,
        exchangeRate: dto.exchangeRate,
      },
    );

    return { materials, totals, exporterCountry, importerCountry };
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
      materials: _ignoredMaterials,
      journeys,
      currency = 'USD',
      exporterCountry: _ignoredExporterCountry,
      importerCountry: _ignoredImporterCountry,
      distanceKm: _ignoredDistanceKm,
      exchangeRate = DEFAULT_EXCHANGE_RATE,
      vatRate: _ignoredVatRate,
      shippingFee: _ignoredShippingFee,
      leg1Origin,
      leg1Destination,
      leg2Origin,
      leg2Destination,
      ...rest
    } = dto;

    const { materials, totals, exporterCountry, importerCountry } = this.buildFinancials(dto);
    const legData = this.buildLegData(journeys, { leg1Origin, leg1Destination, leg2Origin, leg2Destination });

    const record = await this.prisma.customsRecord.create({
      data: {
        recordNo,
        ...rest,
        ...legData,
        entryDate: new Date(dto.entryDate),
        exitDate: dto.exitDate ? new Date(dto.exitDate) : undefined,
        currency,
        exporterCountry,
        importerCountry,
        ...this.toFinancialColumns(totals),
        exchangeRate,
        createdById: user.sub,
        companyId: user.companyId ?? undefined,
        materials: { create: materials },
        ...(journeys && journeys.length > 0 && { journeys: { create: journeys } }),
        // Mốc đầu tiên của nhật ký: không có bản ghi này thì dòng thời gian sẽ
        // bắt đầu lửng lơ ở lần đổi trạng thái thứ hai.
        statusHistory: {
          create: { toStatus: 'DRAFT', note: 'Khởi tạo tờ khai', changedById: user.sub },
        },
      },
      include: {
        materials: true,
        journeys: { orderBy: { legNumber: 'asc' } },
        createdBy: { select: { fullName: true, email: true } },
      },
    });

    await this.hsCodes.rememberFromMaterials(materials, user.sub);
    return record;
  }

  /** Cột leg1/leg2 là bản sao phẳng của hai chặng đầu, giữ cho tương thích ngược. */
  private buildLegData(
    journeys: CreateCustomsDto['journeys'],
    fallback: { leg1Origin?: string; leg1Destination?: string; leg2Origin?: string; leg2Destination?: string },
  ) {
    if (journeys && journeys.length > 0) {
      return {
        leg1Origin: journeys[0]?.origin || '',
        leg1Destination: journeys[0]?.destination || '',
        leg2Origin: journeys[1]?.origin ?? null,
        leg2Destination: journeys[1]?.destination ?? null,
      };
    }
    return {
      leg1Origin: fallback.leg1Origin || '',
      leg1Destination: fallback.leg1Destination || '',
      leg2Origin: fallback.leg2Origin ?? null,
      leg2Destination: fallback.leg2Destination ?? null,
    };
  }

  /** Ánh xạ kết quả tính thuế sang đúng các cột của bảng tờ khai. */
  private toFinancialColumns(totals: ReturnType<typeof calcDeclarationTotals>) {
    return {
      vatRate: totals.vatRate,
      vatAmount: totals.vatAmount,
      importDutyRate: totals.importDutyRate,
      importDutyAmount: totals.importDutyAmount,
      shippingFee: totals.shippingFee,
      totalValue: totals.totalValue,
      totalWeight: totals.totalWeight,
      distanceKm: totals.distanceKm,
      totalPayable: totals.totalPayable,
    };
  }

  /**
   * Sửa nội dung một tờ khai đã lưu.
   *
   * Trước đây chỉ có API đổi trạng thái, nên một tờ khai gõ sai địa chỉ hay sai
   * đơn giá là không còn cách nào sửa ngoài xoá đi khai lại - kể cả khi nó vẫn
   * đang ở trạng thái nháp. Ở đây nội dung sửa được ở mọi trạng thái, nhưng hồ sơ
   * đã mang hiệu lực quyết định (Đã duyệt / Hoàn thành) thì chỉ cấp quản lý được
   * sửa, và mọi lần sửa đều để lại dấu vết trong nhật ký.
   */
  async update(id: string, dto: CreateCustomsDto, user: AuthUser) {
    const existing = await this.prisma.customsRecord.findFirst({
      where: { id, ...this.toRecordScope(user) },
      select: { id: true, status: true, recordNo: true },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy tờ khai');

    if (LOCKED_FOR_STAFF.includes(existing.status as CustomsStatus) && !MANAGER_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        `Tờ khai đang ở trạng thái "${STATUS_LABELS[existing.status as CustomsStatus]}", chỉ Giám đốc hoặc Trưởng phòng được sửa nội dung.`,
      );
    }

    const nextRecordNo = (dto as any).recordNo?.trim() || existing.recordNo;
    if (nextRecordNo !== existing.recordNo) {
      const taken = await this.prisma.customsRecord.findUnique({ where: { recordNo: nextRecordNo }, select: { id: true } });
      if (taken) throw new ConflictException(`Số tờ khai "${nextRecordNo}" đã tồn tại, vui lòng nhập số khác`);
    }

    const {
      recordNo: _ignoredRecordNo,
      materials: _ignoredMaterials,
      journeys,
      currency = 'USD',
      exporterCountry: _ignoredExporterCountry,
      importerCountry: _ignoredImporterCountry,
      distanceKm: _ignoredDistanceKm,
      exchangeRate = DEFAULT_EXCHANGE_RATE,
      vatRate: _ignoredVatRate,
      shippingFee: _ignoredShippingFee,
      leg1Origin,
      leg1Destination,
      leg2Origin,
      leg2Destination,
      ...rest
    } = dto;

    const { materials, totals, exporterCountry, importerCountry } = this.buildFinancials(dto);
    const legData = this.buildLegData(journeys, { leg1Origin, leg1Destination, leg2Origin, leg2Destination });

    // Vật tư và hành trình được thay trọn bộ thay vì so từng dòng: bảng chỉ có ý
    // nghĩa như một khối, và ghép từng dòng sẽ để lại những dòng cũ mà người dùng
    // đã xoá trên giao diện.
    await this.prisma.$transaction([
      this.prisma.material.deleteMany({ where: { customsRecordId: id } }),
      this.prisma.journey.deleteMany({ where: { customsRecordId: id } }),
      this.prisma.customsRecord.update({
        where: { id },
        data: {
          recordNo: nextRecordNo,
          ...rest,
          ...legData,
          entryDate: new Date(dto.entryDate),
          exitDate: dto.exitDate ? new Date(dto.exitDate) : null,
          currency,
          exporterCountry,
          importerCountry,
          ...this.toFinancialColumns(totals),
          exchangeRate,
          materials: { create: materials },
          ...(journeys && journeys.length > 0 && { journeys: { create: journeys } }),
        },
      }),
      this.prisma.customsStatusHistory.create({
        data: {
          customsRecordId: id,
          fromStatus: existing.status as any,
          toStatus: existing.status as any,
          note: 'Cập nhật nội dung tờ khai',
          changedById: user.sub,
        },
      }),
    ]);

    await this.hsCodes.rememberFromMaterials(materials, user.sub);
    return this.findOne(id, user);
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
      sortBy?: string;
      sortDir?: string;
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
        orderBy: this.toOrderBy(options.sortBy, options.sortDir),
        include: { materials: true, createdBy: { select: { fullName: true } } },
      }),
      this.prisma.customsRecord.count({ where }),
    ]);
    return { data, total, page: options.page, limit: options.limit, totalPages: Math.ceil(total / options.limit) };
  }

  /**
   * Sắp xếp phải làm ở cơ sở dữ liệu, không phải ở giao diện.
   *
   * Bảng có phân trang 20 dòng, nên sắp xếp trên trang hiện tại chỉ đổi thứ tự của
   * đúng 20 dòng đó - bấm "Tổng tiền giảm dần" mà tờ khai to nhất nằm ở trang 3 thì
   * vẫn không thấy. Chỉ nhận đúng các cột trong danh sách trắng này để không ai
   * truyền tên cột tuỳ ý vào truy vấn.
   */
  private toOrderBy(sortBy?: string, sortDir?: string) {
    const allowed = [
      'recordNo',
      'entryDate',
      'exitDate',
      'transportType',
      'exporterName',
      'importerName',
      'totalPayable',
      'totalWeight',
      'status',
      'createdAt',
      'updatedAt',
    ];
    const field = allowed.includes(String(sortBy)) ? String(sortBy) : 'createdAt';
    const direction = String(sortDir).toLowerCase() === 'asc' ? 'asc' : 'desc';
    // Tờ khai chưa có ngày kết thúc thì xếp xuống cuối, đừng để null chen lên đầu.
    return field === 'exitDate'
      ? [{ exitDate: { sort: direction, nulls: 'last' } } as any]
      : [{ [field]: direction } as any];
  }

  async findOne(id: string, user: AuthUser) {
    const record = await this.prisma.customsRecord.findFirst({
      where: { id, ...this.toRecordScope(user) },
      include: {
        materials: true,
        attachments: true,
        journeys: { orderBy: { legNumber: 'asc' } },
        createdBy: { select: { fullName: true, email: true } },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          include: { changedBy: { select: { fullName: true, role: true } } },
        },
      },
    });
    if (!record) throw new NotFoundException('Không tìm thấy tờ khai');
    return record;
  }

  async updateStatus(id: string, status: string, user: AuthUser, note?: string) {
    if (!isValidStatus(status)) throw new BadRequestException(`Trạng thái "${status}" không hợp lệ`);

    const found = await this.prisma.customsRecord.findFirst({
      where: { id, ...this.toRecordScope(user) },
      select: { id: true, status: true, recordNo: true },
    });
    if (!found) throw new ForbiddenException('Bạn không có quyền cập nhật tờ khai này');

    const from = found.status as CustomsStatus;
    if (from === status) return this.findOne(id, user);

    if (!canTransition(from, status)) {
      const allowed = ALLOWED_TRANSITIONS[from].map((next) => STATUS_LABELS[next]);
      throw new BadRequestException(
        allowed.length === 0
          ? `Tờ khai đã ở trạng thái "${STATUS_LABELS[from]}" và không thể chuyển tiếp.`
          : `Không thể chuyển từ "${STATUS_LABELS[from]}" sang "${STATUS_LABELS[status]}". Bước hợp lệ tiếp theo: ${allowed.join(', ')}.`,
      );
    }

    if (!canRoleSet(user.role, status, from)) {
      throw new ForbiddenException(
        isBackwardTransition(from, status)
          ? `Chỉ Giám đốc hoặc Trưởng phòng được đưa tờ khai từ "${STATUS_LABELS[from]}" về "${STATUS_LABELS[status]}"`
          : `Vai trò của bạn không được phép chuyển tờ khai sang "${STATUS_LABELS[status]}"`,
      );
    }

    // Ghi nhật ký cùng transaction với việc đổi trạng thái, để không xảy ra tình
    // huống trạng thái đã đổi nhưng không còn dấu vết ai là người đổi.
    const [record] = await this.prisma.$transaction([
      this.prisma.customsRecord.update({ where: { id }, data: { status: status as any } }),
      this.prisma.customsStatusHistory.create({
        data: { customsRecordId: id, fromStatus: from as any, toStatus: status as any, note, changedById: user.sub },
      }),
    ]);

    return record;
  }

  /** Các bước tiếp theo mà vai trò hiện tại được phép thực hiện. */
  async getAvailableTransitions(id: string, user: AuthUser) {
    const record = await this.prisma.customsRecord.findFirst({
      where: { id, ...this.toRecordScope(user) },
      select: { status: true },
    });
    if (!record) throw new NotFoundException('Không tìm thấy tờ khai');
    return {
      current: record.status,
      next: nextStatusesFor(record.status as CustomsStatus, user.role).map((status) => ({
        status,
        label: STATUS_LABELS[status],
      })),
    };
  }

  async remove(id: string, user: AuthUser) {
    const record = await this.findOne(id, user);
    return this.prisma.customsRecord.delete({ where: { id: record.id } });
  }

  /**
   * Quy đổi về USD trước khi cộng dồn. Mỗi tờ khai tự mang tỷ giá của nó, nên
   * cộng thẳng totalPayable sẽ trộn lẫn con số VND với USD và cho ra tổng vô nghĩa.
   */
  private toUsd(amount: number, currency: string, exchangeRate: number) {
    const value = Number(amount) || 0;
    if ((currency || 'USD').toUpperCase() !== 'VND') return value;
    const rate = Number(exchangeRate) || DEFAULT_EXCHANGE_RATE;
    return rate > 0 ? value / rate : value;
  }

  private monthKey(date: Date) {
    return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
  }

  async getStats(user: AuthUser) {
    const where = this.toRecordScope(user);
    const now = new Date();

    const [total, byStatus, byTransport, records] = await Promise.all([
      this.prisma.customsRecord.count({ where }),
      this.prisma.customsRecord.groupBy({ by: ['status'], _count: true, where }),
      this.prisma.customsRecord.groupBy({ by: ['transportType'], _count: true, where }),
      this.prisma.customsRecord.findMany({
        where,
        select: {
          entryDate: true,
          totalPayable: true,
          totalValue: true,
          vatAmount: true,
          currency: true,
          exchangeRate: true,
          importerName: true,
        },
      }),
    ]);

    // Dựng sẵn 12 bucket tháng để tháng không có hồ sơ vẫn hiện trên biểu đồ
    // (thiếu bucket thì đường xu hướng sẽ nối tắt và bóp méo hình dạng dữ liệu).
    const trendBuckets = new Map<string, { month: string; count: number; value: number }>();
    for (let offset = TREND_MONTHS - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = this.monthKey(date);
      trendBuckets.set(key, { month: key, count: 0, value: 0 });
    }

    const currentKey = this.monthKey(now);
    const previousKey = this.monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const totals = { payable: 0, value: 0, vat: 0 };
    const companyTotals = new Map<string, { name: string; count: number; value: number }>();

    for (const record of records) {
      const payable = this.toUsd(record.totalPayable, record.currency, record.exchangeRate);
      totals.payable += payable;
      totals.value += this.toUsd(record.totalValue, record.currency, record.exchangeRate);
      totals.vat += this.toUsd(record.vatAmount, record.currency, record.exchangeRate);

      const bucket = trendBuckets.get(this.monthKey(record.entryDate));
      if (bucket) {
        bucket.count += 1;
        bucket.value += payable;
      }

      const name = (record.importerName || '').trim() || 'Không xác định';
      const company = companyTotals.get(name) ?? { name, count: 0, value: 0 };
      company.count += 1;
      company.value += payable;
      companyTotals.set(name, company);
    }

    const round = (n: number) => Number(n.toFixed(2));
    const trend = [...trendBuckets.values()].map((b) => ({ ...b, value: round(b.value) }));
    const currentCount = trendBuckets.get(currentKey)?.count ?? 0;
    const previousCount = trendBuckets.get(previousKey)?.count ?? 0;

    const topCompanies = [...companyTotals.values()]
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map((c) => ({ ...c, value: round(c.value) }));

    return {
      total,
      byStatus,
      byTransport,
      // Mọi số tiền dưới đây đã quy đổi về USD
      currency: 'USD',
      totals: { payable: round(totals.payable), value: round(totals.value), vat: round(totals.vat) },
      trend,
      momentum: {
        currentCount,
        previousCount,
        // Không có nền so sánh thì đừng bịa ra 100% tăng trưởng
        changePct: previousCount === 0 ? null : round(((currentCount - previousCount) / previousCount) * 100),
      },
      topCompanies,
    };
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
