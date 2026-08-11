import axios from 'axios';
import { getSession } from 'next-auth/react';
import { isImageFile, shrinkImageForOcr } from './image';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tự động gắn access token vào mọi request
apiClient.interceptors.request.use(async (config) => {
  const session = await getSession();
  const token = (session?.user as any)?.accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Tải file blob về máy
export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// ===== Tờ khai hải quan =====
export const customsApi = {
  getAll: (params?: any) => apiClient.get('/customs', { params }),
  getOne: (id: string) => apiClient.get(`/customs/${id}`),
  getStats: () => apiClient.get('/customs/stats'),
  getCompanies: (search?: string) => apiClient.get('/customs/companies', { params: { search } }),
  checkRecordNo: (recordNo: string) => apiClient.get('/customs/check-record-no', { params: { recordNo } }),
  create: (data: any) => apiClient.post('/customs', data),
  update: (id: string, data: any) => apiClient.patch(`/customs/${id}`, data),
  getTransitions: (id: string) => apiClient.get(`/customs/${id}/transitions`),
  updateStatus: (id: string, status: string, note?: string) =>
    apiClient.patch(`/customs/${id}/status`, { status, note }),
  delete: (id: string) => apiClient.delete(`/customs/${id}`),
};

// ===== Danh bạ công ty =====
//
// Công ty "suy ra" từ tờ khai có id dạng `derived-<tên công ty>`, mà tên công ty
// chứa dấu cách và dấu tiếng Việt. Không mã hoá thì đoạn đường dẫn bị cắt sai và
// máy chủ nhận được một cái tên khác.
export const companiesApi = {
  getAll: (params?: any) => apiClient.get('/companies', { params }),
  create: (data: any) => apiClient.post('/companies', data),
  update: (id: string, data: any) => apiClient.patch(`/companies/${encodeURIComponent(id)}`, data),
  delete: (id: string) => apiClient.delete(`/companies/${encodeURIComponent(id)}`),
};

// ===== Danh mục mã HS =====
export const hsCodesApi = {
  getAll: (params?: { search?: string }) => apiClient.get('/hs-codes', { params }),
  create: (data: any) => apiClient.post('/hs-codes', data),
  update: (id: string, data: any) => apiClient.patch(`/hs-codes/${id}`, data),
  delete: (id: string) => apiClient.delete(`/hs-codes/${id}`),
};

// ===== Người dùng =====
export const usersApi = {
  getAll: (params?: any) => apiClient.get('/users', { params }),
  getMe: () => apiClient.get('/users/me'),
  updateMe: (data: any) => apiClient.patch('/users/me', data),
  getOne: (id: string) => apiClient.get(`/users/${id}`),
  update: (id: string, data: any) => apiClient.patch(`/users/${id}`, data),
  delete: (id: string) => apiClient.delete(`/users/${id}`),
};

// ===== Giao việc =====
export const tasksApi = {
  getAll: (params?: any) => apiClient.get('/tasks', { params }),
  create: (data: any) => apiClient.post('/tasks', data),
  update: (id: string, data: any) => apiClient.patch(`/tasks/${id}`, data),
  delete: (id: string) => apiClient.delete(`/tasks/${id}`),
};

// ===== AI =====
export const aiApi = {
  parseExcel: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/ai/parse-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  parsePdf: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/ai/parse-pdf', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  /**
   * Đọc ảnh chụp tờ khai giấy. Mô hình thị giác chạy chậm hơn hẳn việc đọc tệp số
   * nên nới thời gian chờ; lần gọi đầu còn phải nạp mô hình vào bộ nhớ.
   *
   * Ảnh được thu nhỏ ngay tại máy người dùng trước khi gửi - xem lib/image.ts để
   * biết vì sao kích thước ảnh quyết định cả tốc độ lẫn độ chính xác.
   */
  parseImage: async (file: File) => {
    const prepared = await shrinkImageForOcr(file);
    const formData = new FormData();
    formData.append('file', prepared);
    return apiClient.post('/ai/parse-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 240_000,
    });
  },
  // Tự chọn endpoint theo phần mở rộng của file
  parseFile: (file: File) => {
    if (isImageFile(file)) return aiApi.parseImage(file);
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    return isPdf ? aiApi.parsePdf(file) : aiApi.parseExcel(file);
  },
  // Timeout dài hơn hẳn các API khác: lần hỏi đầu tiên Ollama phải nạp mô hình
  // vào RAM, bước này có thể mất gần một phút trên máy không có GPU.
  chat: (message: string) => apiClient.post('/ai/chat', { message }, { timeout: 180_000 }),
};

// ===== Báo cáo / Xuất file =====
export const reportsApi = {
  exportExcel: (id: string) => apiClient.get(`/reports/excel/${id}`, { responseType: 'blob' }),
  exportPdf: (id: string) => apiClient.get(`/reports/pdf/${id}`, { responseType: 'blob' }),
  getTemplate: () => apiClient.get('/reports/template', { responseType: 'blob' }),
  getTemplatePdf: () => apiClient.get('/reports/template-pdf', { responseType: 'blob' }),
  excelToPdf: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post('/reports/convert/excel-to-pdf', fd, { responseType: 'blob', headers: { 'Content-Type': 'multipart/form-data' } });
  },
  pdfToExcel: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post('/reports/convert/pdf-to-excel', fd, { responseType: 'blob', headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

// ===== Tìm kiếm toàn cục =====
export const searchApi = {
  global: (query: string, filters?: { status?: string; transportType?: string; only?: string }) =>
    apiClient.get('/search', { params: { q: query, ...filters } }),
};

// ===== Thông báo =====
export const notificationsApi = {
  list: () => apiClient.get('/notifications'),
  markRead: (id: string) => apiClient.patch(`/notifications/${id}/read`),
  markAllRead: () => apiClient.patch('/notifications/read-all'),
};

// axios instance dùng trực tiếp (vd: api.get('/auth/companies'))
export const api = apiClient;
export default apiClient;
