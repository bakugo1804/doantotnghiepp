import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getVatRateByHsCode } from '../customs/financial-rules';

/**
 * Chuẩn hoá mã HS về dạng "8471.30" / "8471.30.00".
 *
 * Người dùng gõ đủ kiểu: "847130", "8471 30", "8471.30.00". Không chuẩn hoá thì
 * cùng một mặt hàng sinh ra nhiều bản ghi khác nhau trong danh mục, và bảng tra
 * thuế theo chương cũng đọc sai.
 *
 * Cấu trúc mã HS là 4 chữ số nhóm rồi từng cặp phân nhóm (XXXX.XX.XX), KHÔNG phải
 * cắt đều 2 chữ số một - cắt đều sẽ biến "8471.30" thành "84.71.30".
 */
export function normalizeHsCode(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return digits;
  const heading = digits.slice(0, 4);
  const rest = digits.slice(4).match(/\d{1,2}/g) ?? [];
  return [heading, ...rest].join('.');
}

/** Mã HS hợp lệ có ít nhất 4 chữ số (nhóm) và nhiều nhất 10 (phân nhóm chi tiết). */
export function isValidHsCode(value: unknown): boolean {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 4 && digits.length <= 10;
}

type HsCodeInput = {
  code?: string;
  description?: string;
  defaultUnit?: string | null;
  vatRate?: number | null;
  notes?: string | null;
};

@Injectable()
export class HsCodesService {
  constructor(private prisma: PrismaService) {}

  async findAll(search?: string) {
    const term = (search || '').trim();
    const items = await this.prisma.hsCode.findMany({
      where: term
        ? {
            OR: [
              { code: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: { createdBy: { select: { id: true, fullName: true } } },
      orderBy: [{ code: 'asc' }],
    });

    // Đếm số tờ khai đang dùng từng mã, để biết mã nào xoá được mà không mất dấu vết.
    const usage = await this.prisma.material.groupBy({
      by: ['hsCode'],
      _count: { _all: true },
    });
    const usageMap = new Map(usage.map((row) => [row.hsCode, row._count._all]));

    return items.map((item) => ({
      ...item,
      // Thuế suất thực tế đang áp: giá trị ấn định riêng, nếu không thì suy theo chương.
      effectiveVatRate: item.vatRate ?? getVatRateByHsCode(item.code),
      usageCount: usageMap.get(item.code) ?? 0,
    }));
  }

  async create(data: HsCodeInput, userId: string) {
    const code = normalizeHsCode(data.code);
    const description = (data.description || '').trim();
    if (!isValidHsCode(code)) throw new BadRequestException('Mã HS phải có từ 4 đến 10 chữ số, ví dụ 8471.30');
    if (!description) throw new BadRequestException('Vui lòng nhập tên hàng hoá cho mã HS này');

    const existing = await this.prisma.hsCode.findUnique({ where: { code } });
    if (existing) throw new ConflictException(`Mã HS ${code} đã có trong danh mục`);

    return this.prisma.hsCode.create({
      data: {
        code,
        description,
        defaultUnit: data.defaultUnit?.trim() || null,
        vatRate: data.vatRate ?? null,
        notes: data.notes?.trim() || null,
        autoCreated: false,
        createdById: userId,
      },
    });
  }

  async update(id: string, data: HsCodeInput) {
    const existing = await this.prisma.hsCode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy mã HS');

    const nextCode = data.code !== undefined ? normalizeHsCode(data.code) : existing.code;
    if (!isValidHsCode(nextCode)) throw new BadRequestException('Mã HS phải có từ 4 đến 10 chữ số, ví dụ 8471.30');
    if (nextCode !== existing.code) {
      const duplicate = await this.prisma.hsCode.findUnique({ where: { code: nextCode } });
      if (duplicate) throw new ConflictException(`Mã HS ${nextCode} đã có trong danh mục`);
    }

    const description = data.description !== undefined ? data.description.trim() : existing.description;
    if (!description) throw new BadRequestException('Tên hàng hoá không được để trống');

    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.hsCode.update({
        where: { id },
        data: {
          code: nextCode,
          description,
          defaultUnit: data.defaultUnit !== undefined ? data.defaultUnit?.trim() || null : existing.defaultUnit,
          vatRate: data.vatRate !== undefined ? data.vatRate : existing.vatRate,
          notes: data.notes !== undefined ? data.notes?.trim() || null : existing.notes,
          // Người dùng đã chủ động sửa thì không còn là bản ghi tự sinh nữa.
          autoCreated: false,
        },
      });

      // Đổi mã thì đổi luôn trên các dòng hàng đang dùng mã cũ, nếu không tờ khai
      // sẽ trỏ tới một mã không còn tồn tại trong danh mục.
      if (nextCode !== existing.code) {
        await tx.material.updateMany({ where: { hsCode: existing.code }, data: { hsCode: nextCode } });
      }

      return saved;
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.hsCode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy mã HS');

    const inUse = await this.prisma.material.count({ where: { hsCode: existing.code } });
    if (inUse > 0) {
      throw new ConflictException(
        `Mã HS ${existing.code} đang được dùng ở ${inUse} dòng hàng trong các tờ khai, không thể xoá.`,
      );
    }
    return this.prisma.hsCode.delete({ where: { id } });
  }

  /**
   * Bổ sung vào danh mục những mã HS vừa được khai trên một tờ khai.
   *
   * Đây là điểm khiến danh mục tự dày lên theo thời gian: nhân viên gặp mặt hàng
   * mới chỉ cần khai một lần ngay trên tờ khai, lần sau mã đó đã có sẵn để chọn.
   * Mã đã có trong danh mục thì giữ nguyên - tên hàng trong danh mục là bản đã
   * được duyệt, không để một tờ khai lẻ ghi đè lên.
   */
  async rememberFromMaterials(
    materials: { hsCode?: string | null; description?: string | null; unit?: string | null }[],
    userId: string,
  ): Promise<number> {
    const candidates = new Map<string, { description: string; unit?: string | null }>();

    for (const material of materials) {
      const code = normalizeHsCode(material.hsCode);
      const description = (material.description || '').trim();
      if (!isValidHsCode(code) || !description || candidates.has(code)) continue;
      candidates.set(code, { description, unit: material.unit ?? null });
    }
    if (candidates.size === 0) return 0;

    const existing = await this.prisma.hsCode.findMany({
      where: { code: { in: [...candidates.keys()] } },
      select: { code: true },
    });
    for (const row of existing) candidates.delete(row.code);
    if (candidates.size === 0) return 0;

    // Lỗi ở bước này không được làm hỏng việc lưu tờ khai: tờ khai là dữ liệu
    // nghiệp vụ, còn danh mục chỉ là tiện ích gợi ý.
    try {
      const result = await this.prisma.hsCode.createMany({
        data: [...candidates.entries()].map(([code, value]) => ({
          code,
          description: value.description,
          defaultUnit: value.unit?.trim() || null,
          autoCreated: true,
          createdById: userId,
        })),
        skipDuplicates: true,
      });
      return result.count;
    } catch (error) {
      console.error('Không bổ sung được mã HS vào danh mục:', error);
      return 0;
    }
  }
}
