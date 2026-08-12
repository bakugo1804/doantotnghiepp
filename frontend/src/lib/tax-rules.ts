/**
 * Bản sao quy tắc thuế & phí để xem trước ngay trên form.
 *
 * GIỮ KHỚP với backend/src/customs/financial-rules.ts - backend mới là nơi chốt
 * số liệu lưu xuống cơ sở dữ liệu. Lệch nhau thì con số người dùng thấy lúc đang
 * gõ sẽ khác con số hiện ra sau khi lưu, và không ai biết bên nào đúng.
 */

// Tỷ giá mặc định lấy từ money.ts thay vì viết lại số 25000 ở đây: cùng một con số
// nằm ở hai chỗ thì sớm muộn cũng có chỗ được sửa mà chỗ kia bị bỏ quên.
import { DEFAULT_EXCHANGE_RATE } from './money';

export const DEFAULT_VAT_RATE = 10;

/** Chương mã HS = 2 chữ số đầu. "8471.30" -> "84". */
export function hsChapter(hsCode?: string | null): string {
  const digits = String(hsCode ?? '').replace(/\D/g, '');
  return digits.length >= 2 ? digits.slice(0, 2) : '';
}

/**
 * Chuẩn hoá mã HS về dạng "8471.30" / "8471.30.00" - khớp normalizeHsCode ở backend.
 * Cấu trúc là 4 chữ số nhóm rồi từng cặp phân nhóm, không phải cắt đều 2 chữ số.
 */
export function normalizeHsCode(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return digits;
  return [digits.slice(0, 4), ...(digits.slice(4).match(/\d{1,2}/g) ?? [])].join('.');
}

export function isValidHsCode(value: unknown): boolean {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 4 && digits.length <= 10;
}

export const VAT_BY_HS_CHAPTER: Record<string, number> = {
  '01': 5, '02': 5, '03': 5, '04': 5, '07': 5, '08': 5, '10': 5, '12': 5,
  '30': 5, '90': 5,
  '31': 5, '23': 5,
  '49': 0,
  '39': 8, '48': 8, '52': 8, '61': 8, '62': 8, '64': 8, '72': 8, '73': 8,
  '84': 8, '85': 8, '87': 8, '94': 8,
};

export function getVatRateByHsCode(hsCode?: string | null): number {
  const chapter = hsChapter(hsCode);
  return chapter && chapter in VAT_BY_HS_CHAPTER ? VAT_BY_HS_CHAPTER[chapter] : DEFAULT_VAT_RATE;
}

export const IMPORT_DUTY_BY_HS_CHAPTER: Record<string, number> = {
  '84': 5, '85': 5, '90': 3,
  '52': 5, '54': 5, '55': 5, '41': 3,
  '39': 6.5, '28': 3, '29': 3, '72': 3, '73': 10,
  '61': 20, '62': 20, '64': 30, '94': 25,
  '87': 35,
  '02': 15, '04': 10, '08': 20, '10': 10, '19': 25, '22': 35,
  '30': 0, '49': 0,
};

const DEFAULT_IMPORT_DUTY = 10;

const FTA_PREFERENCE: Record<string, number> = {
  TH: 1, SG: 1, MY: 1, ID: 1, PH: 1, KH: 1, LA: 1, MM: 1, BN: 1,
  CN: 0.8, KR: 0.85, JP: 0.85, IN: 0.6, AU: 0.9, NZ: 0.9,
  EU: 0.75, DE: 0.75, FR: 0.75, IT: 0.75, NL: 0.75, ES: 0.75, GB: 0.75,
  CA: 0.7, MX: 0.7,
  US: 0, RU: 0, TR: 0, ZA: 0, BR: 0, AE: 0, SA: 0, TW: 0, HK: 0,
};

const upper = (value?: string | null) => String(value || 'VN').toUpperCase();

export function getImportDutyRate(hsCode?: string | null, originCountry?: string | null, importerCountry?: string | null): number {
  const origin = upper(originCountry);
  const destination = upper(importerCountry);
  if (origin === destination) return 0;
  const chapter = hsChapter(hsCode);
  const mfn = chapter && chapter in IMPORT_DUTY_BY_HS_CHAPTER ? IMPORT_DUTY_BY_HS_CHAPTER[chapter] : DEFAULT_IMPORT_DUTY;
  const preference = FTA_PREFERENCE[origin] ?? 0;
  return Number((mfn * (1 - preference)).toFixed(2));
}

