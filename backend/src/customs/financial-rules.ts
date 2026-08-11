/**
 * QUY TẮC TÍNH THUẾ VÀ PHÍ - nguồn duy nhất cho mọi con số tài chính của tờ khai.
 *
 * Trước đây mọi tờ khai đều ra 10% VAT dù là hàng gì, đi từ đâu về đâu: thuế suất
 * chỉ tra theo nước nhập khẩu, mà nước nhập khẩu gần như luôn là VN nên bảng tra
 * đó không bao giờ đổi kết quả. Phí vận chuyển thì hoàn toàn bỏ qua trọng lượng,
 * nên gửi 3kg và 30kg tính tiền y như nhau.
 *
 * Bản này suy ra thuế từ chính hàng hoá được khai:
 *  - VAT theo chương mã HS (nhóm hàng), vì luật quy định 0%/5%/8%/10% theo mặt hàng.
 *  - Thuế nhập khẩu theo chương mã HS và xuất xứ, vì hàng từ nước có hiệp định
 *    thương mại tự do được hưởng thuế ưu đãi; hàng trong nước thì không có thuế
 *    nhập khẩu nào cả.
 *  - Phí vận chuyển theo trọng lượng, phương thức và tuyến.
 */

export const DEFAULT_EXCHANGE_RATE = 25000;

/** Thuế suất VAT mặc định khi không tra được mặt hàng. */
export const DEFAULT_VAT_RATE = 10;

/** Chương mã HS = 2 chữ số đầu. "8471.30" -> "84". */
function hsChapter(hsCode?: string | null): string {
  const digits = String(hsCode ?? '').replace(/\D/g, '');
  return digits.length >= 2 ? digits.slice(0, 2) : '';
}

function normalizeCountry(country?: string | null) {
  return String(country || 'VN').toUpperCase();
}

// ==================== VAT ====================

/**
 * VAT theo chương mã HS.
 *
 * Chỉ liệt kê những nhóm KHÁC mức phổ thông 10%; còn lại rơi về DEFAULT_VAT_RATE.
 * Bảng này là mô hình đơn giản hoá cho phạm vi đồ án, không phải biểu thuế đầy đủ.
 */
export const VAT_BY_HS_CHAPTER: Record<string, number> = {
  // Nông sản, thực phẩm chưa chế biến sâu - nhóm chịu thuế thấp
  '01': 5, '02': 5, '03': 5, '04': 5, '07': 5, '08': 5, '10': 5, '12': 5,
  // Thuốc và thiết bị y tế
  '30': 5, '90': 5,
  // Phân bón, thức ăn chăn nuôi
  '31': 5, '23': 5,
  // Sách, báo, xuất bản phẩm - không chịu VAT
  '49': 0,
  // Nhóm được giảm còn 8% theo chính sách hỗ trợ
  '39': 8, '48': 8, '52': 8, '61': 8, '62': 8, '64': 8, '72': 8, '73': 8,
  '84': 8, '85': 8, '87': 8, '94': 8,
};

/** Thuế suất VAT của một mặt hàng, suy từ mã HS. */
export function getVatRateByHsCode(hsCode?: string | null): number {
  const chapter = hsChapter(hsCode);
  return chapter && chapter in VAT_BY_HS_CHAPTER ? VAT_BY_HS_CHAPTER[chapter] : DEFAULT_VAT_RATE;
}

// ==================== Thuế nhập khẩu ====================

/**
 * Thuế nhập khẩu thông thường (MFN) theo chương mã HS.
 *
 * Hàng nguyên liệu, máy móc phục vụ sản xuất chịu thuế thấp; hàng tiêu dùng
 * hoàn chỉnh chịu thuế cao để bảo hộ sản xuất trong nước.
 */
export const IMPORT_DUTY_BY_HS_CHAPTER: Record<string, number> = {
  // Máy móc, thiết bị, linh kiện điện tử
  '84': 5, '85': 5, '90': 3,
  // Nguyên liệu dệt may, da
  '52': 5, '54': 5, '55': 5, '41': 3,
  // Nhựa, hoá chất, thép
  '39': 6.5, '28': 3, '29': 3, '72': 3, '73': 10,
  // Hàng tiêu dùng hoàn chỉnh
  '61': 20, '62': 20, '64': 30, '94': 25,
  // Xe và phụ tùng
  '87': 35,
  // Thực phẩm, nông sản
  '02': 15, '04': 10, '08': 20, '10': 10, '19': 25, '22': 35,
  // Dược phẩm, sách - ưu tiên 0%
  '30': 0, '49': 0,
};

