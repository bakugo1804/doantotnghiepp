'use client';
import { useRouter, useParams } from 'next/navigation';
import { useCustomsOne, useCustomsTransitions, useUpdateCustomsStatus, useDeleteCustoms } from '@/hooks/useCustoms';
import { formatDate, formatDateTime, formatCurrency, STATUS_LABELS, TRANSPORT_LABELS } from '@/lib/utils';
import { ArrowLeft, ChevronRight, Download, FileText, GitBranch, History, Trash2, Loader2, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { reportsApi, downloadBlob } from '@/lib/api';
import { RecordTasksPanel } from '@/components/customs/RecordTasksPanel';
import type { CustomsStatus, Journey } from '@/types';

/** Đường đi thuận lợi của hồ sơ; REJECTED là nhánh rẽ nên không nằm trong dãy này. */
const WORKFLOW_STEPS = ['DRAFT', 'SUBMITTED', 'PROCESSING', 'APPROVED', 'COMPLETED'] as const;

export default function CustomsDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const [statusNote, setStatusNote] = useState('');
  const [statusError, setStatusError] = useState('');

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

  const handleDelete = async () => {
    if (!confirm('Xác nhận xóa?')) return;
    await deleteCustoms.mutateAsync(id as string);
    router.push('/dashboard/customs');
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
            <p className="text-gray-500 text-sm mt-1">Ngày nhập: {formatDate(record.entryDate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${status?.color}`}>{status?.label}</span>
          <button onClick={handleExport} className="p-2.5 bg-green-100 text-green-600 hover:bg-green-200 rounded-lg transition" title="Xuất Excel">
            <Download className="h-5 w-5" />
          </button>
          <button onClick={handleExportPdf} className="p-2.5 bg-rose-100 text-rose-600 hover:bg-rose-200 rounded-lg transition" title="Xuất PDF">
            <FileText className="h-5 w-5" />
          </button>
          <button onClick={handleDelete} disabled={deleteCustoms.isPending} className="p-2.5 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition disabled:opacity-50">
            <Trash2 className="h-5 w-5" />
          </button>
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
              {nextSteps.map((step: { status: CustomsStatus; label: string }) => (
                <button
                  key={step.status}
                  onClick={() => handleStatusChange(step.status)}
                  disabled={updateStatus.isPending}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
                    step.status === 'REJECTED' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {step.label}
                </button>
              ))}
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

            {record.flightNo && <div className="flex justify-between"><span className="text-gray-600">Chuyến bay:</span><span className="font-medium">{record.flightNo}</span></div>}
            {record.vesselName && <div className="flex justify-between"><span className="text-gray-600">Tàu:</span><span className="font-medium">{record.vesselName}</span></div>}
            {record.trainNo && <div className="flex justify-between"><span className="text-gray-600">Tàu hỏa:</span><span className="font-medium">{record.trainNo}</span></div>}
          </div>
        </div>

        {/* Đơn vị */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">🏢 Đơn vị</h2>
          <div className="space-y-3 text-sm">
            <div><span className="text-gray-600">Xuất khẩu:</span><span className="block font-medium">{record.exporterName}</span></div>
            <div><span className="text-gray-600">Nhập khẩu:</span><span className="block font-medium">{record.importerName}</span></div>
          </div>
        </div>
      </div>

      {/* Tài chính */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">💰 Tài chính</h2>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Tổng giá trị', value: formatCurrency(record.totalValue, record.currency) },
            { label: 'Thuế VAT', value: `${record.vatRate}% (${formatCurrency(record.vatAmount)})` },
            { label: 'Phí vận chuyển', value: formatCurrency(record.shippingFee) },
            { label: 'Tổng thanh toán', value: formatCurrency(record.totalPayable, record.currency), bold: true },
          ].map((f) => (
            <div key={f.label} className={`p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100 ${f.bold ? 'col-span-4' : ''}`}>
              <p className="text-sm text-gray-600">{f.label}</p>
              <p className={`${f.bold ? 'text-2xl' : 'text-xl'} font-bold text-blue-600`}>{f.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Vật tư */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">📦 Vật tư</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-200">
              {['STT', 'Mã HS', 'Mô tả', 'Số lượng', 'Đơn vị', 'Đơn giá', 'Tổng', 'Xuất xứ'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {record.materials?.map((m: any, i: number) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-xs">{m.hsCode || '-'}</td>
                  <td className="px-4 py-3">{m.description}</td>
                  <td className="px-4 py-3">{m.quantity}</td>
                  <td className="px-4 py-3">{m.unit}</td>
                  <td className="px-4 py-3">${m.unitPrice}</td>
                  <td className="px-4 py-3 font-medium">${m.totalPrice}</td>
                  <td className="px-4 py-3">{m.origin || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
