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

export function useUpdateCustomsStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CustomsStatus }) =>
      customsApi.updateStatus(id, status).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customs'] }),
  });
}

export function useDeleteCustoms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customsApi.delete(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customs'] }),
  });
}
