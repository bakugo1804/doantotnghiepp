'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { customsApi, reportsApi, downloadBlob } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useMessages } from '@/hooks/useMessages';
import { useStatusLabels, useTransportLabels } from '@/hooks/useCustomsLabels';
import { useDeleteCustoms } from '@/hooks/useCustoms';
import { CurrencyToggle, Money } from '@/components/settings/CurrencyProvider';
import { DeleteCustomsDialog, type DeleteTarget } from '@/components/customs/DeleteCustomsDialog';
import { ArrowDown, ArrowUp, ChevronsUpDown, Eye, Search, FileSpreadsheet, FileText, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';

/** Cột nào sắp xếp được, và sắp theo trường nào ở phía máy chủ. */
type SortField =
  | 'recordNo'
  | 'entryDate'
  | 'exitDate'
  | 'transportType'
  | 'exporterName'
  | 'importerName'
  | 'totalPayable'
  | 'status';

export function CustomsTable() {
  const msg = useMessages();
  const statusLabels = useStatusLabels();
  const transportLabels = useTransportLabels();
  const { data: session } = useSession();
  // Xoá tờ khai là quyền của cấp quản lý (xem @Roles ở customs.controller). Vai trò
  // khác thì không hiện nút, thay vì hiện một nút bấm vào là báo lỗi 403.
  const role = (session?.user as any)?.role as string | undefined;
  const canDelete = role === 'ADMIN' || role === 'DIRECTOR';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('entryDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleted, setDeleted] = useState('');
  const deleteCustoms = useDeleteCustoms();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['customs', page, debouncedSearch, sortBy, sortDir],
    queryFn: () =>
      customsApi.getAll({ page, limit: 20, search: debouncedSearch || undefined, sortBy, sortDir }).then((r) => r.data),
  });

  /**
   * Bấm vào tiêu đề cột để sắp xếp; bấm lại đổi chiều.
   *
   * Việc sắp xếp do máy chủ làm, không phải sắp lại 20 dòng của trang hiện tại -
   * bảng có phân trang nên sắp ở phía giao diện sẽ bỏ sót dữ liệu ở các trang khác.
   */
  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      // Ngày và số tiền thì lần đầu ai cũng muốn xem cái lớn nhất trước.
      setSortDir(field === 'recordNo' || field === 'exporterName' || field === 'importerName' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => {
    const active = sortBy === field;
    const Icon = !active ? ChevronsUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className="px-4 py-3 text-left">
        <button
          onClick={() => toggleSort(field)}
          title={`Sắp xếp theo ${label}`}
          className={`group inline-flex items-center gap-1.5 text-xs font-semibold uppercase transition ${
            active ? 'text-blue-700' : 'text-gray-600 hover:text-blue-700'
          }`}
        >
          {label}
          <Icon className={`h-3.5 w-3.5 shrink-0 transition ${active ? 'opacity-100' : 'opacity-30 group-hover:opacity-70'}`} />
        </button>
      </th>
    );
  };

  const handleExport = async (id: string, recordNo: string) => {
    const res = await reportsApi.exportExcel(id);
    downloadBlob(res.data, `to-khai-${recordNo}.xlsx`);
  };

  const handleExportPdf = async (id: string, recordNo: string) => {
    const res = await reportsApi.exportPdf(id);
    downloadBlob(res.data, `to-khai-${recordNo}.pdf`);
  };

  const openDelete = (record: { id: string; recordNo: string }) => {
    setDeleteTarget({ id: record.id, recordNo: record.recordNo });
    setConfirmText('');
    setDeleteError('');
    setDeleted('');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError('');
    try {
      const result = await deleteCustoms.mutateAsync(deleteTarget.id);
      // Nói lại đúng những gì đã mất, kể cả phần công việc bị mất liên kết.
      const extra = result?.unlinkedTasks > 0 ? ` · ${result.unlinkedTasks} công việc mất liên kết` : '';
      setDeleted(`Đã xoá tờ khai ${deleteTarget.recordNo}${extra}.`);
      setDeleteTarget(null);
    } catch (error: any) {
      const detail = error?.response?.data?.message;
      setDeleteError((Array.isArray(detail) ? detail[0] : detail) || 'Không xoá được tờ khai này.');
    }
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

      {deleted && (
        <div className="flex items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <span>{deleted}</span>
          <button onClick={() => setDeleted('')} className="rounded px-2 py-0.5 text-xs font-medium transition hover:bg-emerald-100">
            Đóng
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <SortHeader field="recordNo" label={msg.customs.table.headers.recordNo} />
              {/* Hai mốc đầu - cuối của hành trình vận chuyển. Trước đây bảng chỉ có
                  một cột "Ngày nhập", không biết lô nào đã tới đích. */}
              <SortHeader field="entryDate" label={msg.customs.table.headers.entryDate} />
              <SortHeader field="exitDate" label={msg.customs.table.headers.exitDate} />
              <SortHeader field="transportType" label={msg.customs.table.headers.transport} />
              <SortHeader field="exporterName" label={msg.customs.table.headers.exporter} />
              <SortHeader field="importerName" label={msg.customs.table.headers.importer} />
              <SortHeader field="totalPayable" label={msg.customs.table.headers.total} />
              <SortHeader field="status" label={msg.customs.table.headers.status} />
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">
                {msg.customs.table.headers.actions}
              </th>
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
                      {canDelete && (
                        <button
                          onClick={() => openDelete(record)}
                          className="rounded p-1.5 text-red-500 transition hover:bg-red-50"
                          title={`Xoá tờ khai ${record.recordNo}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
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

      <DeleteCustomsDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        deleting={deleteCustoms.isPending}
        error={deleteError}
        confirmText={confirmText}
        onConfirmTextChange={setConfirmText}
      />
    </div>
  );
}
