'use client';
import { useRouter, useParams } from 'next/navigation';
import { useCustomsOne, useUpdateCustomsStatus, useDeleteCustoms } from '@/hooks/useCustoms';
import { formatDate, formatCurrency, STATUS_LABELS, TRANSPORT_LABELS } from '@/lib/utils';
import { ArrowLeft, Download, FileText, Trash2, Loader2, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { reportsApi, downloadBlob } from '@/lib/api';
import type { CustomsStatus, Journey } from '@/types';

export default function CustomsDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const [newStatus, setNewStatus] = useState<CustomsStatus | ''>('');
  
  const { data: record, isLoading } = useCustomsOne(id as string);
  const updateStatus = useUpdateCustomsStatus();
  const deleteCustoms = useDeleteCustoms();

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

  const handleStatusChange = async () => {
    if (!newStatus) return;
    await updateStatus.mutateAsync({ id: id as string, status: newStatus });
    setNewStatus('');
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

      {/* Status change */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-800 mb-3">Cập nhật trạng thái</h2>
        <div className="flex gap-3">
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as CustomsStatus | '')} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">-- Chọn trạng thái --</option>
            {['DRAFT', 'SUBMITTED', 'PROCESSING', 'APPROVED', 'REJECTED', 'COMPLETED'].map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]?.label}</option>
            ))}
          </select>
          <button onClick={handleStatusChange} disabled={!newStatus || updateStatus.isPending} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium">
            {updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cập nhật'}
          </button>
        </div>
      </div>

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
