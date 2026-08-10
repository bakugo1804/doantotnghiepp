'use client';

import { useId, useState } from 'react';
import { safePercent } from '@/lib/viz';
import { useElementWidth } from './useElementWidth';

export type StackSegment = { key: string; label: string; value: number; color: string };

type StackedBarProps = {
  segments: StackSegment[];
  /** Đơn vị đứng sau con số trong phần liệt kê, ví dụ "tờ khai". */
  unit?: string;
};

const BAR_HEIGHT = 22;
const GAP = 2;

/**
 * Thanh xếp chồng ngang thể hiện quan hệ bộ phận - tổng thể.
 *
 * Chọn thanh ngang thay vì biểu đồ tròn vì tên trạng thái tiếng Việt khá dài, và
 * vì biểu đồ tròn rất khó so sánh những phần có giá trị gần nhau. Các mảng màu
 * được tách bằng khe hở 2px màu nền chứ không viền quanh — viền thêm mực không
 * mang dữ liệu. Phần liệt kê bên dưới vừa là chú giải vừa là nhãn giá trị, nên
 * không có ý nghĩa nào phụ thuộc riêng vào màu sắc.
 */
export function StackedBar({ segments, unit }: StackedBarProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const clipId = useId().replace(/:/g, '');

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visible = segments.filter((segment) => segment.value > 0);

  // Quy ra pixel ngay tại đây: thuộc tính width của <rect> không hiểu calc(), nên
  // khe hở 2px phải được trừ khỏi con số pixel đã tính sẵn.
  let cursor = 0;
  const placed = visible.map((segment, index) => {
    const rawWidth = (segment.value / (total || 1)) * width;
    const isLast = index === visible.length - 1;
    const item = {
      ...segment,
      x: cursor,
      // Mảng cuối giữ nguyên bề rộng để thanh luôn chạm đúng mép phải.
      width: Math.max(rawWidth - (isLast ? 0 : GAP), 0),
      percent: safePercent(segment.value, total),
    };
    cursor += rawWidth;
    return item;
  });

  return (
    <div ref={containerRef}>
      {total === 0 ? (
        <div className="h-[22px] rounded-md bg-slate-100" role="img" aria-label="Chưa có dữ liệu" />
      ) : (
        <svg
          width={width || '100%'}
          height={BAR_HEIGHT}
          role="img"
          aria-label={`Phân bổ theo trạng thái, tổng ${total}`}
          className="block"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={width} height={BAR_HEIGHT} rx={6} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {placed.map((segment) => (
              <rect
                key={segment.key}
                x={segment.x}
                y={0}
                width={segment.width}
                height={BAR_HEIGHT}
                fill={segment.color}
                opacity={activeKey && activeKey !== segment.key ? 0.45 : 1}
                className="transition-opacity"
                onPointerEnter={() => setActiveKey(segment.key)}
                onPointerLeave={() => setActiveKey(null)}
              >
                <title>{`${segment.label}: ${segment.value} (${segment.percent.toFixed(1)}%)`}</title>
              </rect>
            ))}
          </g>
        </svg>
      )}

      <ul className="mt-4 grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
        {segments.map((segment) => {
          const percent = safePercent(segment.value, total);
          return (
            <li
              key={segment.key}
              onPointerEnter={() => setActiveKey(segment.key)}
              onPointerLeave={() => setActiveKey(null)}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: segment.color }}
                />
                <span className="truncate text-slate-600">{segment.label}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold text-slate-900">{segment.value}</span>
                {unit && <span className="text-slate-400"> {unit}</span>}
                <span className="ml-1.5 text-slate-400">{percent.toFixed(0)}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