/** Thuế nhập khẩu MFN mặc định khi không tra được nhóm hàng. */
const DEFAULT_IMPORT_DUTY = 10;

/**
 * Mức giảm thuế nhập khẩu theo hiệp định thương mại, tính theo tỷ lệ của thuế MFN.
 * 1 = xoá hết thuế, 0 = không được ưu đãi gì.
 */
const FTA_PREFERENCE: Record<string, number> = {
  // ATIGA - nội khối ASEAN, gần như xoá hoàn toàn
  TH: 1, SG: 1, MY: 1, ID: 1, PH: 1, KH: 1, LA: 1, MM: 1, BN: 1,
  // ACFTA, AKFTA, VJEPA, AIFTA, AANZFTA
  CN: 0.8, KR: 0.85, JP: 0.85, IN: 0.6, AU: 0.9, NZ: 0.9,
  // EVFTA, UKVFTA
  EU: 0.75, DE: 0.75, FR: 0.75, IT: 0.75, NL: 0.75, ES: 0.75, GB: 0.75,
  // CPTPP
  CA: 0.7, MX: 0.7,
  // Không có hiệp định -> chịu thuế MFN đầy đủ
  US: 0, RU: 0, TR: 0, ZA: 0, BR: 0, AE: 0, SA: 0, TW: 0, HK: 0,
};

/**
 * Thuế nhập khẩu của một mặt hàng.
 *
 * Hàng có xuất xứ trong nước và giao trong nước thì không phát sinh thuế nhập
 * khẩu - đây chính là điểm khiến "ship trong nước hay ngoài nước" phải khác nhau.
 */
export function getImportDutyRate(
  hsCode?: string | null,
  originCountry?: string | null,
  importerCountry?: string | null,
): number {
  const origin = normalizeCountry(originCountry);
  const destination = normalizeCountry(importerCountry);
  if (origin === destination) return 0;

  const chapter = hsChapter(hsCode);
  const mfn = chapter && chapter in IMPORT_DUTY_BY_HS_CHAPTER ? IMPORT_DUTY_BY_HS_CHAPTER[chapter] : DEFAULT_IMPORT_DUTY;
  const preference = FTA_PREFERENCE[origin] ?? 0;
  return Number((mfn * (1 - preference)).toFixed(2));
}

// ==================== Phí vận chuyển ====================

/**
 * Đơn giá theo phương thức, TÍNH BẰNG USD: phí cố định, đơn giá mỗi kg, đơn giá
 * mỗi kg mỗi 1000km.
 *
 * Đây là biểu giá quốc tế nên luôn niêm yết bằng USD. Tờ khai ghi bằng VND thì
 * phải quy đổi trước khi cộng vào tổng - xem calcDeclarationTotals.
 */
const TRANSPORT_RATES: Record<string, { base: number; perKg: number; perKgPer1000Km: number }> = {
  // Hàng không nhanh nhưng đắt nhất và nhạy nhất với trọng lượng
  AIR: { base: 35, perKg: 4.5, perKgPer1000Km: 1.2 },
  // Đường biển rẻ nhất, phí gần như chỉ phụ thuộc khối lượng lớn
  SEA: { base: 60, perKg: 0.35, perKgPer1000Km: 0.08 },
  RAIL: { base: 45, perKg: 0.9, perKgPer1000Km: 0.25 },
  ROAD: { base: 25, perKg: 1.4, perKgPer1000Km: 0.45 },
};

/** Hệ số theo tuyến - chặng xa và thị trường khó đi thì đắt hơn. */
const ROUTE_MULTIPLIER: Record<string, number> = {
  'VN-CN': 1.1,
  'VN-TH': 1.05,
  'VN-SG': 1.05,
  'VN-KR': 1.2,
  'VN-JP': 1.25,
  'VN-US': 1.5,
  'VN-EU': 1.45,
};

/** Khoảng cách ước lượng (km) khi tờ khai không ghi rõ, để phí vẫn phản ánh tuyến. */
const ESTIMATED_DISTANCE_KM: Record<string, number> = {
  'VN-CN': 1800, 'VN-TH': 1000, 'VN-SG': 1100, 'VN-MY': 1500, 'VN-ID': 2500,
  'VN-PH': 1600, 'VN-KH': 500, 'VN-LA': 600, 'VN-MM': 1500, 'VN-KR': 3200,
  'VN-JP': 4000, 'VN-TW': 2200, 'VN-HK': 1200, 'VN-IN': 3500, 'VN-AU': 6500,
  'VN-US': 13000, 'VN-EU': 9500, 'VN-DE': 9500, 'VN-FR': 10000, 'VN-GB': 10000,
};

