'use client';

import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, FileSearch, ListTodo, Search, Users } from 'lucide-react';
import { searchApi } from '@/lib/api';
import { formatDateTime, STATUS_LABELS } from '@/lib/utils';
import { useLocale } from '@/components/settings/LocaleProvider';
import type { SearchResults } from '@/types';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [transportFilter, setTransportFilter] = useState('');
  const [onlyFilter, setOnlyFilter] = useState('all');
  const deferredQuery = useDeferredValue(query.trim());
  const { locale } = useLocale();
  const isVietnamese = locale === 'vi';

  const { data, isFetching } = useQuery<SearchResults>({
    queryKey: ['global-search', deferredQuery, statusFilter, transportFilter, onlyFilter],
    queryFn: () => searchApi.global(deferredQuery, {
      status: statusFilter || undefined,
      transportType: transportFilter || undefined,
      only: onlyFilter !== 'all' ? onlyFilter : undefined,
    }).then((response) => response.data),
    enabled: deferredQuery.length >= 2,
  });

  const sections = [
    {
      key: 'customs',
      title: isVietnamese ? 'Tờ khai' : 'Declarations',
      icon: FileSearch,
      items: data?.customs ?? [],
      render: (item: SearchResults['customs'][number]) => (
        <Link href={`/dashboard/customs/${item.id}`} className="block rounded-2xl border border-gray-200 p-4 transition hover:border-blue-300 hover:bg-blue-50">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900">{item.recordNo}</p>
              <p className="mt-1 text-sm text-gray-500">{item.importerName} • {item.exporterName}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_LABELS[item.status]?.color}`}>{STATUS_LABELS[item.status]?.label}</span>
          </div>
        </Link>
      ),
    },
    {
      key: 'companies',
      title: isVietnamese ? 'Công ty' : 'Companies',
      icon: Building2,
      items: data?.companies ?? [],
      render: (item: SearchResults['companies'][number]) => (
        <Link href="/dashboard/companies" className="block rounded-2xl border border-gray-200 p-4 transition hover:border-blue-300 hover:bg-blue-50">
          <p className="font-semibold text-gray-900">{item.name}</p>
          <p className="mt-1 text-sm text-gray-500">{isVietnamese ? 'Cập nhật gần nhất' : 'Last activity'}: {formatDateTime(item.lastActivity)}</p>
        </Link>
      ),
    },
    {
      key: 'users',
      title: isVietnamese ? 'Người dùng' : 'Users',
      icon: Users,
      items: data?.users ?? [],
      render: (item: SearchResults['users'][number]) => (
        <Link href="/dashboard/admin/users" className="block rounded-2xl border border-gray-200 p-4 transition hover:border-blue-300 hover:bg-blue-50">
          <p className="font-semibold text-gray-900">{item.fullName}</p>
          <p className="mt-1 text-sm text-gray-500">{item.email} • {item.role}</p>
        </Link>
      ),
    },
    {
      key: 'tasks',
      title: isVietnamese ? 'Nhiệm vụ' : 'Tasks',
      icon: ListTodo,
      items: data?.tasks ?? [],
      render: (item: SearchResults['tasks'][number]) => (
        <Link href="/dashboard/tasks" className="block rounded-2xl border border-gray-200 p-4 transition hover:border-blue-300 hover:bg-blue-50">
          <p className="font-semibold text-gray-900">{item.title}</p>
          <p className="mt-1 text-sm text-gray-500">{item.assignedTo?.fullName} • {formatDateTime(item.workDate)}</p>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isVietnamese ? 'Tìm kiếm toàn cục' : 'Global search'}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isVietnamese
            ? 'Tìm nhanh tờ khai, công ty, tài khoản và nhiệm vụ từ một ô tìm kiếm duy nhất.'
            : 'Search declarations, companies, users, and tasks from a single box.'}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isVietnamese ? 'Nhập số tờ khai, tên công ty, email, tên task...' : 'Enter record no, company, email, task name...'}
            className="w-full rounded-2xl border border-gray-300 py-3 pl-12 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <select
            value={onlyFilter}
            onChange={(event) => setOnlyFilter(event.target.value)}
            className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">{isVietnamese ? 'Tất cả nhóm' : 'All groups'}</option>
            <option value="customs">{isVietnamese ? 'Chỉ tờ khai' : 'Declarations only'}</option>
            <option value="companies">{isVietnamese ? 'Chỉ công ty' : 'Companies only'}</option>
            <option value="users">{isVietnamese ? 'Chỉ người dùng' : 'Users only'}</option>
            <option value="tasks">{isVietnamese ? 'Chỉ nhiệm vụ' : 'Tasks only'}</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">{isVietnamese ? 'Mọi trạng thái tờ khai' : 'Any declaration status'}</option>
            <option value="DRAFT">{isVietnamese ? 'Nháp' : 'Draft'}</option>
            <option value="SUBMITTED">{isVietnamese ? 'Đã nộp' : 'Submitted'}</option>
            <option value="PROCESSING">{isVietnamese ? 'Đang xử lý' : 'Processing'}</option>
            <option value="APPROVED">{isVietnamese ? 'Đã duyệt' : 'Approved'}</option>
            <option value="REJECTED">{isVietnamese ? 'Từ chối' : 'Rejected'}</option>
            <option value="COMPLETED">{isVietnamese ? 'Hoàn thành' : 'Completed'}</option>
          </select>

          <select
            value={transportFilter}
            onChange={(event) => setTransportFilter(event.target.value)}
            className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">{isVietnamese ? 'Mọi loại vận chuyển' : 'Any transport'}</option>
            <option value="AIR">{isVietnamese ? 'Đường hàng không' : 'Air'}</option>
            <option value="SEA">{isVietnamese ? 'Đường biển' : 'Sea'}</option>
            <option value="RAIL">{isVietnamese ? 'Đường sắt' : 'Rail'}</option>
            <option value="ROAD">{isVietnamese ? 'Đường bộ' : 'Road'}</option>
          </select>
        </div>
      </div>

      {deferredQuery.length < 2 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
          {isVietnamese ? 'Nhập ít nhất 2 ký tự để bắt đầu tìm kiếm.' : 'Type at least 2 characters to start searching.'}
        </div>
      ) : (
        <div className="space-y-6">
          {isFetching && <p className="text-sm text-gray-500">{isVietnamese ? 'Đang tải kết quả...' : 'Loading results...'}</p>}
          {sections.map(({ key, title, icon: Icon, items, render }) => (
            <section key={key} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Icon className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-gray-500">{isVietnamese ? 'Không có kết quả phù hợp.' : 'No matching results.'}</p>
              ) : (
                <div className="grid gap-3">{items.map((item: any) => <div key={item.id || item.name}>{render(item)}</div>)}</div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}