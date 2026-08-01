'use client';
import { useState } from 'react';
import { FileSpreadsheet, Download, Loader2 } from 'lucide-react';
import { reportsApi, downloadBlob } from '@/lib/api';
import { useCustomsList } from '@/hooks/useCustoms';
import { formatDate, formatCurrency, STATUS_LABELS, TRANSPORT_LABELS } from '@/lib/utils';

export default function ReportsPage() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const { data, isLoading } = useCustomsList({ limit: 100 });
  const records = data?.data ?? [];

  const handleExport = async (id: string, recordNo: string) => {
    setDownloading(id);
    try {
      const res = await reportsApi.exportExcel(id);
      downloadBlob(res.data, `TorKhai_${recordNo}.xlsx`);
    } catch {
      alert('Xuất file thất bại');
    } finally {
      setDownloading(null);
    }
  };

  const handleTemplate = async () => {
    setDownloading('template');
    try {
      const res = await reportsApi.getTemplate();
      downloadBlob(res.data, 'template_tor_khai.xlsx');
    } catch {
      alert('Tải template thất bại');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Báo cáo & Xuất Excel</h1>
          <p className="text-gray-500 text-sm mt-1">Xuất dữ liệu tờ khai sang file Excel</p>
        </div>
        <button
          onClick={handleTemplate}
          disabled={downloading === 'template'}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
        >
          {downloading === 'template' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Tải Template Excel
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Số tờ khai</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Ngày nhập</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Loại vận chuyển</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Nhà xuất khẩu</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Tổng tiền</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Trạng thái</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Xuất Excel</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Chưa có tờ khai nào</td></tr>
            ) : records.map((r: any) => {
              const status = STATUS_LABELS[r.status];
              return (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-mono font-medium text-blue-700">{r.recordNo}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(r.entryDate)}</td>
                  <td className="px-4 py-3 text-gray-600">{TRANSPORT_LABELS[r.transportType]}</td>
                  <td className="px-4 py-3 text-gray-700">{r.exporterName}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.totalPayable, r.currency)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${status?.color}`}>{status?.label}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleExport(r.id, r.recordNo)}
                      disabled={!!downloading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition disabled:opacity-50"
                    >
                      {downloading === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />}
                      Xuất
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
