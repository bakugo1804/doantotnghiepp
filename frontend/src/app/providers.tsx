'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState } from 'react';
import { AppPreferencesProvider } from '@/components/settings/AppPreferencesProvider';
import { CurrencyProvider } from '@/components/settings/CurrencyProvider';
import { LocaleProvider } from '@/components/settings/LocaleProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
  }));

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <AppPreferencesProvider>
          <LocaleProvider>
            <CurrencyProvider>{children}</CurrencyProvider>
          </LocaleProvider>
        </AppPreferencesProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
