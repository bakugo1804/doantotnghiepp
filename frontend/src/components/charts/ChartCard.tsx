'use client';

import { ReactNode, useId, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LegendItem = { label: string; color: string; value?: string };

type ChartCardProps = {
  title: string;
  subtitle?: string;
  legend?: LegendItem[];
  /** Bảng số liệu tương đương biểu đồ. */
  table?: ReactNode;
  tableLabel?: string;
  chartLabel?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

/**
 * Khung chuẩn cho mọi biểu đồ: tiêu đề, chú giải và công tắc chuyển sang bảng số.
 *
 * Chế độ xem bảng không phải trang trí — một vài màu trong bộ palette nằm dưới
 * ngưỡng tương phản 3:1 trên nền sáng, và bảng số chính là phương án đọc thay thế
 * bắt buộc đi kèm. Chú giải luôn hiện khi có từ 2 chuỗi dữ liệu trở lên để danh
 * tính không bao giờ phụ thuộc riêng vào màu sắc.
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  tableLabel = 'Bảng số liệu',
  chartLabel = 'Biểu đồ',
  action,
  className,
  children,
}: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  const panelId = useId();

  return (
    <section
      className={cn(
        'flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {action}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((value) => !value)}
              aria-pressed={showTable}
              aria-controls={panelId}
              title={showTable ? chartLabel : tableLabel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              {showTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
              {showTable ? chartLabel : tableLabel}
            </button>
          )}
        </div>
      </header>

      {legend && legend.length > 1 && (
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: item.color }}
              />
              <span>{item.label}</span>
              {item.value && <span className="font-medium text-slate-900">{item.value}</span>}
            </li>
          ))}
        </ul>
      )}

      <div id={panelId} className="mt-4 min-w-0 flex-1">
        {showTable && table ? <div className="overflow-x-auto">{table}</div> : children}
      </div>
    </section>
  );
}

/** Bảng số liệu dùng chung cho phần "xem dạng bảng" của các biểu đồ. */
export function VizTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b border-slate-200">
          {head.map((cell, index) => (
            <th
              key={cell}
              scope="col"
              className={cn('py-2 font-medium text-slate-500', index === 0 ? 'text-left' : 'text-right')}
            >
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={String(row[0])} className="border-b border-slate-100 last:border-0">
            {row.map((cell, index) => (
              <td
                key={index}
                className={cn('py-2 text-slate-700', index === 0 ? 'text-left font-medium text-slate-900' : 'text-right')}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
