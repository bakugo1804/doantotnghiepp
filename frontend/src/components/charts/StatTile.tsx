'use client';

import { LucideIcon, TrendingDown, TrendingUp } from 'lucide-react';
import { smoothPath, type Point } from '@/lib/viz';
import { cn } from '@/lib/utils';

type StatTileProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  /** Phần trăm thay đổi so với kỳ trước; null nghĩa là không có nền so sánh. */
  deltaPercent?: number | null;
  deltaLabel?: string;
  /** Với chỉ số như "hồ sơ bị từ chối", tăng lên là tin xấu. */
  higherIsBetter?: boolean;
  trend?: number[];
  loading?: boolean;
};

/** Sparkline 12 điểm: phần nền dùng màu nhạt, đoạn kỳ hiện tại dùng màu nhấn. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;

  const width = 84;
  const height = 26;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  const points: Point[] = values.map((value, index) => ({
    x: (index / (values.length - 1)) * width,
    y: height - ((value - min) / span) * (height - 4) - 2,
  }));

  const lead = points.slice(0, -1);
  const tail = points.slice(-2);

  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={smoothPath(lead)} fill="none" stroke="var(--viz-muted-mark)" strokeWidth={2} strokeLinecap="round" />
      <path d={smoothPath(tail)} fill="none" stroke="var(--viz-accent)" strokeWidth={2} strokeLinecap="round" />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={3}
        fill="var(--viz-accent)"
        stroke="var(--viz-surface)"
        strokeWidth={2}
      />
    </svg>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  deltaPercent,
  deltaLabel,
  higherIsBetter = true,
  trend,
  loading,
}: StatTileProps) {
  const hasDelta = typeof deltaPercent === 'number' && Number.isFinite(deltaPercent);
  const isUp = hasDelta && deltaPercent! > 0;
  const isFlat = hasDelta && deltaPercent === 0;
  const isGood = isUp === higherIsBetter;

  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        {Icon && (
          <span className="rounded-lg bg-slate-50 p-2 text-slate-400 transition group-hover:text-[var(--viz-accent)]">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      {/* Số lớn dùng chữ số tỷ lệ tự nhiên — tabular-nums khiến số như 121 trông rời rạc */}
      <p className={cn('mt-3 text-3xl font-semibold text-slate-900', loading && 'animate-pulse text-slate-300')}>
        {loading ? '—' : value}
      </p>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {hasDelta && !isFlat ? (
            <p className="flex items-center gap-1 text-xs font-medium">
              {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              <span style={{ color: isGood ? 'var(--viz-positive)' : 'var(--viz-negative)' }} className="tabular-nums">
                {isUp ? '+' : ''}
                {deltaPercent!.toFixed(0)}%
              </span>
              {deltaLabel && <span className="truncate font-normal text-slate-400">{deltaLabel}</span>}
            </p>
          ) : (
            hint && <p className="truncate text-xs text-slate-400">{hint}</p>
          )}
        </div>

        {trend && trend.length > 1 && <Sparkline values={trend} />}
      </div>
    </div>
  );
}
