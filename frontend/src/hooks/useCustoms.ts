import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customsApi } from '@/lib/api';
import type { CreateCustomsDto, CustomsStatus } from '@/types';

export function useCustomsList(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return useQuery({
    queryKey: ['customs', params],
    queryFn: () => customsApi.getAll(params).then((r) => r.data),
  });
}

export function useCustomsOne(id: string) {
  return useQuery({
    queryKey: ['customs', id],
    queryFn: () => customsApi.getOne(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCustomsStats() {
  return useQuery({
    queryKey: ['customs', 'stats'],
    queryFn: () => customsApi.getStats().then((r) => r.data),
  });
}

export function useCreateCustoms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCustomsDto) => customsApi.create(data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customs'] }),
  });
}

export function useUpdateCustoms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateCustomsDto }) =>
      customsApi.update(id, data).then((r) => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['customs'] });
      qc.invalidateQueries({ queryKey: ['customs', variables.id] });
      // Sửa nội dung ghi thêm một dòng nhật ký, nên danh bạ công ty cũng cần làm mới.
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

/** Các bước xử lý tiếp theo mà vai trò hiện tại được phép thực hiện. */
export function useCustomsTransitions(id: string) {
  return useQuery({
    queryKey: ['customs-transitions', id],
    queryFn: () => customsApi.getTransitions(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useUpdateCustomsStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: CustomsStatus; note?: string }) =>
      customsApi.updateStatus(id, status, note).then((r) => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['customs'] });
      // Đổi trạng thái thì tập bước hợp lệ tiếp theo cũng đổi theo.
      qc.invalidateQueries({ queryKey: ['customs-transitions', variables.id] });
    },
  });
}

export function useDeleteCustoms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customsApi.delete(id).then((r) => r.data),
    onSuccess: () => {
      // Nhóm 'customs' gồm cả danh sách, thống kê và danh sách gần đây của bảng điều
      // khiển - mọi chỗ đọc /customs đều dùng khoá bắt đầu bằng 'customs'.
      qc.invalidateQueries({ queryKey: ['customs'] });
      // Công việc gắn với tờ khai vừa xoá vẫn còn nhưng mất liên kết, nên danh sách
      // công việc cũng phải tải lại.
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
