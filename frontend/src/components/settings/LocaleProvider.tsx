'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AppLocale = 'vi' | 'en';

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  toggleLocale: () => void;
};

const STORAGE_KEY = 'customs-app-locale';

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>('vi');

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(STORAGE_KEY);
    if (savedLocale === 'vi' || savedLocale === 'en') {
      setLocaleState(savedLocale);
      document.documentElement.lang = savedLocale;
    }
  }, []);

  const setLocale = (nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
  };

  const toggleLocale = () => {
    setLocale(locale === 'vi' ? 'en' : 'vi');
  };

  const value = useMemo(() => ({ locale, setLocale, toggleLocale }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used inside LocaleProvider');
  }
  return context;
}