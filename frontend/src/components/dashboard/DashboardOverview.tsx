'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  Clock3,
  FilePlus2,
  FileText,
  Plane,
  Search,
  Ship,
  Train,
  Truck,
  Users,
} from 'lucide-react';
import { customsApi, usersApi } from '@/lib/api';
import { formatDateTime, roleLabel, STATUS_LABELS, TRANSPORT_LABELS } from '@/lib/utils';
import { convertMoney, formatMoneyIn } from '@/lib/money';
import { compactCurrency, compactNumber, formatMonthKey, STATUS_COLOR_VAR, STATUS_ORDER, TRANSPORT_ORDER } from '@/lib/viz';
import { useLocale } from '@/components/settings/LocaleProvider';
import { CurrencyToggle, Money, useDisplayCurrency } from '@/components/settings/CurrencyProvider';
import { ChartCard, VizTable } from '@/components/charts/ChartCard';
import { TrendChart } from '@/components/charts/TrendChart';
import { StackedBar } from '@/components/charts/StackedBar';
import { RankedBars } from '@/components/charts/RankedBars';
import { StatTile } from '@/components/charts/StatTile';
import { Skeleton } from '@/components/ui/Skeleton';

type DashboardOverviewProps = {
  role: string;
  userName: string;
};

const TRANSPORT_ICON = { SEA: Ship, AIR: Plane, ROAD: Truck, RAIL: Train } as const;

