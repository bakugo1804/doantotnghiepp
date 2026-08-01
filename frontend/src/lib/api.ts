import axios from 'axios';
import { getSession } from 'next-auth/react';

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
  updateStatus: (id: string, status: string) => apiClient.patch(`/customs/${id}/status`, { status }),
  delete: (id: string) => apiClient.delete(`/customs/${id}`),
};

// ===== Danh bạ công ty =====
export const companiesApi = {
  getAll: (params?: any) => apiClient.get('/companies', { params }),
  create: (data: any) => apiClient.post('/companies', data),
  update: (id: string, data: any) => apiClient.patch(`/companies/${id}`, data),
  delete: (id: string) => apiClient.delete(`/companies/${id}`),
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
  // Tự chọn endpoint theo phần mở rộng của file
  parseFile: (file: File) => {
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    return isPdf ? aiApi.parsePdf(file) : aiApi.parseExcel(file);
  },
  chat: (message: string) => apiClient.post('/ai/chat', { message }),
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
};

// axios instance dùng trực tiếp (vd: api.get('/auth/companies'))
export const api = apiClient;
export default apiClient;
