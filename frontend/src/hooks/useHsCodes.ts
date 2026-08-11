import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hsCodesApi } from '@/lib/api';
import type { HsCode } from '@/types';

/**
 * Danh mục mã HS dùng chung.
 *
 * Trước đây form khai báo chỉ gợi ý từ một mảng cứng 14 mã trong mã nguồn, nên
 * gặp mặt hàng ngoài danh sách đó là phải gõ tay lại ở mọi tờ khai. Giờ danh mục
 * nằm trong cơ sở dữ liệu và tự dày lên mỗi khi có tờ khai khai mã mới.
 */
export function useHsCodes(search?: string) {
  return useQuery<HsCode[]>({
    queryKey: ['hs-codes', search ?? ''],
    queryFn: () => hsCodesApi.getAll({ search: search || undefined }).then((response) => response.data),
    // Danh mục đổi rất ít, nhưng phải mới lại sau khi lưu tờ khai có mã mới.
    staleTime: 60_000,
  });
}

function useInvalidateHsCodes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['hs-codes'] });
}

export function useCreateHsCode() {
  const invalidate = useInvalidateHsCodes();
  return useMutation({
    mutationFn: (data: Partial<HsCode>) => hsCodesApi.create(data).then((response) => response.data),
    onSuccess: invalidate,
  });
}

export function useUpdateHsCode() {
  const invalidate = useInvalidateHsCodes();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<HsCode> }) =>
      hsCodesApi.update(id, data).then((response) => response.data),
    onSuccess: invalidate,
  });
}

export function useDeleteHsCode() {
  const invalidate = useInvalidateHsCodes();
  return useMutation({
    mutationFn: (id: string) => hsCodesApi.delete(id).then((response) => response.data),
    onSuccess: invalidate,
  });
}
