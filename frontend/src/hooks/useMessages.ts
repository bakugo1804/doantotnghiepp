'use client';

import { useLocale } from '@/components/settings/LocaleProvider';
import { messages } from '@/locales/messages';

export function useMessages() {
  const { locale } = useLocale();
  return messages[locale];
}
