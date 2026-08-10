'use client';

import { useCallback, useId, useMemo, useState } from 'react';
import { compactNumber, niceTicks, smoothPath, type Point } from '@/lib/viz';
import { useElementWidth } from './useElementWidth';

export type TrendDatum = { label: string; value: number; hint?: string };

type TrendChartProps = {
  data: TrendDatum[];
  height?: number;
  /** Định dạng giá trị trong tooltip và nhãn điểm cuối. */
  formatValue?: (value: number) => string;
  /** Đơn vị hiển thị cạnh giá trị trong tooltip. */
  valueLabel?: string;
};

const PADDING = { top: 18, right: 18, bottom: 30, left: 46 };

/**
 * Xu hướng theo thời gian cho một chuỗi dữ liệu duy nhất.
 *
 * Một chuỗi thì không cần hộp chú giải — tiêu đề của card đã nói rõ đang vẽ gì.
 * Chỉ điểm cuối được gắn nhãn trực tiếp; các giá trị còn lại do trục và tooltip
 * đảm nhiệm, vì gắn số lên mọi điểm sẽ biến biểu đồ thành một mớ hỗn độn.
 */
export function TrendChart({ data, height = 260, formatValue = compactNumber, valueLabel }: TrendChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = useId().replace(/:/g, '');

  const ticks = useMemo(() => niceTicks(Math.max(...data.map((d) => d.value), 0)), [data]);
  const maxTick = ticks[ticks.length - 1] || 1;

  const innerWidth = Math.max(width - PADDING.left - PADDING.right, 0);
  const innerHeight = Math.max(height - PADDING.top - PADDING.bottom, 0);

  const xAt = useCallback(
    (index: number) => {
      if (data.length <= 1) return PADDING.left + innerWidth / 2;
      return PADDING.left + (index / (data.length - 1)) * innerWidth;
    },
    [data.length, innerWidth],
  );
  const yAt = useCallback(
    (value: number) => PADDING.top + innerHeight - (value / maxTick) * innerHeight,
    [innerHeight, maxTick],
  );

  const points: Point[] = useMemo(
    () => data.map((datum, index) => ({ x: xAt(index), y: yAt(datum.value) })),
    [data, xAt, yAt],
  );

  const linePath = useMemo(() => smoothPath(points), [points]);
  const areaPath = useMemo(() => {
    if (points.length === 0 || innerWidth === 0) return '';
    const baseline = PADDING.top + innerHeight;
    return `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
  }, [linePath, points, innerHeight, innerWidth]);

  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - bounds.left;
    // Chọn điểm gần nhất thay vì bắt trúng đúng mốc — vùng chạm nhờ đó rộng
    // bằng cả cột, không bó vào chấm tròn 8px.
    let nearest = 0;
    let smallest = Infinity;
    data.forEach((_, index) => {
      const distance = Math.abs(xAt(index) - offsetX);
      if (distance < smallest) {
        smallest = distance;
        nearest = index;
      }
    });
    setActiveIndex(nearest);
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    setActiveIndex((current) => {
      const base = current ?? (event.key === 'ArrowRight' ? -1 : data.length);
      const next = event.key === 'ArrowRight' ? base + 1 : base - 1;
      return Math.min(Math.max(next, 0), data.length - 1);
    });
  };

  const lastIndex = data.length - 1;
  const active = activeIndex === null ? null : data[activeIndex];
  const isReady = width > 0 && data.length > 0;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      {isReady && (
        <svg
          width={width}
          height={height}
          role="img"
          tabIndex={0}
          aria-label={`Biểu đồ xu hướng, ${data.length} mốc thời gian`}
          className="overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          onPointerMove={handlePointer}
          onPointerLeave={() => setActiveIndex(null)}
          onKeyDown={handleKeyDown}
          onBlur={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-accent)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--viz-accent)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Lưới hairline liền nét, lùi hẳn về sau so với dữ liệu */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={PADDING.left + innerWidth}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 10}
                y={yAt(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-[var(--viz-ink-muted)] text-[11px] tabular-nums"
              >
                {compactNumber(tick)}
              </text>
            </g>
          ))}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke="var(--viz-accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Nhãn trục X — thưa bớt khi hẹp để chữ không chồng lên nhau */}
          {data.map((datum, index) => {
            const step = innerWidth / Math.max(data.length, 1) < 44 ? 2 : 1;
            if (index % step !== 0 && index !== lastIndex) return null;
            return (
              <text
                key={datum.label}
                x={xAt(index)}
                y={height - 10}
                textAnchor="middle"
                className="fill-[var(--viz-ink-muted)] text-[11px]"
              >
                {datum.label}
              </text>
            );
          })}

          {activeIndex !== null && (
            <line
              x1={xAt(activeIndex)}
              x2={xAt(activeIndex)}
              y1={PADDING.top}
              y2={PADDING.top + innerHeight}
              stroke="var(--viz-axis)"
              strokeWidth={1}
            />
          )}

          {/* Chấm điểm cuối: vòng viền màu nền 2px giữ chấm tách khỏi đường kẻ */}
          {points.length > 0 && (
            <circle
              cx={points[lastIndex].x}
              cy={points[lastIndex].y}
              r={4.5}
              fill="var(--viz-accent)"
              stroke="var(--viz-surface)"
              strokeWidth={2}
            />
          )}
          {activeIndex !== null && activeIndex !== lastIndex && (
            <circle
              cx={points[activeIndex].x}
              cy={points[activeIndex].y}
              r={4.5}
              fill="var(--viz-accent)"
              stroke="var(--viz-surface)"
              strokeWidth={2}
            />
          )}
        </svg>
      )}

      {active && activeIndex !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(Math.max(xAt(activeIndex), 60), Math.max(width - 60, 60)),
            top: Math.max(yAt(active.value) - 12, 8),
          }}
        >
          <p className="font-medium text-slate-900">{active.hint ?? active.label}</p>
          <p className="mt-0.5 tabular-nums text-slate-600">
            {formatValue(active.value)}
            {valueLabel ? ` ${valueLabel}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
