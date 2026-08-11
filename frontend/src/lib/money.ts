/**
 * Quy đổi và hiển thị tiền tệ.
 *
 * Mỗi tờ khai tự mang đồng tiền thanh toán và tỷ giá của riêng nó, nên trước đây
 * mọi con số chỉ hiện đúng theo đồng tiền đã lưu: người xem một tờ khai ghi bằng
 * USD không có cách nào biết số đó tương đương bao nhiêu đồng. Hai hàm ở đây là
 * nguồn duy nhất cho việc đổi qua lại, dùng chung cho mọi chỗ có số tiền.
 */

/** Giữ khớp với DEFAULT_EXCHANGE_RATE ở backend/src/customs/financial-rules.ts. */
export const DEFAULT_EXCHANGE_RATE = 25000;

export type CurrencyCode = 'USD' | 'VND';

export const CURRENCY_LABELS: Record<CurrencyCode, { name: string; symbol: string }> = {
  USD: { name: 'Đô la Mỹ', symbol: '$' },
  VND: { name: 'Việt Nam Đồng', symbol: '₫' },
};

/** Chuẩn hoá một mã tiền tệ bất kỳ về USD/VND - dữ liệu cũ có thể ghi thường hoặc rỗng. */
export const normalizeCurrency = (value?: string | null): CurrencyCode =>
  String(value || '').trim().toUpperCase() === 'VND' ? 'VND' : 'USD';

/** Tỷ giá dùng được: bỏ qua 0 và giá trị rác để không chia cho 0. */
export const safeRate = (rate?: number | null): number => {
  const value = Number(rate);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_EXCHANGE_RATE;
};

/**
 * Đổi số tiền từ đồng tiền này sang đồng tiền kia theo tỷ giá của chính tờ khai.
 * Dùng tỷ giá của bản ghi (không phải tỷ giá hôm nay) vì con số phải khớp với
 * thời điểm hồ sơ được lập.
 */
export function convertMoney(amount: number, from?: string | null, to?: string | null, rate?: number | null): number {
  const value = Number(amount) || 0;
  const source = normalizeCurrency(from);
  const target = normalizeCurrency(to);
  if (source === target) return value;
  const exchange = safeRate(rate);
  return source === 'USD' ? value * exchange : value / exchange;
}

/** Định dạng số tiền theo đúng thông lệ của đồng tiền đó. */
export function formatMoney(amount: number, currency?: string | null): string {
  const code = normalizeCurrency(currency);
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: code === 'VND' ? 0 : 2,
  }).format(Number(amount) || 0);
}

/** Đổi rồi định dạng - phần việc lặp lại ở mọi chỗ hiển thị tiền. */
export function formatMoneyIn(
  amount: number,
  recordCurrency?: string | null,
  displayCurrency?: string | null,
  rate?: number | null,
): string {
  return formatMoney(convertMoney(amount, recordCurrency, displayCurrency, rate), displayCurrency);
}

/** Mô tả tỷ giá đang áp dụng, dùng cho tooltip khi người dùng bấm đổi tiền tệ. */
export function rateHint(rate?: number | null): string {
  return `Tỷ giá áp dụng: 1 USD = ${safeRate(rate).toLocaleString('vi-VN')} VND`;
}
