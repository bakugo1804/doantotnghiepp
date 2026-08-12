'use client';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCustomsOne, useCustomsTransitions, useUpdateCustomsStatus, useDeleteCustoms } from '@/hooks/useCustoms';
import { formatDate, formatDateTime, STATUS_LABELS, TRANSPORT_LABELS } from '@/lib/utils';
import { ArrowLeft, ChevronRight, Download, FileText, GitBranch, History, Trash2, Loader2, CheckCircle, Pencil, Undo2 } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { reportsApi, downloadBlob } from '@/lib/api';
import { RecordTasksPanel } from '@/components/customs/RecordTasksPanel';
import { DeleteCustomsDialog } from '@/components/customs/DeleteCustomsDialog';
import { CurrencyToggle, Money } from '@/components/settings/CurrencyProvider';
import { countryLabel, unitLabel } from '@/lib/reference-data';
import type { CustomsStatus, Journey } from '@/types';

/** Đường đi thuận lợi của hồ sơ; REJECTED là nhánh rẽ nên không nằm trong dãy này. */
const WORKFLOW_STEPS = ['DRAFT', 'SUBMITTED', 'PROCESSING', 'APPROVED', 'COMPLETED'] as const;

/** Bước đi ngược quy trình - phải trông khác bước tiến để không ai bấm nhầm. */
const isBackwardStep = (from: string, to: string) => {
  const fromIndex = WORKFLOW_STEPS.indexOf(from as any);
  const toIndex = WORKFLOW_STEPS.indexOf(to as any);
  return fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex;
};