export function DashboardOverview({ role, userName }: DashboardOverviewProps) {
  const isAdmin = role === 'ADMIN';
  const canManageUsers = role === 'ADMIN' || role === 'DIRECTOR';
  const { locale } = useLocale();
  const { display } = useDisplayCurrency();
  const vi = locale === 'vi';
  // Số liệu tổng hợp từ backend đã quy về USD; đổi tiếp sang đồng tiền đang xem.
  const money = (value: number) => compactCurrency(convertMoney(value, 'USD', display), display, vi ? 'vi-VN' : 'en-US');

  // Khoá cache bắt đầu bằng 'customs' để mọi thao tác sửa/xoá tờ khai (đều làm mới
  // nhóm 'customs') kéo theo cả bảng điều khiển. Trước đây trang này dùng khoá riêng
  // 'dashboard-records' / 'dashboard-stats', nên xoá một tờ khai xong quay lại tổng
  // quan vẫn thấy nó trong danh sách và vẫn được đếm vào các chỉ số.
  const { data: recordsData, isLoading: isRecordsLoading } = useQuery({
    queryKey: ['customs', 'recent', role],
    queryFn: () => customsApi.getAll({ page: 1, limit: 6 }).then((response) => response.data),
  });

  // Thống kê giờ mở cho mọi vai trò — trước đây chỉ ADMIN gọi được, nên nhân viên
  // nhìn thấy một dashboard rỗng dù vẫn đọc được chính những tờ khai đó.
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['customs', 'stats'],
    queryFn: () => customsApi.getStats().then((response) => response.data),
  });

  const { data: users } = useQuery({
    queryKey: ['dashboard-users'],
    queryFn: () => usersApi.getAll().then((response) => response.data),
    enabled: canManageUsers,
  });

  const recentRecords = recordsData?.data ?? [];
  const activeUsers = users?.filter((user: any) => user.isActive).length ?? 0;

  const countOf = (status: string) =>
    stats?.byStatus?.find((item: any) => item.status === status)?._count ?? 0;

  const trend = stats?.trend ?? [];
  const trendData = trend.map((point: any) => ({
    label: formatMonthKey(point.month, locale),
    value: point.count,
    hint: formatMonthKey(point.month, locale),
  }));
  const trendCounts = trend.map((point: any) => point.count);

  // Dùng ROLE_LABELS chung thay vì tự khai bảng nhãn tại đây - trước kia trang này
  // gọi ADMIN là "Quản trị viên" trong khi trang Người dùng gọi là "Giám đốc".
  const currentRoleLabel = vi
    ? roleLabel(role)
    : { ADMIN: 'Director', DIRECTOR: 'Manager', STAFF: 'Staff', VIEWER: 'Viewer' }[role as string] ?? role;

  const copy = vi
    ? {
        badge: 'Tổng quan vận hành',
        greeting: 'Xin chào',
        status: 'Vai trò',
        activeAccounts: 'Tài khoản hoạt động',
        totalRecords: 'Tổng tờ khai',
        totalRecordsHint: 'Toàn bộ hồ sơ đang theo dõi',
        processing: 'Đang xử lý',
        processingHint: 'Cần ưu tiên theo dõi',
        totalValue: 'Tổng giá trị',
        totalValueHint: 'Đã quy đổi về',
        approved: 'Đã duyệt',
        approvedHint: 'Hồ sơ đã được thông qua',
        vsLastMonth: 'so với tháng trước',
        trendTitle: 'Tờ khai theo tháng',
        trendSubtitle: '12 tháng gần nhất, tính theo ngày bắt đầu vận chuyển',
        trendUnit: 'tờ khai',
        statusTitle: 'Phân bổ trạng thái',
        statusSubtitle: 'Tỷ trọng hồ sơ theo từng bước xử lý',
        transportTitle: 'Loại hình vận chuyển',
        transportSubtitle: 'Số tờ khai theo phương thức',
        companiesTitle: 'Doanh nghiệp dẫn đầu',
        companiesSubtitle: 'Top 5 nhà nhập khẩu theo giá trị',
        recentRecords: 'Tờ khai gần đây',
        recentRecordsHint: 'Cập nhật nhanh các tờ khai vừa tạo hoặc vừa thay đổi',
        viewAll: 'Xem tất cả',
        empty: 'Chưa có hồ sơ nào để hiển thị.',
        emptyCta: 'Tạo tờ khai đầu tiên',
        updatedAt: 'Cập nhật',
        viewDetails: 'Xem chi tiết',
        quickActions: 'Thao tác nhanh',
        month: 'Tháng',
        count: 'Số tờ khai',
        statusCol: 'Trạng thái',
        companyCol: 'Doanh nghiệp',
        valueCol: 'Giá trị',
        transportCol: 'Phương thức',
        tableView: 'Xem bảng',
        chartView: 'Xem biểu đồ',
      }
    : {
        badge: 'Operations overview',
        greeting: 'Hello',
        status: 'Role',
        activeAccounts: 'Active accounts',
        totalRecords: 'Total declarations',
        totalRecordsHint: 'All tracked records',
        processing: 'In progress',
        processingHint: 'Needs immediate attention',
        totalValue: 'Total value',
        totalValueHint: 'Normalised to',
        approved: 'Approved',
        approvedHint: 'Records cleared for release',
        vsLastMonth: 'vs last month',
        trendTitle: 'Declarations per month',
        trendSubtitle: 'Last 12 months, by transport start date',
        trendUnit: 'records',
        statusTitle: 'Status distribution',
        statusSubtitle: 'Share of records at each processing step',
        transportTitle: 'Transport mode',
        transportSubtitle: 'Declarations by shipping method',
        companiesTitle: 'Leading companies',
        companiesSubtitle: 'Top 5 importers by value',
        recentRecords: 'Recent records',
        recentRecordsHint: 'Quick access to the declarations that changed most recently',
        viewAll: 'View all',
        empty: 'No records available yet.',
        emptyCta: 'Create your first declaration',
        updatedAt: 'Updated',
        viewDetails: 'View details',
        quickActions: 'Quick actions',
        month: 'Month',
        count: 'Records',
        statusCol: 'Status',
        companyCol: 'Company',
        valueCol: 'Value',
        transportCol: 'Mode',
        tableView: 'Table view',
        chartView: 'Chart view',
      };

  const statusSegments = STATUS_ORDER.map((key) => ({
    key,
    label: STATUS_LABELS[key]?.label ?? key,
    value: countOf(key),
    color: STATUS_COLOR_VAR[key],
  }));

  const transportRows = TRANSPORT_ORDER.map((key) => ({
    key,
    label: TRANSPORT_LABELS[key] ?? key,
    value: stats?.byTransport?.find((item: any) => item.transportType === key)?._count ?? 0,
  })).sort((a, b) => b.value - a.value);

  const companyRows = (stats?.topCompanies ?? []).map((company: any) => ({
    key: company.name,
    label: company.name,
    value: company.value,
    caption: `${company.count} ${vi ? 'hồ sơ' : 'records'}`,
  }));

  const quickActions = [
    { href: '/dashboard/customs/new', icon: FilePlus2, label: vi ? 'Tạo tờ khai mới' : 'Create declaration', description: vi ? 'Khởi tạo hồ sơ xuất nhập khẩu mới' : 'Open a fresh declaration' },
    { href: '/dashboard/search', icon: Search, label: vi ? 'Tìm kiếm toàn cục' : 'Global search', description: vi ? 'Tìm nhanh hồ sơ, công ty, người dùng' : 'Search records, companies, users' },
    { href: '/dashboard/reports', icon: BarChart3, label: vi ? 'Báo cáo & phân tích' : 'Reports & analytics', description: vi ? 'Thống kê và xuất dữ liệu ra Excel' : 'Analytics and Excel export' },
    ...(canManageUsers
      ? [{ href: '/dashboard/admin/users', icon: Users, label: vi ? 'Điều phối người dùng' : 'Manage users', description: vi ? 'Kiểm soát vai trò và trạng thái tài khoản' : 'Control roles and account status' }]
      : []),
  ];

  const totalPayable = stats?.totals?.payable ?? 0;
  const momentum = stats?.momentum;

  return (
    <div className="space-y-6">
      {/* Đầu trang */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-800 p-6 text-white shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl"
        />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-200">{copy.badge}</p>
            <h1 className="mt-3 text-3xl font-bold">
              {copy.greeting} {userName}
            </h1>
          </div>

          <div className="grid min-w-[280px] grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-cyan-100">{copy.status}</p>
              <p className="mt-2 text-xl font-semibold">{currentRoleLabel}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-cyan-100">{canManageUsers ? copy.activeAccounts : copy.totalRecords}</p>
              <p className="mt-2 text-xl font-semibold">
                {canManageUsers ? activeUsers : (stats?.total ?? 0)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Hàng chỉ số */}
      <div className="flex items-center justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
        {vi ? 'Xem tiền theo' : 'Show money in'}
        <CurrencyToggle />
      </div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={copy.totalRecords}
          value={compactNumber(stats?.total ?? 0)}
          hint={copy.totalRecordsHint}
          icon={FileText}
          loading={isStatsLoading}
          trend={trendCounts}
          deltaPercent={momentum?.changePct}
          deltaLabel={copy.vsLastMonth}
        />
        <StatTile
          label={copy.processing}
          value={countOf('PROCESSING')}
          hint={copy.processingHint}
          icon={Clock3}
          loading={isStatsLoading}
          higherIsBetter={false}
        />
        <StatTile
          label={copy.totalValue}
          value={money(totalPayable)}
          // Ghi đúng đồng tiền đang hiển thị. Nhãn cứng "Đã quy đổi về USD" là sai
          // hẳn khi người dùng đang xem bằng VND.
          hint={`${copy.totalValueHint} ${display}`}
          icon={CircleDollarSign}
          loading={isStatsLoading}
        />
        <StatTile
          label={copy.approved}
          value={countOf('APPROVED') + countOf('COMPLETED')}
          hint={copy.approvedHint}
          icon={BarChart3}
          loading={isStatsLoading}
        />
      </section>

      {/* Xu hướng + phân bổ trạng thái */}
      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <ChartCard
          title={copy.trendTitle}
          subtitle={copy.trendSubtitle}
          tableLabel={copy.tableView}
          chartLabel={copy.chartView}
          table={
            <VizTable
              head={[copy.month, copy.count]}
              rows={trend.map((point: any) => [formatMonthKey(point.month, locale), point.count])}
            />
          }
        >
          {isStatsLoading ? (
            <Skeleton className="h-[260px] w-full rounded-xl" />
          ) : (
            <TrendChart data={trendData} valueLabel={copy.trendUnit} />
          )}
        </ChartCard>

        <ChartCard
          title={copy.statusTitle}
          subtitle={copy.statusSubtitle}
          tableLabel={copy.tableView}
          chartLabel={copy.chartView}
          table={
            <VizTable
              head={[copy.statusCol, copy.count]}
              rows={statusSegments.map((segment) => [segment.label, segment.value])}
            />
          }
        >
          {isStatsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-[22px] w-full rounded-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <StackedBar segments={statusSegments} unit={vi ? 'hồ sơ' : ''} />
          )}
        </ChartCard>
      </section>

      {/* Vận chuyển + doanh nghiệp + thao tác nhanh */}
      <section className="grid gap-6 xl:grid-cols-3">
        <ChartCard
          title={copy.transportTitle}
          subtitle={copy.transportSubtitle}
          tableLabel={copy.tableView}
          chartLabel={copy.chartView}
          table={
            <VizTable
              head={[copy.transportCol, copy.count]}
              rows={transportRows.map((row) => [row.label, row.value])}
            />
          }
        >
          {isStatsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <RankedBars rows={transportRows} emptyLabel={copy.empty} />
          )}
        </ChartCard>

        <ChartCard
          title={copy.companiesTitle}
          subtitle={copy.companiesSubtitle}
          tableLabel={copy.tableView}
          chartLabel={copy.chartView}
          table={
            <VizTable
              head={[copy.companyCol, copy.valueCol]}
              rows={companyRows.map((row: any) => [row.label, formatMoneyIn(row.value, 'USD', display)])}
            />
          }
        >
          {isStatsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <RankedBars
              rows={companyRows}
              emptyLabel={copy.empty}
              formatValue={money}
            />
          )}
        </ChartCard>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">{copy.quickActions}</h2>
          <div className="mt-4 space-y-2.5">
            {quickActions.map(({ href, icon: Icon, label, description }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <span className="rounded-lg bg-slate-50 p-2 text-slate-500 transition group-hover:bg-white group-hover:text-blue-600">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{label}</span>
                  <span className="block truncate text-xs text-slate-500">{description}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Tờ khai gần đây */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{copy.recentRecords}</h2>
            <p className="text-sm text-slate-500">{copy.recentRecordsHint}</p>
          </div>
          <Link
            href="/dashboard/customs"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 transition hover:gap-3"
          >
            {copy.viewAll}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="divide-y divide-slate-100">
          {isRecordsLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
            ))
          ) : recentRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
              <span className="rounded-2xl bg-slate-50 p-4 text-slate-300">
                <FileText className="h-8 w-8" />
              </span>
              <p className="text-sm text-slate-500">{copy.empty}</p>
              <Link
                href="/dashboard/customs/new"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                <FilePlus2 className="h-4 w-4" />
                {copy.emptyCta}
              </Link>
            </div>
          ) : (
            recentRecords.map((record: any) => {
              const TransportIcon = TRANSPORT_ICON[record.transportType as keyof typeof TRANSPORT_ICON] ?? Ship;
              return (
                <div
                  key={record.id}
                  className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/70 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 rounded-lg bg-slate-50 p-2 text-slate-400">
                      <TransportIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{record.recordNo}</p>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            STATUS_LABELS[record.status]?.color ?? 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {STATUS_LABELS[record.status]?.label ?? record.status}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {record.importerName} • {TRANSPORT_LABELS[record.transportType] ?? record.transportType}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {copy.updatedAt} {formatDateTime(record.updatedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-left lg:text-right">
                    <p className="font-semibold tabular-nums text-slate-900">
                      <Money value={record.totalPayable} currency={record.currency} rate={record.exchangeRate} />
                    </p>
                    <Link
                      href={`/dashboard/customs/${record.id}`}
                      className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-blue-700 transition hover:gap-2"
                    >
                      {copy.viewDetails}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
