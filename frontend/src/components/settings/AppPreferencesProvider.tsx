'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AppTheme = 'light' | 'dark';

type AppPreferencesContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
};

const THEME_STORAGE_KEY = 'customs-app-theme';
const SIDEBAR_STORAGE_KEY = 'customs-app-sidebar-collapsed';

const AppPreferencesContext = createContext<AppPreferencesContextValue | undefined>(undefined);

export function AppPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>('light');
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const nextTheme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : systemTheme;
    setThemeState(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');

    const savedSidebar = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (savedSidebar === 'true' || savedSidebar === 'false') {
      setSidebarCollapsedState(savedSidebar === 'true');
    }
  }, []);

  const setTheme = (nextTheme: AppTheme) => {
    setThemeState(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const setSidebarCollapsed = (collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, sidebarCollapsed, setSidebarCollapsed, toggleSidebar }),
    [theme, sidebarCollapsed],
  );

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext);
  if (!context) {
    throw new Error('useAppPreferences must be used inside AppPreferencesProvider');
  }
  return context;
}