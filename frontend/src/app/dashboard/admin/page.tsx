'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BarChart3, FileClock, ShieldCheck, Truck, Users } from 'lucide-react';
import { customsApi, usersApi } from '@/lib/api';
import { STATUS_LABELS, TRANSPORT_LABELS } from '@/lib/utils';

export default function AdminPage() {
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => customsApi.getStats().then((r) => r.data),
  });

  const { data: users = [], isLoading: isUsersLoading } = useQuery({
    queryKey: ['admin-users-preview'],
    queryFn: () => usersApi.getAll().then((r) => r.data),
  });

  const activeUsers = users.filter((user: any) => user.isActive).length;
  const directorUsers = users.filter((user: any) => user.role === 'DIRECTOR').length;
  const lockedUsers = users.length - activeUsers;
  const processingCount = stats?.byStatus?.find((item: any) => item.status === 'PROCESSING')?._count ?? 0;
  const approvedCount = stats?.byStatus?.find((item: any) => item.status === 'APPROVED')?._count ?? 0;
  const recentUsers = users.slice(0, 5);

  const summaryCards = [
    { label: 'Tổng tờ khai', value: stats?.total ?? 0, icon: BarChart3, tone: 'bg-blue-500', hint: 'Số tờ khai trong hệ thống' },
    { label: 'Đang xử lý', value: processingCount, icon: FileClock, tone: 'bg-amber-500', hint: 'Cần điều phối ưu tiên' },
    { label: 'Đã duyệt', value: approvedCount, icon: ShieldCheck, tone: 'bg-emerald-500', hint: 'Tờ khai đã thông quan' },
    { label: 'Tài khoản giám đốc', value: directorUsers, icon: Users, tone: 'bg-violet-500', hint: 'Giám đốc đang quản lý công ty' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bảng điều khiển quản trị</h1>
          <p className="text-gray-500 text-sm mt-1">Theo dõi luồng xử lý hồ sơ, tài khoản và các điểm nghẽn vận hành.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/admin/users" className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-blue-300 hover:text-blue-700">
            Điều phối người dùng
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ label, value, icon: Icon, tone, hint }) => (
          <div key={label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl ${tone} text-white`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{isStatsLoading && label !== 'Tài khoản giám đốc' ? '...' : value}</p>
            <p className="mt-2 text-sm text-gray-500">{hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Phân bố trạng thái hồ sơ</h2>
              <p className="text-sm text-gray-500">Nhìn nhanh backlog hiện tại theo từng giai đoạn</p>
            </div>
            <Link href="/dashboard/customs" className="inline-flex items-center gap-2 text-sm font-medium text-blue-700">
              Xem hồ sơ
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-4 p-5">
            {stats?.byStatus?.map((item: any) => (
              <div key={item.status}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">{STATUS_LABELS[item.status]?.label ?? item.status}</span>
                  <span className="text-gray-500">{item._count}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{ width: `${stats?.total ? (item._count / stats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Kênh vận chuyển</h2>
            </div>
            <div className="mt-4 space-y-3">
              {stats?.byTransport?.map((item: any) => (
                <div key={item.transportType} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm">
                  <span className="font-medium text-gray-700">{TRANSPORT_LABELS[item.transportType] ?? item.transportType}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">{item._count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Tài khoản mới nhất</h2>
              <span className="text-sm text-gray-500">{isUsersLoading ? 'Đang tải...' : `${lockedUsers} tài khoản đang khóa`}</span>
            </div>
            <div className="mt-4 space-y-3">
              {recentUsers.map((user: any) => (
                <div key={user.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{user.fullName}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {user.isActive ? user.role : 'LOCKED'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
