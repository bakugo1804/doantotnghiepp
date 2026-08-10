'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Building2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { companiesApi } from '@/lib/api';
import { useLocale } from '@/components/settings/LocaleProvider';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { CompanySummary } from '@/types';

export default function CompaniesPage() {
  const [search, setSearch] = useState('');
  const [companyForm, setCompanyForm] = useState({ name: '', role: 'BOTH' as CompanySummary['role'], contactEmail: '', contactPhone: '', address: '', notes: '' });
  const [editingCompany, setEditingCompany] = useState<CompanySummary | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: 'BOTH' as CompanySummary['role'], contactEmail: '', contactPhone: '', address: '', notes: '' });
  const deferredSearch = useDeferredValue(search.trim());
  const { locale } = useLocale();
  const { data: session } = useSession();
  const isVietnamese = locale === 'vi';
  const isAdmin = (session?.user as any)?.role === 'ADMIN';
  const queryClient = useQueryClient();

  const { data: companies = [], isLoading } = useQuery<CompanySummary[]>({
    queryKey: ['companies', deferredSearch],
    queryFn: () => companiesApi.getAll({ search: deferredSearch || undefined }).then((response) => response.data),
  });

  const createCompany = useMutation({
    mutationFn: () => companiesApi.create({
      name: companyForm.name.trim(),
      role: companyForm.role,
      contactEmail: companyForm.contactEmail.trim() || undefined,
      contactPhone: companyForm.contactPhone.trim() || undefined,
      address: companyForm.address.trim() || undefined,
      notes: companyForm.notes.trim() || undefined,
    }).then((response) => response.data),
    onSuccess: () => {
      setCompanyForm({ name: '', role: 'BOTH', contactEmail: '', contactPhone: '', address: '', notes: '' });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  const updateCompany = useMutation({
    mutationFn: () => {
      if (!editingCompany) return Promise.reject(new Error('No company selected'));
      return companiesApi.update(editingCompany.id, {
        name: editForm.name.trim(),
        role: editForm.role,
        contactEmail: editForm.contactEmail.trim() || null,
        contactPhone: editForm.contactPhone.trim() || null,
        address: editForm.address.trim() || null,
        notes: editForm.notes.trim() || null,
      }).then((response) => response.data);
    },
    onSuccess: () => {
      setEditingCompany(null);
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      // Đổi tên công ty là đổi luôn tên trên các tờ khai đang mang tên cũ.
      queryClient.invalidateQueries({ queryKey: ['customs'] });
    },
  });

  const deleteCompany = useMutation({
    mutationFn: (id: string) => companiesApi.delete(id).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  const stats = useMemo(() => ({
    total: companies.length,
    exporters: companies.filter((company) => company.role === 'EXPORTER').length,
    importers: companies.filter((company) => company.role === 'IMPORTER').length,
    both: companies.filter((company) => company.role === 'BOTH').length,
  }), [companies]);

  const roleLabel = (role: CompanySummary['role']) => {
    if (isVietnamese) {
      return role === 'BOTH' ? 'Xuất & nhập khẩu' : role === 'EXPORTER' ? 'Nhà xuất khẩu' : 'Nhà nhập khẩu';
    }
    return role === 'BOTH' ? 'Exporter & importer' : role === 'EXPORTER' ? 'Exporter' : 'Importer';
  };

  const openEdit = (company: CompanySummary) => {
    setEditingCompany(company);
    setEditForm({
      name: company.name,
      role: company.role,
      contactEmail: company.contactEmail || '',
      contactPhone: company.contactPhone || '',
      address: company.address || '',
      notes: company.notes || '',
    });
  };

  const handleDelete = (company: CompanySummary) => {
    if (!window.confirm(isVietnamese ? `Xóa công ty ${company.name}?` : `Delete company ${company.name}?`)) return;
    deleteCompany.mutate(company.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isVietnamese ? 'Danh bạ công ty' : 'Company directory'}</h1>
      </div>

      {isAdmin && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><Plus className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{isVietnamese ? 'Thêm công ty mới' : 'Add new company'}</h2>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input value={companyForm.name} onChange={(event) => setCompanyForm((current) => ({ ...current, name: event.target.value }))} placeholder={isVietnamese ? 'Tên công ty' : 'Company name'} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <select value={companyForm.role} onChange={(event) => setCompanyForm((current) => ({ ...current, role: event.target.value as CompanySummary['role'] }))} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option value="BOTH">{isVietnamese ? 'Xuất & nhập khẩu' : 'Exporter & importer'}</option>
              <option value="EXPORTER">{isVietnamese ? 'Nhà xuất khẩu' : 'Exporter'}</option>
              <option value="IMPORTER">{isVietnamese ? 'Nhà nhập khẩu' : 'Importer'}</option>
            </select>
            <input value={companyForm.contactEmail} onChange={(event) => setCompanyForm((current) => ({ ...current, contactEmail: event.target.value }))} placeholder={isVietnamese ? 'Email liên hệ' : 'Contact email'} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <input value={companyForm.contactPhone} onChange={(event) => setCompanyForm((current) => ({ ...current, contactPhone: event.target.value }))} placeholder={isVietnamese ? 'Số điện thoại' : 'Phone number'} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <input value={companyForm.address} onChange={(event) => setCompanyForm((current) => ({ ...current, address: event.target.value }))} placeholder={isVietnamese ? 'Địa chỉ' : 'Address'} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 xl:col-span-2" />
            <textarea value={companyForm.notes} onChange={(event) => setCompanyForm((current) => ({ ...current, notes: event.target.value }))} placeholder={isVietnamese ? 'Ghi chú nội bộ' : 'Internal notes'} rows={3} className="rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 xl:col-span-3" />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button onClick={() => createCompany.mutate()} disabled={createCompany.isPending || !companyForm.name.trim()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60">
              <Plus className="h-4 w-4" />
              {isVietnamese ? 'Lưu công ty' : 'Save company'}
            </button>
            {createCompany.isError && <p className="text-sm text-rose-600">{isVietnamese ? 'Không thể tạo công ty. Có thể tên đã tồn tại.' : 'Unable to create company. The name may already exist.'}</p>}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: isVietnamese ? 'Tổng công ty' : 'Total companies', value: stats.total },
          { label: isVietnamese ? 'Nhà xuất khẩu' : 'Exporters', value: stats.exporters },
          { label: isVietnamese ? 'Nhà nhập khẩu' : 'Importers', value: stats.importers },
          { label: isVietnamese ? 'Hai chiều' : 'Both roles', value: stats.both },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isVietnamese ? 'Tìm theo tên công ty...' : 'Search company names...'}
            className="w-full rounded-2xl border border-gray-300 py-3 pl-12 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {isLoading ? (
          <p className="text-sm text-gray-500">{isVietnamese ? 'Đang tải dữ liệu công ty...' : 'Loading company data...'}</p>
        ) : companies.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
            {isVietnamese ? 'Chưa có công ty phù hợp với bộ lọc hiện tại.' : 'No companies match the current filter.'}
          </div>
        ) : companies.map((company) => (
          <div key={company.name} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="mb-3 inline-flex rounded-xl bg-blue-50 p-3 text-blue-700"><Building2 className="h-5 w-5" /></div>
                <h2 className="text-lg font-semibold text-gray-900">{company.name}</h2>
                <p className="mt-1 text-sm text-gray-500">{roleLabel(company.role)}</p>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{company.recordsCount}</span>
            </div>

            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <dt className="text-gray-500">{isVietnamese ? 'Số hồ sơ' : 'Declarations'}</dt>
                <dd className="font-medium text-gray-900">{company.recordsCount}</dd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <dt className="text-gray-500">{isVietnamese ? 'Tổng giá trị' : 'Total value'}</dt>
                <dd className="font-medium text-gray-900">{formatCurrency(company.totalPayable, company.currency)}</dd>
              </div>
              {company.contactEmail && (
                <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <dt className="text-gray-500">Email</dt>
                  <dd className="font-medium text-gray-900">{company.contactEmail}</dd>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <dt className="text-gray-500">{isVietnamese ? 'Hoạt động gần nhất' : 'Last activity'}</dt>
                <dd className="font-medium text-gray-900">{formatDateTime(company.lastActivity)}</dd>
              </div>
            </dl>

            {isAdmin && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                {/* Công ty sinh ra từ tờ khai cũng sửa được: lần lưu đầu tiên sẽ
                    tạo luôn bản ghi danh bạ cho nó. Chỉ nút Xóa là dành riêng cho
                    bản ghi danh bạ, vì công ty suy ra không có gì để xóa. */}
                <button
                  onClick={() => openEdit(company)}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {isVietnamese ? 'Sửa' : 'Edit'}
                </button>
                {company.isDirectoryEntry && (
                  <button
                    onClick={() => handleDelete(company)}
                    className="inline-flex items-center gap-2 rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {isVietnamese ? 'Xóa' : 'Delete'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {isAdmin && editingCompany && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{isVietnamese ? 'Chỉnh sửa công ty' : 'Edit company'}</h3>
              <button onClick={() => setEditingCompany(null)} className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} placeholder={isVietnamese ? 'Tên công ty' : 'Company name'} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              <select value={editForm.role} onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value as CompanySummary['role'] }))} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                <option value="BOTH">{isVietnamese ? 'Xuất & nhập khẩu' : 'Exporter & importer'}</option>
                <option value="EXPORTER">{isVietnamese ? 'Nhà xuất khẩu' : 'Exporter'}</option>
                <option value="IMPORTER">{isVietnamese ? 'Nhà nhập khẩu' : 'Importer'}</option>
              </select>
              <input value={editForm.contactEmail} onChange={(event) => setEditForm((current) => ({ ...current, contactEmail: event.target.value }))} placeholder={isVietnamese ? 'Email liên hệ' : 'Contact email'} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              <input value={editForm.contactPhone} onChange={(event) => setEditForm((current) => ({ ...current, contactPhone: event.target.value }))} placeholder={isVietnamese ? 'Số điện thoại' : 'Phone number'} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              <input value={editForm.address} onChange={(event) => setEditForm((current) => ({ ...current, address: event.target.value }))} placeholder={isVietnamese ? 'Địa chỉ' : 'Address'} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:col-span-2" />
              <textarea value={editForm.notes} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} placeholder={isVietnamese ? 'Ghi chú' : 'Notes'} rows={3} className="rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:col-span-2" />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button onClick={() => updateCompany.mutate()} disabled={updateCompany.isPending || !editForm.name.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60">
                {isVietnamese ? 'Lưu thay đổi' : 'Save changes'}
              </button>
              <button onClick={() => setEditingCompany(null)} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100">
                {isVietnamese ? 'Hủy' : 'Cancel'}
              </button>
              {updateCompany.isError && (
                <p className="text-sm text-rose-600">
                  {(updateCompany.error as any)?.response?.data?.message || (isVietnamese ? 'Không thể cập nhật công ty.' : 'Unable to update company.')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteCompany.isError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {isVietnamese ? 'Không thể xóa công ty này. Có thể đang được liên kết với dữ liệu khác.' : 'Unable to delete this company. It may still be referenced by other records.'}
        </div>
      )}
    </div>
  );
}