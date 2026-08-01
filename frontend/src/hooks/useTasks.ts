import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { TaskStatus } from '@/types';

export function useTasksList(params?: { date?: string; assignedToId?: string; status?: string }) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => tasksApi.getAll(params).then((response) => response.data),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { title: string; description?: string; workDate: string; assignedToId: string; status?: TaskStatus }) =>
      tasksApi.create(data).then((response) => response.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title?: string; description?: string; workDate?: string; assignedToId?: string; status?: TaskStatus } }) =>
      tasksApi.update(id, data).then((response) => response.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tasksApi.delete(id).then((response) => response.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}