const TRANSPORT_RATES: Record<string, { base: number; perKg: number; perKgPer1000Km: number }> = {
  AIR: { base: 35, perKg: 4.5, perKgPer1000Km: 1.2 },
  SEA: { base: 60, perKg: 0.35, perKgPer1000Km: 0.08 },
  RAIL: { base: 45, perKg: 0.9, perKgPer1000Km: 0.25 },
  ROAD: { base: 25, perKg: 1.4, perKgPer1000Km: 0.45 },
};

const ROUTE_MULTIPLIER: Record<string, number> = {
  'VN-CN': 1.1, 'VN-TH': 1.05, 'VN-SG': 1.05, 'VN-KR': 1.2, 'VN-JP': 1.25, 'VN-US': 1.5, 'VN-EU': 1.45,
};

const ESTIMATED_DISTANCE_KM: Record<string, number> = {
  'VN-CN': 1800, 'VN-TH': 1000, 'VN-SG': 1100, 'VN-MY': 1500, 'VN-ID': 2500,
  'VN-PH': 1600, 'VN-KH': 500, 'VN-LA': 600, 'VN-MM': 1500, 'VN-KR': 3200,
  'VN-JP': 4000, 'VN-TW': 2200, 'VN-HK': 1200, 'VN-IN': 3500, 'VN-AU': 6500,
  'VN-US': 13000, 'VN-EU': 9500, 'VN-DE': 9500, 'VN-FR': 10000, 'VN-GB': 10000,
};

function lookupRoute<T>(table: Record<string, T>, from: string, to: string): T | undefined {
  return table[`${from}-${to}`] ?? table[`${to}-${from}`];
}

/** Bậc giảm giá theo khối lượng - biểu giá vận tải giảm dần khi lô hàng lớn hơn. */
const WEIGHT_BREAKS: [number, number][] = [
  [100, 1],
  [1_000, 0.6],
  [10_000, 0.35],
  [Infinity, 0.2],
];

/** Trọng lượng tính phí sau khi áp bậc giảm giá; lô dưới 100kg giữ nguyên. */
function chargeableWeight(weightKg: number): number {
  let remaining = Math.max(weightKg, 0);
  let previousLimit = 0;
  let chargeable = 0;
  for (const [limit, factor] of WEIGHT_BREAKS) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, limit - previousLimit);
    chargeable += slice * factor;
    remaining -= slice;
    previousLimit = limit;
  }
  return chargeable;
}

export function resolveDistanceKm(distanceKm: number | undefined, exporterCountry?: string, importerCountry?: string): number {
  const declared = Number(distanceKm);
  if (Number.isFinite(declared) && declared > 0) return declared;
  const from = upper(exporterCountry);
  const to = upper(importerCountry);
  if (from === to) return 300;
  return lookupRoute(ESTIMATED_DISTANCE_KM, from, to) ?? 5000;
}

/**
 * Phí vận chuyển, TRẢ VỀ BẰNG USD - biểu giá quốc tế luôn niêm yết bằng USD.
 * Người gọi phải quy đổi sang đồng tiền của tờ khai (xem previewTotals).
 */
export function calculateShippingFee(input: {
  distanceKm?: number;
  weightKg?: number;
  transportType?: string;
  exporterCountry?: string;
  importerCountry?: string;
}): number {
  const from = upper(input.exporterCountry);
  const to = upper(input.importerCountry);
  const rates = TRANSPORT_RATES[String(input.transportType || 'SEA').toUpperCase()] ?? TRANSPORT_RATES.SEA;
  const distance = resolveDistanceKm(input.distanceKm, from, to);
  const weight = Math.max(Number(input.weightKg) || 0, 1);
  const billableWeight = chargeableWeight(weight);
  const multiplier = lookupRoute(ROUTE_MULTIPLIER, from, to) ?? (from === to ? 1 : 1.15);
  return Number(
    ((rates.base + billableWeight * rates.perKg + billableWeight * rates.perKgPer1000Km * (distance / 1000)) * multiplier).toFixed(2),
  );
}