/**
 * Bậc giảm giá theo khối lượng: [trọng lượng tối đa của bậc (kg), hệ số đơn giá].
 *
 * Biểu giá vận tải thật luôn giảm dần theo khối lượng - gửi 1 kg và gửi 100 tấn
 * không thể cùng đơn giá mỗi kg. Nếu để đơn giá phẳng thì một lô 150 tấn thép có
 * phí vận chuyển cao hơn cả trị giá lô hàng, đúng công thức nhưng vô lý.
 */
const WEIGHT_BREAKS: [number, number][] = [
  [100, 1],
  [1_000, 0.6],
  [10_000, 0.35],
  [Infinity, 0.2],
];

/**
 * "Trọng lượng tính phí": trọng lượng thật sau khi áp bậc giảm giá.
 *
 * Lô nhỏ (dưới 100kg) giữ nguyên trọng lượng thật nên phí của hàng lẻ không đổi.
 */
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

function routeKey(from: string, to: string) {
  return `${from}-${to}`;
}

function lookupRoute<T>(table: Record<string, T>, from: string, to: string): T | undefined {
  return table[routeKey(from, to)] ?? table[routeKey(to, from)];
}

/** Khoảng cách dùng để tính phí: ưu tiên số người khai nhập, không có thì ước lượng theo tuyến. */
export function resolveDistanceKm(distanceKm: number | undefined, exporterCountry?: string, importerCountry?: string): number {
  const declared = Number(distanceKm);
  if (Number.isFinite(declared) && declared > 0) return declared;

  const from = normalizeCountry(exporterCountry);
  const to = normalizeCountry(importerCountry);
  if (from === to) return 300; // Nội địa: coi như một chặng trung bình trong nước
  return lookupRoute(ESTIMATED_DISTANCE_KM, from, to) ?? 5000;
}

/**
 * Phí vận chuyển của cả lô hàng, TRẢ VỀ BẰNG USD.
 *
 * Trọng lượng là biến chính: cùng một tuyến, 3kg và 30kg phải ra hai con số khác
 * nhau. Lô không khai trọng lượng vẫn phải có phí, nên dùng mức tối thiểu thay vì
 * cho ra 0.
 *
 * Người gọi có trách nhiệm quy đổi sang đồng tiền của tờ khai. Cộng thẳng con số
 * này vào một tổng đang tính bằng VND sẽ ra "52 đồng" phí vận chuyển thay vì
 * 1.295.250 đồng.
 */
export function calculateShippingFee(input: {
  distanceKm?: number;
  weightKg?: number;
  transportType?: string;
  exporterCountry?: string;
  importerCountry?: string;
}): number {
  const from = normalizeCountry(input.exporterCountry);
  const to = normalizeCountry(input.importerCountry);
  const rates = TRANSPORT_RATES[String(input.transportType || 'SEA').toUpperCase()] ?? TRANSPORT_RATES.SEA;

  const distance = resolveDistanceKm(input.distanceKm, from, to);
  // Lô chưa khai trọng lượng vẫn phải chịu phí tối thiểu của 1kg.
  const weight = Math.max(Number(input.weightKg) || 0, 1);
  const billableWeight = chargeableWeight(weight);

  const multiplier = lookupRoute(ROUTE_MULTIPLIER, from, to) ?? (from === to ? 1 : 1.15);
  const weightFee = billableWeight * rates.perKg;
  const distanceFee = billableWeight * rates.perKgPer1000Km * (distance / 1000);

  return Number(((rates.base + weightFee + distanceFee) * multiplier).toFixed(2));
}

// ==================== Tổng hợp ====================

export type TaxableMaterial = {
  hsCode?: string | null;
  quantity: number;
  unitPrice: number;
  origin?: string | null;
  weight?: number | null;
};

export type MaterialTax = {
  totalPrice: number;
  /** Thuế nhập khẩu của riêng dòng hàng này. */
  dutyRate: number;
  dutyAmount: number;
  /** VAT tính trên (trị giá + thuế nhập khẩu), đúng thứ tự áp thuế của hải quan. */
  vatRate: number;
  vatAmount: number;
};

/** Thuế của từng dòng hàng, suy từ mã HS và xuất xứ của chính dòng đó. */
export function calcMaterialTax(material: TaxableMaterial, importerCountry?: string): MaterialTax {
  const totalPrice = Number(((Number(material.quantity) || 0) * (Number(material.unitPrice) || 0)).toFixed(2));
  const dutyRate = getImportDutyRate(material.hsCode, material.origin, importerCountry);
  const dutyAmount = Number(((totalPrice * dutyRate) / 100).toFixed(2));
  const vatRate = getVatRateByHsCode(material.hsCode);
  // VAT của hàng nhập khẩu tính trên trị giá đã có thuế nhập khẩu.
  const vatAmount = Number((((totalPrice + dutyAmount) * vatRate) / 100).toFixed(2));
  return { totalPrice, dutyRate, dutyAmount, vatRate, vatAmount };
}

