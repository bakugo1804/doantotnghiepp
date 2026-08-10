'use client';

import { cn } from '@/lib/utils';

export type RankedRow = { key: string; label: string; value: number; caption?: string };

type RankedBarsProps = {
  rows: RankedRow[];
  formatValue?: (value: number) => string;
  emptyLabel?: string;
  className?: string;
};

/**
 * Xếp hạng theo độ lớn cho các nhóm không có thứ tự tự nhiên (loại vận chuyển,
 * công ty).
 *
 * Mọi thanh dùng chung một màu: tô đậm-nhạt theo giá trị sẽ mã hoá độ lớn hai
 * lần (vừa bằng chiều dài vừa bằng màu) và đốt mất kênh màu vào thông tin biểu
 * đồ đã thể hiện rồi. Giá trị được gắn ngay đầu mút thanh nên không cần trục X.
 */
export function RankedBars({ rows, formatValue = (value) => String(value), emptyLabel, className }: RankedBarsProps) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{emptyLabel ?? 'Chưa có dữ liệu'}</p>;
  }

  const max = Math.max(...rows.map((row) => row.value), 0) || 1;

  return (
    <ul className={cn('space-y-3.5', className)}>
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700" title={row.label}>
              {row.label}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatValue(row.value)}</span>
          </div>

          <div className="mt-1.5 flex items-center gap-2.5">
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-slate-100">
              <div
                // Bo góc 4px ở đầu mút dữ liệu, vuông góc tại vạch gốc
                className="h-full rounded-r transition-[width] duration-500 ease-out"
                style={{
                  width: `${Math.max((row.value / max) * 100, row.value > 0 ? 1.5 : 0)}%`,
                  background: 'var(--viz-accent)',
                }}
              />
            </div>
            {row.caption && <span className="shrink-0 text-xs tabular-nums text-slate-400">{row.caption}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