export type PreviewMaterial = {
  hsCode?: string | null;
  quantity: number;
  unitPrice: number;
  origin?: string | null;
  weight?: number | null;
};

export type TaxPreview = {
  totalValue: number;
  totalWeight: number;
  importDutyRate: number;
  importDutyAmount: number;
  vatRate: number;
  vatAmount: number;
  shippingFee: number;
  totalPayable: number;
  distanceKm: number;
  /** Thuế của từng dòng hàng, để giải thích tại sao ra con số đó. */
  lines: { totalPrice: number; dutyRate: number; dutyAmount: number; vatRate: number; vatAmount: number }[];
};

function weightedRate(pairs: [number, number][]): number {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) {
    return pairs.length ? Number((pairs.reduce((sum, [rate]) => sum + rate, 0) / pairs.length).toFixed(2)) : 0;
  }
  return Number((pairs.reduce((sum, [rate, weight]) => sum + rate * weight, 0) / total).toFixed(2));
}

/** Quy đổi một số tiền USD sang đồng tiền của tờ khai - khớp fromUsd ở backend. */
function fromUsd(amountUsd: number, currency?: string, exchangeRate?: number): number {
  if (String(currency || 'USD').toUpperCase() !== 'VND') return Number(amountUsd.toFixed(2));
  const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : DEFAULT_EXCHANGE_RATE;
  return Math.round(amountUsd * rate);
}

/**
 * Xem trước toàn bộ số liệu tài chính của tờ khai đang nhập.
 * Mọi số trả về đều tính bằng đồng tiền của tờ khai (`options.currency`).
 */
export function previewTotals(
  materials: PreviewMaterial[],
  options: {
    exporterCountry?: string;
    importerCountry?: string;
    transportType?: string;
    distanceKm?: number;
    /** Đồng tiền đang dùng để ghi đơn giá hàng hoá. */
    currency?: string;
    exchangeRate?: number;
  },
): TaxPreview {
  const lines = materials.map((material) => {
    const totalPrice = Number(((Number(material.quantity) || 0) * (Number(material.unitPrice) || 0)).toFixed(2));
    const dutyRate = getImportDutyRate(material.hsCode, material.origin, options.importerCountry);
    const dutyAmount = Number(((totalPrice * dutyRate) / 100).toFixed(2));
    const vatRate = getVatRateByHsCode(material.hsCode);
    const vatAmount = Number((((totalPrice + dutyAmount) * vatRate) / 100).toFixed(2));
    return { totalPrice, dutyRate, dutyAmount, vatRate, vatAmount };
  });

  const totalValue = Number(lines.reduce((sum, line) => sum + line.totalPrice, 0).toFixed(2));
  const totalWeight = Number(materials.reduce((sum, m) => sum + (Number(m.weight) || 0), 0).toFixed(3));
  const importDutyAmount = Number(lines.reduce((sum, line) => sum + line.dutyAmount, 0).toFixed(2));
  const vatAmount = Number(lines.reduce((sum, line) => sum + line.vatAmount, 0).toFixed(2));
  const distanceKm = resolveDistanceKm(options.distanceKm, options.exporterCountry, options.importerCountry);
  // Biểu giá vận chuyển bằng USD, phải quy đổi về đồng tiền của tờ khai trước khi
  // cộng vào tổng - nếu không, tờ khai ghi bằng VND sẽ hiện "52 đồng" phí vận
  // chuyển thay vì 1.295.250 đồng.
  const shippingFee = fromUsd(
    calculateShippingFee({
      distanceKm,
      weightKg: totalWeight,
      transportType: options.transportType,
      exporterCountry: options.exporterCountry,
      importerCountry: options.importerCountry,
    }),
    options.currency,
    options.exchangeRate,
  );

  return {
    totalValue,
    totalWeight,
    importDutyRate: weightedRate(lines.map((line) => [line.dutyRate, line.totalPrice])),
    importDutyAmount,
    vatRate: weightedRate(lines.map((line) => [line.vatRate, line.totalPrice + line.dutyAmount])),
    vatAmount,
    shippingFee,
    totalPayable: Number((totalValue + importDutyAmount + vatAmount + shippingFee).toFixed(2)),
    distanceKm,
    lines,
  };
}
