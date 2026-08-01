'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BarChart3, FilePlus2, FileText, ShieldCheck, Users } from 'lucide-react';
import { customsApi, usersApi } from '@/lib/api';
import { formatCurrency, formatDateTime, STATUS_LABELS, TRANSPORT_LABELS } from '@/lib/utils';
import { useLocale } from '@/components/settings/LocaleProvider';

type DashboardOverviewProps = {
  role: string;
  userName: string;
};

export function DashboardOverview({ role, userName }: DashboardOverviewProps) {
  const isAdmin = role === 'ADMIN';
  const canManageUsers = role === 'ADMIN' || role === 'DIRECTOR';
  const { locale } = useLocale();

  const { data: recordsData, isLoading: isRecordsLoading } = useQuery({
    queryKey: ['dashboard-records', role],
    queryFn: () => customsApi.getAll({ page: 1, limit: 5 }).then((response) => response.data),
  });

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => customsApi.getStats().then((response) => response.data),
    enabled: isAdmin,
  });

  const { data: users } = useQuery({
    queryKey: ['dashboard-users'],
    queryFn: () => usersApi.getAll().then((response) => response.data),
    enabled: canManageUsers,
  });

  const recentRecords = recordsData?.data ?? [];
  const activeUsers = users?.filter((user: any) => user.isActive).length ?? 0;
  const adminUsers = users?.filter((user: any) => user.role === 'ADMIN').length ?? 0;
  const directorUsers = users?.filter((user: any) => user.role === 'DIRECTOR').length ?? 0;
  const processingRecords = recentRecords.filter((record: any) => record.status === 'PROCESSING').length;
  const draftRecords = recentRecords.filter((record: any) => record.status === 'DRAFT').length;
  const roleLabel = locale === 'vi'
    ? { ADMIN: 'Quản trị viên', DIRECTOR: 'Giám đốc', STAFF: 'Nhân viên', VIEWER: 'Người xem' }[role as 'ADMIN' | 'DIRECTOR' | 'STAFF' | 'VIEWER'] ?? role
    : { ADMIN: 'Administrator', DIRECTOR: 'Director', STAFF: 'Staff', VIEWER: 'Viewer' }[role as 'ADMIN' | 'DIRECTOR' | 'STAFF' | 'VIEWER'] ?? role;

  const copy = locale === 'vi'
    ? {
        badge: 'Tổng quan vận hành',
        greeting: 'Xin chào',
        introAdmin: 'Bạn có thể theo dõi toàn bộ hệ thống, luồng xử lý hồ sơ và tình trạng người dùng từ một màn hình.',
        introStaff: 'Đây là tầm nhìn nhanh về những hồ sơ gần đây, mục cần xử lý và các thao tác thường dùng của bạn.',
        status: 'Trạng thái',
        visibleRecords: 'Tờ khai hiển thị',
        recentRecords: 'Tờ khai gần đây',
        recentRecordsHint: 'Cập nhật nhanh các tờ khai vừa tạo hoặc vừa thay đổi',
        viewAll: 'Xem tất cả',
        loading: 'Đang tải dữ liệu...',
        empty: 'Chưa có hồ sơ nào để hiển thị.',
        updatedAt: 'Cập nhật',
        viewDetails: 'Xem chi tiết',
        quickActions: 'Thao tác nhanh',
        priorities: 'Ưu tiên hôm nay',
        backlogTitle: 'Xử lý hồ sơ đang tồn',
        backlogSuffix: 'hồ sơ đang chờ xử lý.',
        activeAccountsTitle: 'Tài khoản đang hoạt động',
        activeAccountsSuffix: 'người dùng đang có thể truy cập hệ thống.',
      }
    : {
        badge: 'Operations overview',
        greeting: 'Hello',
        introAdmin: 'Track the whole platform, declaration flow, and user activity from a single workspace.',
        introStaff: 'This is your quick view of recent declarations, pending work, and common actions.',
        status: 'Current role',
        visibleRecords: 'Visible records',
        recentRecords: 'Recent records',
        recentRecordsHint: 'Quick access to the declarations that changed most recently',
        viewAll: 'View all',
        loading: 'Loading data...',
        empty: 'No records available yet.',
        updatedAt: 'Updated',
        viewDetails: 'View details',
        quickActions: 'Quick actions',
        priorities: 'Today priorities',
        backlogTitle: 'Outstanding processing work',
        backlogSuffix: 'records are waiting for processing.',
        activeAccountsTitle: 'Active accounts',
        activeAccountsSuffix: 'users can access the platform right now.',
      };

  const summaryCards = [
    {
      label: isAdmin ? (locale === 'vi' ? 'Tổng tờ khai hệ thống' : 'Total declarations') : (locale === 'vi' ? 'Tờ khai gần đây' : 'Recent declarations'),
      value: isAdmin ? stats?.total ?? 0 : recordsData?.total ?? 0,
      hint: isAdmin ? (locale === 'vi' ? 'Toàn bộ dữ liệu đang theo dõi' : 'All tracked records') : (locale === 'vi' ? 'Các hồ sơ bạn có thể truy cập' : 'Records currently visible to you'),
      icon: FileText,
      tone: 'bg-blue-50 text-blue-700 border-blue-100',
    },
    {
      label: locale === 'vi' ? 'Đang xử lý' : 'In progress',
      value: isAdmin
        ? stats?.byStatus?.find((item: any) => item.status === 'PROCESSING')?._count ?? 0
        : processingRecords,
      hint: locale === 'vi' ? 'Cần ưu tiên theo dõi' : 'Needs immediate attention',
      icon: BarChart3,
      tone: 'bg-amber-50 text-amber-700 border-amber-100',
    },
    {
      label: isAdmin ? (locale === 'vi' ? 'Tài khoản giám đốc' : 'Director accounts') : (locale === 'vi' ? 'Bản nháp gần đây' : 'Recent drafts'),
      value: isAdmin ? directorUsers : draftRecords,
      hint: isAdmin ? (locale === 'vi' ? 'Giám đốc đang quản lý các công ty' : 'Directors managing companies') : (locale === 'vi' ? 'Tờ khai cần hoàn thiện' : 'Records that still need completion'),
      icon: isAdmin ? Users : FilePlus2,
      tone: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
    {
      label: isAdmin ? (locale === 'vi' ? 'Tài khoản quản trị' : 'Admin accounts') : (locale === 'vi' ? 'Vai trò hiện tại' : 'Current role'),
      value: isAdmin ? adminUsers : roleLabel,
      hint: isAdmin ? (locale === 'vi' ? 'Nhân sự có quyền điều phối' : 'People allowed to coordinate work') : (locale === 'vi' ? 'Phạm vi truy cập của bạn' : 'Your current access scope'),
      icon: ShieldCheck,
      tone: 'bg-violet-50 text-violet-700 border-violet-100',
    },
  ];

  const quickActions = [
    { href: '/dashboard/customs/new', label: locale === 'vi' ? 'Tạo tờ khai mới' : 'Create declaration', description: locale === 'vi' ? 'Khởi tạo hồ sơ xuất nhập khẩu mới' : 'Open a fresh import-export declaration' },
    { href: '/dashboard/search', label: locale === 'vi' ? 'Tìm kiếm toàn cục' : 'Global search', description: locale === 'vi' ? 'Tìm nhanh hồ sơ, công ty, người dùng và task' : 'Search records, companies, users, and tasks' },
    { href: '/dashboard/companies', label: locale === 'vi' ? 'Danh sách công ty' : 'Company directory', description: locale === 'vi' ? 'Theo dõi các doanh nghiệp đang xuất nhập khẩu' : 'Review companies active in import-export flows' },
    { href: '/dashboard/tasks', label: locale === 'vi' ? 'Giao việc hôm nay' : 'Daily tasks', description: locale === 'vi' ? 'Xem và cập nhật nhiệm vụ trong ngày' : 'Review and update daily assignments' },
    ...(canManageUsers
      ? [{ href: '/dashboard/admin/users', label: locale === 'vi' ? 'Điều phối người dùng' : 'Manage users', description: locale === 'vi' ? 'Kiểm soát vai trò và trạng thái tài khoản' : 'Control user roles and account status' }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-800 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-200">{copy.badge}</p>
            <h1 className="mt-3 text-3xl font-bold">{copy.greeting} {userName}</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-100">
              {isAdmin ? copy.introAdmin : copy.introStaff}
            </p>
          </div>

          <div className="grid min-w-[280px] grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-cyan-100">{copy.status}</p>
              <p className="mt-2 text-xl font-semibold">{roleLabel}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-cyan-100">{copy.visibleRecords}</p>
              <p className="mt-2 text-xl font-semibold">{recentRecords.length}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ label, value, hint, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`inline-flex rounded-xl border px-3 py-3 ${tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {isStatsLoading && isAdmin ? '...' : value}
            </p>
            <p className="mt-2 text-sm text-slate-500">{hint}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{copy.recentRecords}</h2>
              <p className="text-sm text-slate-500">{copy.recentRecordsHint}</p>
            </div>
            <Link href="/dashboard/customs" className="inline-flex items-center gap-2 text-sm font-medium text-blue-700">
              {copy.viewAll}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {isRecordsLoading ? (
              <p className="px-5 py-10 text-sm text-slate-400">{copy.loading}</p>
            ) : recentRecords.length === 0 ? (
              <p className="px-5 py-10 text-sm text-slate-400">{copy.empty}</p>
            ) : (
              recentRecords.map((record: any) => (
                <div key={record.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-slate-900">{record.recordNo}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_LABELS[record.status]?.color ?? 'bg-slate-100 text-slate-700'}`}>
                        {STATUS_LABELS[record.status]?.label ?? record.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {record.importerName} • {TRANSPORT_LABELS[record.transportType] ?? record.transportType}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {copy.updatedAt} {formatDateTime(record.updatedAt)}
                    </p>
                  </div>
                  <div className="text-left lg:text-right">
                    <p className="font-semibold text-slate-900">{formatCurrency(record.totalPayable, record.currency)}</p>
                    <Link href={`/dashboard/customs/${record.id}`} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-blue-700">
                      {copy.viewDetails}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{copy.quickActions}</h2>
            <div className="mt-4 space-y-3">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="block rounded-2xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{action.label}</p>
                      <p className="mt-1 text-sm text-slate-500">{action.description}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {isAdmin && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{copy.priorities}</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="rounded-2xl bg-amber-50 p-4 text-amber-900">
                  <p className="font-semibold">{copy.backlogTitle}</p>
                  <p className="mt-1">
                    {stats?.byStatus?.find((item: any) => item.status === 'PROCESSING')?._count ?? 0} {copy.backlogSuffix}
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
                  <p className="font-semibold">{copy.activeAccountsTitle}</p>
                  <p className="mt-1">{activeUsers} {copy.activeAccountsSuffix}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}