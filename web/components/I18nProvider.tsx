'use client';

import { type AbstractIntlMessages, NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/config';

export function I18nProvider({
  children,
  locale,
  messages,
  fallbackMessage,
}: {
  children: ReactNode;
  locale: Locale;
  messages: AbstractIntlMessages;
  fallbackMessage: string;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      onError={() => {
        /* Keep catalog failures out of user-content logs. */
      }}
      getMessageFallback={() => fallbackMessage}
    >
      {children}
    </NextIntlClientProvider>
  );
}