export default function CustomsDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const { data: session } = useSession();
  // Xoá tờ khai là quyền của cấp quản lý (@Roles ở customs.controller). Vai trò khác
  // thì ẩn nút, thay vì để họ bấm rồi nhận lỗi 403.
  const role = (session?.user as any)?.role as string | undefined;
  const canDelete = role === 'ADMIN' || role === 'DIRECTOR';
  const [statusNote, setStatusNote] = useState('');
  const [statusError, setStatusError] = useState('');
  const [askDelete, setAskDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const { data: record, isLoading } = useCustomsOne(id as string);
  const { data: transitions } = useCustomsTransitions(id as string);
  const updateStatus = useUpdateCustomsStatus();
  const deleteCustoms = useDeleteCustoms();
  const nextSteps = transitions?.next ?? [];

  const handleExport = async () => {
    if (!record) return;
    try {
      const res = await reportsApi.exportExcel(record.id);
      downloadBlob(res.data, `to-khai-${record.recordNo}.xlsx`);
    } catch {
      alert('Xuất file Excel thất bại');
    }
  };

  const handleExportPdf = async () => {
    if (!record) return;
    try {
      const res = await reportsApi.exportPdf(record.id);
      downloadBlob(res.data, `to-khai-${record.recordNo}.pdf`);
    } catch {
      alert('Xuất file PDF thất bại');
    }
  };

  const confirmDelete = async () => {
    setDeleteError('');
    try {
      await deleteCustoms.mutateAsync(id as string);
      router.push('/dashboard/customs');
    } catch (error: any) {
      // Trước đây lỗi ở đây không hiện ở đâu cả: thiếu quyền là bấm mãi không thấy gì.
      const detail = error?.response?.data?.message;
      setDeleteError((Array.isArray(detail) ? detail[0] : detail) || 'Không xoá được tờ khai này.');
    }
  };

  const handleStatusChange = async (status: CustomsStatus) => {
    setStatusError('');
    try {
      await updateStatus.mutateAsync({ id: id as string, status, note: statusNote.trim() || undefined });
      setStatusNote('');
    } catch (error: any) {
      // Hiển thị đúng lý do bị chặn (sai luồng hay thiếu quyền) thay vì im lặng.
      setStatusError(error?.response?.data?.message || 'Không thể cập nhật trạng thái');
    }
  };

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  if (!record) return <div className="text-center py-20 text-gray-500">Không tìm thấy tờ khai</div>;

  const status = STATUS_LABELS[record.status];

  /** Số ngày đi đường, tính từ hai mốc đầu - cuối của hành trình. */
  const transportDays = (() => {
    if (!record.exitDate) return null;
    const days = Math.round((new Date(record.exitDate).getTime() - new Date(record.entryDate).getTime()) / 86_400_000);
    return Number.isFinite(days) && days >= 0 ? days : null;
  })();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="h-6 w-6 text-gray-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{record.recordNo}</h1>
            {/* Hai mốc này là điểm đầu và điểm cuối của HÀNH TRÌNH VẬN CHUYỂN, nên
                hiện kèm số ngày đi đường - đó là thông tin người đọc thực sự cần,
                và cũng làm rõ ngay rằng đây không phải "ngày nhập/xuất khẩu". */}
            <p className="mt-1 text-sm text-gray-500">
              Vận chuyển: <span className="font-medium text-gray-700">{formatDate(record.entryDate)}</span>
              <span className="mx-1.5 text-gray-400">→</span>
              <span className="font-medium text-gray-700">{record.exitDate ? formatDate(record.exitDate) : 'chưa kết thúc'}</span>
              {transportDays != null && <span className="ml-2 text-gray-400">({transportDays} ngày)</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${status?.color}`}>{status?.label}</span>
          <Link href={`/dashboard/customs/${record.id}/edit`} className="rounded-lg bg-blue-100 p-2.5 text-blue-600 transition hover:bg-blue-200" title="Sửa tờ khai">
            <Pencil className="h-5 w-5" />
          </Link>
          <button onClick={handleExport} className="p-2.5 bg-green-100 text-green-600 hover:bg-green-200 rounded-lg transition" title="Xuất Excel">
            <Download className="h-5 w-5" />
          </button>
          <button onClick={handleExportPdf} className="p-2.5 bg-rose-100 text-rose-600 hover:bg-rose-200 rounded-lg transition" title="Xuất PDF">
            <FileText className="h-5 w-5" />
          </button>
          {canDelete && (
            <button
              onClick={() => { setAskDelete(true); setDeleteConfirmText(''); setDeleteError(''); }}
              disabled={deleteCustoms.isPending}
              className="p-2.5 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition disabled:opacity-50"
              title="Xoá tờ khai"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Quy trình xử lý: chỉ hiện những bước hợp lệ với trạng thái hiện tại và
          vai trò người dùng, thay vì cho chọn tuỳ ý trong danh sách đầy đủ. */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-gray-800">Quy trình xử lý</h2>
        </div>

        <ol className="mb-5 flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
          {WORKFLOW_STEPS.map((step, index) => {
            const currentIndex = WORKFLOW_STEPS.indexOf(record.status as any);
            const done = currentIndex >= 0 && index <= currentIndex;
            const isCurrent = record.status === step;
            return (
              <li key={step} className="flex items-center gap-1">
                <span
                  className={`rounded-full px-2.5 py-1 font-medium ${
                    isCurrent
                      ? 'bg-blue-600 text-white'
                      : done
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {STATUS_LABELS[step]?.label}
                </span>
                {index < WORKFLOW_STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
              </li>
            );
          })}
          {record.status === 'REJECTED' && (
            <li className="ml-2 rounded-full bg-rose-100 px-2.5 py-1 font-medium text-rose-700">Từ chối</li>
          )}
        </ol>

        {nextSteps.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {record.status === 'COMPLETED'
              ? 'Hồ sơ đã hoàn thành, không còn bước xử lý nào.'
              : 'Vai trò của bạn không có bước xử lý nào khả dụng ở trạng thái này.'}
          </p>
        ) : (
          <div className="space-y-3">
            <input
              value={statusNote}
              onChange={(event) => setStatusNote(event.target.value)}
              placeholder="Ghi chú cho bước xử lý (không bắt buộc)"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex flex-wrap gap-2">
              {nextSteps.map((step: { status: CustomsStatus; label: string }) => {
                const backward = isBackwardStep(record.status, step.status);
                return (
                  <button
                    key={step.status}
                    onClick={() => handleStatusChange(step.status)}
                    disabled={updateStatus.isPending}
                    title={backward ? `Đưa hồ sơ trở lại bước "${step.label}"` : `Chuyển hồ sơ sang bước "${step.label}"`}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
                      step.status === 'REJECTED'
                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                        : backward
                          // Bước lùi dùng nút viền thay vì nút đặc: nó là thao tác
                          // sửa sai, không phải bước đi bình thường của quy trình.
                          ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {updateStatus.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : backward ? (
                      <Undo2 className="h-4 w-4" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    {backward ? `Quay lại: ${step.label}` : step.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {statusError && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{statusError}</p>
        )}
      </div>

      {/* Nhân sự phụ trách + giao việc ngay tại đây */}
      <RecordTasksPanel recordId={record.id} recordNo={record.recordNo} />

      {/* Nhật ký xử lý */}
      {record.statusHistory && record.statusHistory.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <History className="h-5 w-5 text-slate-500" />
            <h2 className="font-semibold text-gray-800">Nhật ký xử lý</h2>
          </div>
          <ol className="space-y-0">
            {record.statusHistory.map((entry: any, index: number) => (
              <li key={entry.id} className="relative flex gap-4 pb-5 last:pb-0">
                {index < record.statusHistory.length - 1 && (
                  <span aria-hidden className="absolute left-[7px] top-4 h-full w-px bg-slate-200" />
                )}
                <span
                  aria-hidden
                  className="relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white ring-2"
                  style={{ background: index === 0 ? '#2a78d6' : '#cbd5e1', boxShadow: '0 0 0 2px white' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-900">
                    {entry.fromStatus ? (
                      <>
                        <span className="text-slate-500">{STATUS_LABELS[entry.fromStatus]?.label}</span>
                        <span className="mx-1.5 text-slate-400">→</span>
                      </>
                    ) : null}
                    <span className="font-medium">{STATUS_LABELS[entry.toStatus]?.label}</span>
                  </p>
                  {entry.note && <p className="mt-0.5 text-sm text-slate-600">{entry.note}</p>}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {entry.changedBy?.fullName ?? 'Hệ thống'} · {formatDateTime(entry.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Thời gian & Vận chuyển */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">📅 Vận chuyển</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Loại chính:</span><span className="font-medium">{TRANSPORT_LABELS[record.transportType]}</span></div>

            {record.journeys && record.journeys.length > 0 ? (
              <div className="space-y-2 border-t border-gray-200 pt-3">
                {record.journeys
                  .sort((a: Journey, b: Journey) => a.legNumber - b.legNumber)
                  .map((journey: Journey) => (
                    <div key={journey.id} className="flex justify-between items-start">
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-600">Chặng {journey.legNumber}:</span>
                        <span className="text-xs text-gray-500">{TRANSPORT_LABELS[journey.transportType]}</span>
                      </div>
                      <span className="font-medium">{journey.origin} → {journey.destination}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <>
                {record.leg1Origin && record.leg1Destination && (
                  <div className="flex justify-between"><span className="text-gray-600">Chặng 1:</span><span className="font-medium">{record.leg1Origin} → {record.leg1Destination}</span></div>
                )}
                {record.leg2Origin && record.leg2Destination && (
                  <div className="flex justify-between"><span className="text-gray-600">Chặng 2:</span><span className="font-medium">{record.leg2Origin} → {record.leg2Destination}</span></div>
                )}
              </>
            )}

            {/* Một dòng duy nhất cho số hiệu chuyến, đúng như biểu mẫu khai báo và
                bản Excel/PDF xuất ra. Trước đây hiện ba dòng riêng "Chuyến bay",
                "Tàu", "Tàu hỏa" theo ba cột cũ trong cơ sở dữ liệu, nên một lô hàng
                đi đường biển do form tạo ra (form chỉ ghi vào cột flightNo) bị gắn
                nhãn "Chuyến bay". Thứ tự ưu tiên giữ đúng như lúc kết xuất tệp. */}
            {(record.flightNo || record.vesselName || record.trainNo) && (
              <div className="flex justify-between">
                <span className="text-gray-600">Số hiệu chuyến:</span>
                <span className="font-medium">{record.flightNo || record.vesselName || record.trainNo}</span>
              </div>
            )}
          </div>
        </div>

        {/* Đơn vị - quốc gia và địa chỉ đã khai nhưng trước đây không hiện ở đâu cả,
            dù chính quốc gia nhập khẩu mới là căn cứ tính thuế VAT của hồ sơ. */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">🏢 Đơn vị</h2>
          <div className="space-y-4 text-sm">
            {[
              { role: 'Xuất khẩu', name: record.exporterName, country: record.exporterCountry, address: record.exporterAddress },
              { role: 'Nhập khẩu', name: record.importerName, country: record.importerCountry, address: record.importerAddress },
            ].map((party) => (
              <div key={party.role}>
                <span className="text-gray-600">{party.role}:</span>
                <span className="block font-medium">{party.name}</span>
                <span className="block text-xs text-gray-500">{countryLabel(party.country)}</span>
                {party.address && <span className="block text-xs text-gray-500">{party.address}</span>}
              </div>
            ))}
            {record.invoiceNo && (
              <div className="flex justify-between border-t border-gray-100 pt-3">
                <span className="text-gray-600">Số hoá đơn:</span><span className="font-medium">{record.invoiceNo}</span>
              </div>
            )}
            {record.billOfLading && (
              <div className="flex justify-between"><span className="text-gray-600">Số vận đơn:</span><span className="font-medium">{record.billOfLading}</span></div>
            )}
            {record.containerNo && (
              <div className="flex justify-between"><span className="text-gray-600">Số container:</span><span className="font-medium">{record.containerNo}</span></div>
            )}
            {record.notes && <p className="border-t border-gray-100 pt-3 text-gray-600">Ghi chú: {record.notes}</p>}
          </div>
        </div>
      </div>

      {/* Tài chính - mọi con số bấm được để đổi qua lại USD ⇄ VND. Trước đây thuế
          và phí vận chuyển luôn in ra kèm ký hiệu USD kể cả khi tờ khai ghi bằng
          VND, nên ba ô trong cùng một thẻ có thể đang nói ba đơn vị khác nhau. */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-800">💰 Tài chính</h2>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Tờ khai ghi bằng {record.currency} · 1 USD = {(record.exchangeRate || 25000).toLocaleString('vi-VN')} VND</span>
            <CurrencyToggle />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Tổng giá trị hàng', value: record.totalValue, hint: null },
            {
              label: `Thuế nhập khẩu (${record.importDutyRate ?? 0}%)`,
              value: record.importDutyAmount ?? 0,
              hint: (record.importDutyRate ?? 0) === 0 ? 'Hàng cùng nước xuất xứ' : 'Theo mã HS & xuất xứ',
            },
            { label: `Thuế VAT (${record.vatRate}%)`, value: record.vatAmount, hint: 'Trên trị giá đã có thuế NK' },
            {
              label: 'Phí vận chuyển',
              value: record.shippingFee,
              hint: `${(record.totalWeight ?? 0).toLocaleString('vi-VN')} kg · ${TRANSPORT_LABELS[record.transportType]}`,
            },
          ].map((f) => (
            <div key={f.label} className="rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
              <p className="text-sm text-gray-600">{f.label}</p>
              <Money
                value={f.value}
                currency={record.currency}
                rate={record.exchangeRate}
                showOriginal
                className="text-xl font-bold text-blue-600"
              />
              {f.hint && <p className="mt-0.5 text-[11px] text-gray-500">{f.hint}</p>}
            </div>
          ))}
          <div className="col-span-2 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-100 to-indigo-100 p-4 lg:col-span-3">
            <p className="text-sm text-gray-600">Tổng thanh toán</p>
            <Money
              value={record.totalPayable}
              currency={record.currency}
              rate={record.exchangeRate}
              showOriginal
              className="text-2xl font-bold text-blue-700"
            />
          </div>
        </div>
      </div>

      {/* Vật tư - đơn giá và tổng trước đây in thẳng dấu "$" vào chuỗi nên tờ khai
          ghi bằng VND vẫn hiện ra như tiền đô, và không có cách nào đổi đơn vị. */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-800">📦 Vật tư</h2>
          <CurrencyToggle />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-200">
              {['STT', 'Mã HS', 'Mô tả', 'Số lượng', 'Đơn vị', 'Đơn giá', 'Tổng', 'Xuất xứ', 'Trọng lượng'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {record.materials?.map((m: any, i: number) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-xs">{m.hsCode || '-'}</td>
                  <td className="px-4 py-3">{m.description}</td>
                  <td className="px-4 py-3 tabular-nums">{m.quantity}</td>
                  <td className="px-4 py-3">{unitLabel(m.unit)}</td>
                  <td className="px-4 py-3">
                    <Money value={m.unitPrice} currency={record.currency} rate={record.exchangeRate} />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Money value={m.totalPrice} currency={record.currency} rate={record.exchangeRate} />
                  </td>
                  <td className="px-4 py-3">{countryLabel(m.origin)}</td>
                  <td className="px-4 py-3 tabular-nums">{m.weight != null ? `${m.weight} kg` : '—'}</td>
                </tr>
              ))}
              {!record.materials?.length && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Tờ khai này chưa có dòng vật tư nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteCustomsDialog
        target={askDelete ? { id: record.id, recordNo: record.recordNo } : null}
        onClose={() => setAskDelete(false)}
        onConfirm={confirmDelete}
        deleting={deleteCustoms.isPending}
        error={deleteError}
        confirmText={deleteConfirmText}
        onConfirmTextChange={setDeleteConfirmText}
      />
    </div>
  );
}