/** Mọi số tiền trong đây đều tính bằng ĐỒNG TIỀN CỦA TỜ KHAI, không phải USD. */
export type DeclarationTotals = {
  totalValue: number;
  totalWeight: number;
  importDutyRate: number;
  importDutyAmount: number;
  vatRate: number;
  vatAmount: number;
  shippingFee: number;
  totalPayable: number;
  distanceKm: number;
};

/** Quy đổi một số tiền USD sang đồng tiền của tờ khai. */
function fromUsd(amountUsd: number, currency?: string, exchangeRate?: number): number {
  if (String(currency || 'USD').toUpperCase() !== 'VND') return Number(amountUsd.toFixed(2));
  const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : DEFAULT_EXCHANGE_RATE;
  // VND không dùng phần thập phân.
  return Math.round(amountUsd * rate);
}

/**
 * Tổng hợp tài chính của cả tờ khai từ danh sách hàng hoá.
 *
 * Thuế suất ghi trên tờ khai là bình quân gia quyền theo trị giá của các dòng
 * hàng: một tờ khai có nhiều mặt hàng chịu thuế khác nhau thì không có một con số
 * duy nhất nào đúng, nhưng bình quân gia quyền cho ra đúng số tiền thuế.
 */
export function calcDeclarationTotals(
  materials: TaxableMaterial[],
  options: {
    exporterCountry?: string;
    importerCountry?: string;
    transportType?: string;
    distanceKm?: number;
    /** Thuế suất VAT do người khai ấn định, dùng khi biểu mẫu giấy đã ghi sẵn. */
    vatRateOverride?: number;
    /**
     * Đồng tiền của tờ khai - đơn giá hàng hoá đang ghi bằng đồng tiền này.
     * Phí vận chuyển tính ra USD nên phải biết cái này để quy đổi.
     */
    currency?: string;
    exchangeRate?: number;
  },
): DeclarationTotals {
  const taxes = materials.map((material) => calcMaterialTax(material, options.importerCountry));

  const totalValue = Number(taxes.reduce((sum, tax) => sum + tax.totalPrice, 0).toFixed(2));
  const totalWeight = Number(
    materials.reduce((sum, material) => sum + (Number(material.weight) || 0), 0).toFixed(3),
  );
  const importDutyAmount = Number(taxes.reduce((sum, tax) => sum + tax.dutyAmount, 0).toFixed(2));

  const hasOverride = options.vatRateOverride != null && Number.isFinite(options.vatRateOverride);
  const vatRate = hasOverride
    ? Number(options.vatRateOverride)
    : weightedRate(taxes.map((tax) => [tax.vatRate, tax.totalPrice + tax.dutyAmount]));
  const vatAmount = hasOverride
    ? Number((((totalValue + importDutyAmount) * vatRate) / 100).toFixed(2))
    : Number(taxes.reduce((sum, tax) => sum + tax.vatAmount, 0).toFixed(2));

  const importDutyRate = weightedRate(taxes.map((tax) => [tax.dutyRate, tax.totalPrice]));

  const distanceKm = resolveDistanceKm(options.distanceKm, options.exporterCountry, options.importerCountry);
  // Biểu giá vận chuyển niêm yết bằng USD, còn trị giá hàng và thuế đang tính bằng
  // đồng tiền của tờ khai, nên phải quy đổi trước khi cộng chung một tổng.
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
    importDutyRate,
    importDutyAmount,
    vatRate,
    vatAmount,
    shippingFee,
    totalPayable: Number((totalValue + importDutyAmount + vatAmount + shippingFee).toFixed(2)),
    distanceKm,
  };
}

/** Bình quân gia quyền của các cặp [thuế suất, trọng số]. */
function weightedRate(pairs: [number, number][]): number {
  const totalWeight = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight <= 0) {
    // Không có trị giá để làm trọng số thì lấy bình quân đơn giản, còn hơn trả 0
    // và làm tờ khai trông như được miễn thuế.
    return pairs.length ? Number((pairs.reduce((sum, [rate]) => sum + rate, 0) / pairs.length).toFixed(2)) : 0;
  }
  return Number((pairs.reduce((sum, [rate, weight]) => sum + rate * weight, 0) / totalWeight).toFixed(2));
}
