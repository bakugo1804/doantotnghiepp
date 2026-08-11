/**
 * Tiện ích dùng chung cho lớp biểu đồ.
 *
 * Biểu đồ được vẽ bằng SVG thuần thay vì kéo thêm thư viện chart: bộ dữ liệu ở
 * đây nhỏ, và tự vẽ cho phép bám sát đúng đặc tả nét vẽ (nét mảnh, khe hở 2px
 * giữa các mảng màu, lưới hairline) mà thư viện dựng sẵn thường không cho chỉnh.
 */

/** Thứ tự xếp chồng của trạng thái tờ khai — cũng là thứ tự đã kiểm chứng CVD. */
export const STATUS_ORDER = ['DRAFT', 'SUBMITTED', 'PROCESSING', 'APPROVED', 'COMPLETED', 'REJECTED'] as const;
export type StatusKey = (typeof STATUS_ORDER)[number];

/** Trỏ tới CSS custom property để light/dark tự đổi mà không cần đọc theme trong JS. */
export const STATUS_COLOR_VAR: Record<string, string> = {
  DRAFT: 'var(--viz-draft)',
  SUBMITTED: 'var(--viz-submitted)',
  PROCESSING: 'var(--viz-processing)',
  APPROVED: 'var(--viz-approved)',
  COMPLETED: 'var(--viz-completed)',
  REJECTED: 'var(--viz-rejected)',
};

export const TRANSPORT_ORDER = ['SEA', 'AIR', 'ROAD', 'RAIL'] as const;

/** Rút gọn số lớn: 1.284 → 1,3K. Dùng cho nhãn trục và ô chỉ số. */
export function compactNumber(value: number, locale = 'vi-VN') {
  const safe = Number(value) || 0;
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(safe);
}

/** Số tiền rút gọn kèm ký hiệu — dùng ở nhãn trục, nơi không đủ chỗ cho số đầy đủ. */
export function compactCurrency(value: number, currency = 'USD', locale = 'vi-VN') {
  const safe = Number(value) || 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(safe);
}

/** '2026-08' → 'T8/26' (vi) hoặc 'Aug 26' (en). */
export function formatMonthKey(key: string, locale = 'vi') {
  const [year, month] = key.split('-');
  if (!year || !month) return key;
  const short = year.slice(2);
  if (locale === 'vi') return `T${Number(month)}/${short}`;
  const name = new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-US', { month: 'short' });
  return `${name} ${short}`;
}

/**
 * Chọn các mốc trục Y "tròn" (0 / 5 / 10 …) bao trọn dải giá trị.
 * Trục tự sinh từ max thô sẽ cho ra những mốc như 3,7 hoặc 812 — đọc rất khó.
 *
 * Mốc trên cùng BẮT BUỘC lớn hơn hoặc bằng giá trị lớn nhất. Bản trước dừng vòng
 * lặp ở điều kiện `tick <= max` nên với max = 9 chỉ sinh ra [0, 5]: trục cao nhất
 * là 5 trong khi dữ liệu lên tới 9, khiến đường biểu đồ vẽ vọt ra ngoài khung thẻ.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rawStep = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const stepMultiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = stepMultiplier * magnitude;

  // Làm tròn LÊN tới bội số gần nhất của step để trục luôn phủ hết dữ liệu.
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= top + step * 1e-6; tick += step) ticks.push(Number(tick.toFixed(6)));
  if (ticks.length === 1) ticks.push(step);
  return ticks;
}

export type Point = { x: number; y: number };

/**
 * Đường cong Catmull-Rom chuyển sang cubic Bézier.
 * Nối thẳng các điểm sẽ cho đường gấp khúc gai góc; còn làm mượt quá tay lại vẽ
 * ra những chỗ phình không có trong dữ liệu, nên độ căng giữ ở mức thấp.
 */
export function smoothPath(points: Point[], tension = 0.22): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/** Phần trăm an toàn — tránh chia cho 0 khi chưa có dữ liệu. */
export function safePercent(part: number, whole: number) {
  if (!whole) return 0;
  return (part / whole) * 100;
}
