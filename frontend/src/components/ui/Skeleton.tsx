import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/** Khối giữ chỗ trong lúc tải, giữ nguyên bố cục để trang không bị nhảy khi có dữ liệu. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden style={style} className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Giữ chỗ cho biểu đồ: các cột cao thấp gợi đúng hình dạng nội dung sắp hiện ra. */
export function SkeletonChart({ className }: { className?: string }) {
  const heights = ['40%', '65%', '50%', '80%', '58%', '92%', '70%'];
  return (
    <div className={cn('flex h-full items-end gap-2', className)}>
      {heights.map((height, index) => (
        <Skeleton key={index} className="flex-1 rounded-t" style={{ height } as never} />
      ))}
    </div>
  );
}
