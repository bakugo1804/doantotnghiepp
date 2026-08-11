'use client';

import { useMemo, useState } from 'react';
import {
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Receipt,
  Search,
  Wallet,
} from 'lucide-react';
import { customsApi, reportsApi, downloadBlob } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useCustomsList } from '@/hooks/useCustoms';
import { formatDate, STATUS_LABELS, TRANSPORT_LABELS } from '@/lib/utils';
import { convertMoney, formatMoneyIn } from '@/lib/money';
import { compactCurrency, formatMonthKey, STATUS_COLOR_VAR, STATUS_ORDER } from '@/lib/viz';
import { useLocale } from '@/components/settings/LocaleProvider';
import { CurrencyToggle, Money, useDisplayCurrency } from '@/components/settings/CurrencyProvider';
import { ChartCard, VizTable } from '@/components/charts/ChartCard';
import { TrendChart } from '@/components/charts/TrendChart';
import { StackedBar } from '@/components/charts/StackedBar';
import { RankedBars } from '@/components/charts/RankedBars';
import { StatTile } from '@/components/charts/StatTile';
import { Skeleton } from '@/components/ui/Skeleton';

export default function ReportsPage() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const { locale } = useLocale();
  const { display } = useDisplayCurrency();
  const vi = locale === 'vi';
  const intlLocale = vi ? 'vi-VN' : 'en-US';

  const { data, isLoading } = useCustomsList({ limit: 100 });
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['reports-stats'],
    queryFn: () => customsApi.getStats().then((response) => response.data),
  });

  const records = data?.data ?? [];

  const copy = vi
    ? {
        title: 'Báo cáo & Phân tích',
        subtitle: 'Theo dõi dòng giá trị hàng hoá và xuất dữ liệu tờ khai ra Excel',
        template: 'Tải template Excel',
        totalValue: 'Tổng giá trị hàng',
        totalValueHint: 'Trị giá khai báo, quy đổi USD',
        totalVat: 'Tổng thuế VAT',
        totalVatHint: 'Thuế phải nộp theo khai báo',
        totalPayable: 'Tổng phải thanh toán',
        totalPayableHint: 'Gồm hàng, VAT và phí vận chuyển',
        avgValue: 'Giá trị trung bình',
        avgValueHint: 'Bình quân mỗi tờ khai',
        valueTrend: 'Giá trị theo tháng',
        valueTrendSubtitle: '12 tháng gần nhất, tính theo ngày nhập cảnh',
        valueUnit: 'USD',
        statusTitle: 'Phân bổ trạng thái',
        statusSubtitle: 'Tỷ trọng hồ sơ theo từng bước xử lý',
        companiesTitle: 'Doanh nghiệp dẫn đầu',
        companiesSubtitle: 'Top 5 nhà nhập khẩu theo giá trị',
        exportTitle: 'Xuất dữ liệu tờ khai',
        exportSubtitle: 'Chọn hồ sơ để tải bản Excel chi tiết',
        searchPlaceholder: 'Tìm theo số tờ khai hoặc doanh nghiệp...',
        colRecord: 'Số tờ khai',
        colDate: 'Ngày nhập',
        colTransport: 'Vận chuyển',
        colExporter: 'Nhà xuất khẩu',
        colTotal: 'Tổng tiền',
        colStatus: 'Trạng thái',
        colExport: 'Xuất Excel',
        exportAction: 'Xuất',
        empty: 'Chưa có tờ khai nào',
        noMatch: 'Không có tờ khai nào khớp với từ khoá',
        exportFailed: 'Xuất file thất bại, vui lòng thử lại',
        templateFailed: 'Tải template thất bại, vui lòng thử lại',
        month: 'Tháng',
        valueCol: 'Giá trị',
        statusCol: 'Trạng thái',
        countCol: 'Số tờ khai',
        companyCol: 'Doanh nghiệp',
        tableView: 'Xem bảng',
        chartView: 'Xem biểu đồ',
        showing: 'hồ sơ',
      }
    : {
        title: 'Reports & analytics',
        subtitle: 'Track declared value flow and export declaration data to Excel',
        template: 'Download Excel template',
        totalValue: 'Total goods value',
        totalValueHint: 'Declared value, normalised to USD',
        totalVat: 'Total VAT',
        totalVatHint: 'Tax payable as declared',
        totalPayable: 'Total payable',
        totalPayableHint: 'Goods, VAT and shipping combined',
        avgValue: 'Average value',
        avgValueHint: 'Mean per declaration',
        valueTrend: 'Value per month',
        valueTrendSubtitle: 'Last 12 months, by entry date',
        valueUnit: 'USD',
        statusTitle: 'Status distribution',
        statusSubtitle: 'Share of records at each processing step',
        companiesTitle: 'Leading companies',
        companiesSubtitle: 'Top 5 importers by value',
        exportTitle: 'Export declaration data',
        exportSubtitle: 'Pick a record to download its detailed Excel sheet',
        searchPlaceholder: 'Search by record number or company...',
        colRecord: 'Record no.',
        colDate: 'Entry date',
        colTransport: 'Transport',
        colExporter: 'Exporter',
        colTotal: 'Total',
        colStatus: 'Status',
        colExport: 'Export',
        exportAction: 'Export',
        empty: 'No declarations yet',
        noMatch: 'No declarations match your search',
        exportFailed: 'Export failed, please try again',
        templateFailed: 'Template download failed, please try again',
        month: 'Month',
        valueCol: 'Value',
        statusCol: 'Status',
        countCol: 'Records',
        companyCol: 'Company',
        tableView: 'Table view',
        chartView: 'Chart view',
        showing: 'records',
      };

  const handleExport = async (id: string, recordNo: string) => {
    setDownloading(id);
    setError('');
    try {
      const response = await reportsApi.exportExcel(id);
      downloadBlob(response.data, `ToKhai_${recordNo}.xlsx`);
    } catch {
      setError(copy.exportFailed);
    } finally {
      setDownloading(null);
    }
  };

  const handleTemplate = async () => {
    setDownloading('template');
    setError('');
    try {
      const response = await reportsApi.getTemplate();
      downloadBlob(response.data, 'template_to_khai.xlsx');
    } catch {
      setError(copy.templateFailed);
    } finally {
      setDownloading(null);
    }
  };

  const trend = stats?.trend ?? [];
  const valueTrend = trend.map((point: any) => ({
    label: formatMonthKey(point.month, locale),
    value: point.value,
    hint: formatMonthKey(point.month, locale),
  }));

  const statusSegments = STATUS_ORDER.map((key) => ({
    key,
    label: STATUS_LABELS[key]?.label ?? key,
    value: stats?.byStatus?.find((item: any) => item.status === key)?._count ?? 0,
    color: STATUS_COLOR_VAR[key],
  }));

  const companyRows = (stats?.topCompanies ?? []).map((company: any) => ({
    key: company.name,
    label: company.name,
    value: company.value,
    caption: `${company.count} ${vi ? 'hồ sơ' : 'records'}`,
  }));

  const totals = stats?.totals ?? { payable: 0, value: 0, vat: 0 };
  const averageValue = stats?.total ? totals.payable / stats.total : 0;

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return records;
    return records.filter((record: any) =>
      [record.recordNo, record.exporterName, record.importerName]
        .filter(Boolean)
        .some((field: string) => field.toLowerCase().includes(keyword)),
    );
  }, [records, search]);

  // Backend đã quy hết số liệu tổng hợp về USD (xem CustomsService.getStats), nên
  // ở đây chỉ cần đổi tiếp sang đồng tiền người dùng đang chọn xem.
  const money = (value: number) => compactCurrency(convertMoney(value, 'USD', display), display, intlLocale);
  const moneyFull = (value: number) => formatMoneyIn(value, 'USD', display);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{copy.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{copy.subtitle}</p>
        </div>
        <button
          onClick={handleTemplate}
          disabled={downloading === 'template'}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {downloading === 'template' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {copy.template}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border-l-4 border-rose-500 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={copy.totalValue}
          value={money(totals.value)}
          hint={copy.totalValueHint}
          icon={CircleDollarSign}
          loading={isStatsLoading}
        />
        <StatTile
          label={copy.totalVat}
          value={money(totals.vat)}
          hint={copy.totalVatHint}
          icon={Receipt}
          loading={isStatsLoading}
        />
        <StatTile
          label={copy.totalPayable}
          value={money(totals.payable)}
          hint={copy.totalPayableHint}
          icon={Wallet}
          loading={isStatsLoading}
        />
        <StatTile
          label={copy.avgValue}
          value={money(averageValue)}
          hint={copy.avgValueHint}
          icon={FileText}
          loading={isStatsLoading}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <ChartCard
          title={copy.valueTrend}
          subtitle={copy.valueTrendSubtitle}
          tableLabel={copy.tableView}
          chartLabel={copy.chartView}
          table={
            <VizTable
              head={[copy.month, copy.valueCol]}
              rows={trend.map((point: any) => [
                formatMonthKey(point.month, locale),
                moneyFull(point.value),
              ])}
            />
          }
        >
          {isStatsLoading ? (
            <Skeleton className="h-[260px] w-full rounded-xl" />
          ) : (
            <TrendChart data={valueTrend} formatValue={money} valueLabel={copy.valueUnit} />
          )}
        </ChartCard>

        <ChartCard
          title={copy.statusTitle}
          subtitle={copy.statusSubtitle}
          tableLabel={copy.tableView}
          chartLabel={copy.chartView}
          table={
            <VizTable
              head={[copy.statusCol, copy.countCol]}
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

      <ChartCard
        title={copy.companiesTitle}
        subtitle={copy.companiesSubtitle}
        tableLabel={copy.tableView}
        chartLabel={copy.chartView}
        table={
          <VizTable
            head={[copy.companyCol, copy.valueCol]}
            rows={companyRows.map((row: any) => [row.label, moneyFull(row.value)])}
          />
        }
      >
        {isStatsLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <RankedBars rows={companyRows} emptyLabel={copy.empty} formatValue={money} />
        )}
      </ChartCard>

      {/* Bảng xuất Excel */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{copy.exportTitle}</h2>
            <p className="text-sm text-slate-500">{copy.exportSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={copy.searchPlaceholder}
                className="w-full min-w-[260px] rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm transition focus:border-blue-500 focus:outline-none"
              />
            </div>
            <CurrencyToggle />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{copy.colRecord}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{copy.colDate}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{copy.colTransport}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{copy.colExporter}</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">{copy.colTotal}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{copy.colStatus}</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">{copy.colExport}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-b border-slate-100">
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center">
                    <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-300">
                      <FileSpreadsheet className="h-7 w-7" />
                    </span>
                    <p className="text-sm text-slate-500">{search ? copy.noMatch : copy.empty}</p>
                  </td>
                </tr>
              ) : (
                filtered.map((record: any) => {
                  const status = STATUS_LABELS[record.status];
                  return (
                    <tr key={record.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-medium text-blue-700">{record.recordNo}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{formatDate(record.entryDate)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {TRANSPORT_LABELS[record.transportType] ?? record.transportType}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{record.exporterName}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        <Money value={record.totalPayable} currency={record.currency} rate={record.exchangeRate} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${status?.color ?? ''}`}>
                          {status?.label ?? record.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleExport(record.id, record.recordNo)}
                          disabled={!!downloading}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                        >
                          {downloading === record.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="h-3 w-3" />
                          )}
                          {copy.exportAction}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
            {filtered.length} {copy.showing}
          </p>
        )}
      </section>
    </div>
  );
}
