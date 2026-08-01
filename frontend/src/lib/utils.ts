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

// Nhãn + màu cho trạng thái tờ khai
export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Nháp', color: 'bg-slate-100 text-slate-700' },
  SUBMITTED: { label: 'Đã nộp', color: 'bg-blue-100 text-blue-700' },
  PROCESSING: { label: 'Đang xử lý', color: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Đã duyệt', color: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Từ chối', color: 'bg-rose-100 text-rose-700' },
  COMPLETED: { label: 'Hoàn thành', color: 'bg-teal-100 text-teal-700' },
};

// Nhãn loại vận chuyển
export const TRANSPORT_LABELS: Record<string, string> = {
  AIR: 'Đường hàng không',
  SEA: 'Đường biển',
  RAIL: 'Đường sắt',
  ROAD: 'Đường bộ',
};

// Nhãn vai trò (1 tổ chức: ADMIN = Giám đốc)
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Giám đốc',
  DIRECTOR: 'Quản lý',
  STAFF: 'Nhân viên',
  VIEWER: 'Người xem',
};
export const roleLabel = (role?: string) => (role ? ROLE_LABELS[role] || role : '');

// Nhãn + màu cho trạng thái nhiệm vụ
export const TASK_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  TODO: { label: 'Cần làm', color: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { label: 'Đang làm', color: 'bg-amber-100 text-amber-700' },
  DONE: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-700' },
};
