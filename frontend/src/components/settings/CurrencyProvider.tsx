'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import {
  CurrencyCode,
  formatMoneyIn,
  normalizeCurrency,
  rateHint,
} from '@/lib/money';

/**
 * Đồng tiền đang dùng để XEM số liệu, tách khỏi đồng tiền đã LƯU trên tờ khai.
 *
 * Tờ khai vẫn giữ nguyên đồng tiền thanh toán của nó; đây chỉ là lựa chọn hiển
 * thị, và được nhớ lại giữa các lần mở để người dùng không phải bấm đổi ở từng
 * trang một.
 */
type CurrencyContextValue = {
  display: CurrencyCode;
  setDisplay: (currency: CurrencyCode) => void;
  toggle: () => void;
};

const STORAGE_KEY = 'customs-app-display-currency';

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [display, setDisplayState] = useState<CurrencyCode>('USD');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'USD' || saved === 'VND') setDisplayState(saved);
  }, []);

  const setDisplay = useCallback((currency: CurrencyCode) => {
    setDisplayState(currency);
    window.localStorage.setItem(STORAGE_KEY, currency);
  }, []);

  const toggle = useCallback(() => {
    setDisplayState((current) => {
      const next: CurrencyCode = current === 'USD' ? 'VND' : 'USD';
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ display, setDisplay, toggle }), [display, setDisplay, toggle]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useDisplayCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useDisplayCurrency must be used inside CurrencyProvider');
  return context;
}

/**
 * Một số tiền bấm được: hiện theo đồng tiền đang chọn, bấm vào là đổi sang đồng
 * tiền còn lại (và đổi luôn mọi số tiền khác trên màn hình, để không bao giờ có
 * hai đơn vị lẫn nhau trong cùng một bảng).
 */
export function Money({
  value,
  currency,
  rate,
  className = '',
  showOriginal = false,
}: {
  value: number;
  /** Đồng tiền đã lưu của bản ghi. */
  currency?: string | null;
  /** Tỷ giá của bản ghi. */
  rate?: number | null;
  className?: string;
  /** Hiện thêm số gốc theo đồng tiền đã lưu, khi hai đồng tiền khác nhau. */
  showOriginal?: boolean;
}) {
  const { display, toggle } = useDisplayCurrency();
  const stored = normalizeCurrency(currency);
  const converted = stored !== display;

  return (
    <button
      type="button"
      onClick={toggle}
      title={`${converted ? `Đã quy đổi từ ${stored}. ` : ''}${rateHint(rate)} — bấm để xem bằng ${display === 'USD' ? 'VND' : 'USD'}`}
      className={`group inline-flex items-center gap-1 rounded transition hover:text-blue-700 dark:hover:text-sky-300 ${className}`}
    >
      <span className="tabular-nums">{formatMoneyIn(value, stored, display, rate)}</span>
      <ArrowLeftRight className="h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-60" />
      {showOriginal && converted && (
        <span className="text-xs font-normal opacity-60">({formatMoneyIn(value, stored, stored, rate)})</span>
      )}
    </button>
  );
}

/** Công tắc USD ⇄ VND đặt ở đầu mỗi khối số liệu. */
export function CurrencyToggle({ className = '' }: { className?: string }) {
  const { display, setDisplay } = useDisplayCurrency();

  return (
    <div className={`inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs font-medium dark:border-slate-700 ${className}`}>
      {(['USD', 'VND'] as CurrencyCode[]).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setDisplay(code)}
          aria-pressed={display === code}
          className={`px-2.5 py-1 transition ${
            display === code
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
