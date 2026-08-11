'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customsApi, reportsApi, downloadBlob } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useMessages } from '@/hooks/useMessages';
import { useStatusLabels, useTransportLabels } from '@/hooks/useCustomsLabels';
import { CurrencyToggle, Money } from '@/components/settings/CurrencyProvider';
import { Eye, Search, FileSpreadsheet, FileText, Pencil } from 'lucide-react';
import Link from 'next/link';

export function CustomsTable() {
  const msg = useMessages();
  const statusLabels = useStatusLabels();
  const transportLabels = useTransportLabels();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['customs', page, debouncedSearch],
    queryFn: () => customsApi.getAll({ page, limit: 20, search: debouncedSearch || undefined }).then((r) => r.data),
  });

  const handleExport = async (id: string, recordNo: string) => {
    const res = await reportsApi.exportExcel(id);
    downloadBlob(res.data, `to-khai-${recordNo}.xlsx`);
  };

  const handleExportPdf = async (id: string, recordNo: string) => {
    const res = await reportsApi.exportPdf(id);
    downloadBlob(res.data, `to-khai-${recordNo}.pdf`);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={msg.customs.table.search}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          Xem tiền theo
          <CurrencyToggle />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {[
                msg.customs.table.headers.recordNo,
                msg.customs.table.headers.entryDate,
                // Ngày xuất khẩu vốn có trên tờ khai nhưng bảng chỉ hiện ngày nhập,
                // nên không thể biết lô nào đã đi khỏi Việt Nam mà không mở từng hồ sơ.
                'Ngày xuất khẩu',
                msg.customs.table.headers.transport,
                msg.customs.table.headers.exporter,
                msg.customs.table.headers.importer,
                msg.customs.table.headers.total,
                msg.customs.table.headers.status,
                msg.customs.table.headers.actions,
              ].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-gray-600 font-semibold text-xs uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400">{msg.customs.table.loading}</td></tr>
            ) : data?.data?.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400">{msg.customs.table.empty}</td></tr>
            ) : (
              data?.data?.map((record: any) => (
                <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-blue-600">{record.recordNo}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(record.entryDate)}</td>
                  <td className="px-4 py-3 text-gray-600">{record.exitDate ? formatDate(record.exitDate) : '—'}</td>
                  <td className="px-4 py-3">{(transportLabels as Record<string, string>)[record.transportType]}</td>
                  <td className="px-4 py-3 text-gray-700">{record.exporterName}</td>
                  <td className="px-4 py-3 text-gray-700">{record.importerName}</td>
                  <td className="px-4 py-3 font-medium">
                    <Money value={record.totalPayable} currency={record.currency} rate={record.exchangeRate} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${(statusLabels as Record<string, { label: string; color: string }>)[record.status]?.color}`}>
                      {(statusLabels as Record<string, { label: string; color: string }>)[record.status]?.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link href={`/dashboard/customs/${record.id}`} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded" title={msg.customs.table.actions.view}>
                        <Eye className="h-4 w-4" />
                      </Link>
                      <Link href={`/dashboard/customs/${record.id}/edit`} className="rounded p-1.5 text-amber-600 hover:bg-amber-50" title="Sửa tờ khai">
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button onClick={() => handleExport(record.id, record.recordNo)} className="p-1.5 text-green-500 hover:bg-green-50 rounded" title="Tải Excel">
                        <FileSpreadsheet className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleExportPdf(record.id, record.recordNo)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded" title="Tải PDF">
                        <FileText className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <p className="text-sm text-gray-500">{msg.customs.table.pagination.total.replace('{count}', String(data.total))}</p>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 text-sm border rounded disabled:opacity-50">{msg.customs.table.pagination.prev}</button>
            <span className="px-3 py-1 text-sm">{page} / {data.totalPages}</span>
            <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 text-sm border rounded disabled:opacity-50">{msg.customs.table.pagination.next}</button>
          </div>
        </div>
      )}
    </div>
  );
}
