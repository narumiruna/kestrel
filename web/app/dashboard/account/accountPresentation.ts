import type { AuthSessionSummary } from '@/lib/api';

export function describeSession(session: AuthSessionSummary): 'browser' | 'android' | 'web' {
  if (session.isCurrent) {
    return 'browser';
  }

  if (session.userAgent?.toLowerCase().includes('android')) {
    return 'android';
  }

  return 'web';
}

export function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
