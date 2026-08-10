'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Theo dõi bề rộng thật của phần tử bọc ngoài.
 *
 * Biểu đồ cần con số pixel cụ thể: thuộc tính hình học của SVG không chấp nhận
 * `calc()`, nên những chỗ như khe hở giữa các mảng màu phải tự tính bằng px.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
