'use client';
import { useQuery } from '@tanstack/react-query';
import { customsApi } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';

/**
 * Hộp thoại xác nhận xoá tờ khai.
 *
 * Xoá tờ khai là việc không lùi lại được và nó kéo theo cả dòng hàng, chặng vận
 * chuyển, nhật ký xử lý; công việc đã giao thì mất liên kết tới hồ sơ. Một hộp
 * `confirm('Xác nhận xóa?')` của trình duyệt không nói gì trong số đó, nên người
 * bấm không có cách nào biết mình đang xoá hồ sơ nào và mất những gì. Ở đây hỏi lại
 * kèm đúng số liệu lấy từ máy chủ, và với hồ sơ đã duyệt thì bắt gõ lại số tờ khai.
 */
export type DeleteTarget = { id: string; recordNo: string };

export function DeleteCustomsDialog({
  target,
  onClose,
  onConfirm,
  deleting,
  error,
  confirmText,
  onConfirmTextChange,
}: {
  target: DeleteTarget | null;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
  error?: string;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
}) {
  const { data: impact, isLoading } = useQuery({
    queryKey: ['customs-delete-impact', target?.id],
    queryFn: () => customsApi.getDeleteImpact(target!.id).then((response) => response.data),
    enabled: !!target,
    staleTime: 0,
  });

  if (!target) return null;

  // Hồ sơ đã duyệt hoặc đã hoàn thành: bắt gõ lại số tờ khai để không xoá vì bấm nhầm.
  const needsTyping = !!impact?.decided;
  const typedOk = !needsTyping || confirmText.trim() === target.recordNo;

  const lines = impact
    ? [
        { label: 'Dòng hàng hoá', value: impact.materials },
        { label: 'Chặng vận chuyển', value: impact.journeys },
        { label: 'Mốc nhật ký xử lý', value: impact.statusHistory },
        { label: 'Tệp đính kèm', value: impact.attachments },
      ].filter((line) => line.value > 0)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Xoá tờ khai {target.recordNo}?</h2>
              <p className="mt-0.5 text-sm text-slate-500">Việc này không thể hoàn tác.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100" title="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra dữ liệu liên quan...
            </p>
          ) : (
            <>
              {impact && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="text-slate-600">
                    {/* statusLabel là nhãn tiếng Việt do backend trả về (STATUS_LABELS
                        trong status-workflow.ts là Record<status, string>), không phải
                        đối tượng - hiện thẳng chuỗi đó chứ đừng hiện mã "APPROVED". */}
                    Trạng thái <span className="font-medium text-slate-900">{impact.statusLabel || impact.status}</span>
                    {' · '}
                    Tổng thanh toán{' '}
                    <span className="font-medium text-slate-900">{formatMoney(impact.totalPayable, impact.currency)}</span>
                  </p>
                </div>
              )}

              {lines.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-700">Sẽ bị xoá cùng tờ khai:</p>
                  <ul className="space-y-1 text-sm text-slate-600">
                    {lines.map((line) => (
                      <li key={line.label} className="flex justify-between">
                        <span>{line.label}</span>
                        <span className="font-medium tabular-nums text-slate-900">{line.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Công việc không bị xoá nhưng mất liên kết - phần dễ bỏ sót nhất. */}
              {impact?.linkedTasks > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Có <span className="font-semibold">{impact.linkedTasks}</span> công việc đang gắn với tờ khai này. Công việc
                  vẫn còn nhưng sẽ không còn liên kết tới hồ sơ nào.
                </div>
              )}

              {needsTyping && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <p className="text-sm text-rose-800">
                    Hồ sơ này đã mang hiệu lực quyết định. Gõ lại số tờ khai{' '}
                    <span className="font-mono font-semibold">{target.recordNo}</span> để xác nhận.
                  </p>
                  <input
                    value={confirmText}
                    onChange={(event) => onConfirmTextChange(event.target.value)}
                    placeholder={target.recordNo}
                    autoFocus
                    className="mt-2 w-full rounded-lg border border-rose-300 px-3 py-2 font-mono text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                  />
                </div>
              )}

              {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 p-5">
          <button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Huỷ
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting || isLoading || !typedOk}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Xoá tờ khai
          </button>
        </div>
      </div>
    </div>
  );
}
