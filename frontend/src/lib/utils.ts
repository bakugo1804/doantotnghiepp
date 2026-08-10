import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (value: number, currency = 'USD') => {
  const safe = Number(value) || 0;
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: currency === 'VND' ? 'VND' : 'USD',
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(safe);
};

export const formatDate = (date: string | Date) => {
  if (!date) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
};

export const formatDateTime = (date: string | Date) => {
  if (!date) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

// Nhãn + màu cho trạng thái tờ khai.
// Sắc màu ở đây đi cặp với các token --viz-* trong globals.css: badge và biểu đồ
// phải nói cùng một ngôn ngữ màu, nếu không người đọc học "Đã duyệt là xanh lá"
// ở bảng rồi lại gặp một màu khác trên biểu đồ.
export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Nháp', color: 'bg-slate-100 text-slate-700' },
  SUBMITTED: { label: 'Đã nộp', color: 'bg-blue-100 text-blue-700' },
  PROCESSING: { label: 'Đang xử lý', color: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Đã duyệt', color: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Từ chối', color: 'bg-rose-100 text-rose-700' },
  COMPLETED: { label: 'Hoàn thành', color: 'bg-violet-100 text-violet-700' },
};

// Nhãn loại vận chuyển
export const TRANSPORT_LABELS: Record<string, string> = {
  AIR: 'Đường hàng không',
  SEA: 'Đường biển',
  RAIL: 'Đường sắt',
  ROAD: 'Đường bộ',
};

/** "3 giờ trước", "2 ngày trước" - dễ đọc hơn dấu thời gian tuyệt đối khi xem hoạt động. */
export const formatRelativeTime = (date?: string | Date | null) => {
  if (!date) return null;
  const target = new Date(date).getTime();
  if (Number.isNaN(target)) return null;

  const diffSeconds = Math.round((target - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [604800, 'day'],
    [2592000, 'week'],
    [31536000, 'month'],
  ];

  const absolute = Math.abs(diffSeconds);
  for (const [limit, unit] of steps) {
    if (absolute < limit) {
      const divisor = limit === 60 ? 1 : limit === 3600 ? 60 : limit === 86400 ? 3600 : limit === 604800 ? 86400 : limit === 2592000 ? 604800 : 2592000;
      return formatter.format(Math.round(diffSeconds / divisor), unit);
    }
  }
  return formatter.format(Math.round(diffSeconds / 31536000), 'year');
};

/** Coi là "đang dùng hệ thống" nếu đăng nhập trong vòng 15 phút. */
export const isRecentlyOnline = (lastLoginAt?: string | Date | null) => {
  if (!lastLoginAt) return false;
  const diff = Date.now() - new Date(lastLoginAt).getTime();
  return diff >= 0 && diff < 15 * 60 * 1000;
};

// Nhãn vai trò - NGUỒN DUY NHẤT, đừng viết lại bảng này ở nơi khác.
//
// Hệ thống phục vụ một doanh nghiệp, nên cây quyền lực đi theo sơ đồ tổ chức của
// công ty: Giám đốc đứng đầu. Không có bậc "quản trị viên" tách riêng bên cạnh
// Giám đốc, vì hai chức danh cùng ở đỉnh sẽ không ai biết ai to hơn ai.
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Giám đốc',
  DIRECTOR: 'Trưởng phòng',
  STAFF: 'Nhân viên',
  VIEWER: 'Người xem',
};

/** Mô tả quyền hạn, dùng cho tooltip và trang quản trị. */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: 'Toàn quyền: quản lý nhân sự, phân quyền, duyệt và xoá tờ khai',
  DIRECTOR: 'Quản lý nhân viên trong phòng, giao việc, duyệt tờ khai',
  STAFF: 'Tạo và xử lý tờ khai, cập nhật công việc được giao',
  VIEWER: 'Chỉ xem dữ liệu, không chỉnh sửa',
};

/** Thứ tự từ cao xuống thấp - dùng để sắp xếp và so sánh cấp bậc. */
export const ROLE_ORDER = ['ADMIN', 'DIRECTOR', 'STAFF', 'VIEWER'] as const;

export const roleLabel = (role?: string) => (role ? ROLE_LABELS[role] || role : '');

// Nhãn + màu cho trạng thái nhiệm vụ
export const TASK_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  TODO: { label: 'Cần làm', color: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { label: 'Đang làm', color: 'bg-amber-100 text-amber-700' },
  DONE: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-700' },
};
