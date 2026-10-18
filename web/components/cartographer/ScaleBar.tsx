'use client';

import { useLocale } from 'next-intl';
import { formatDistance } from '@/i18n/format';
export function ScaleBar({ hidden = false }: { hidden?: boolean }) {
  const locale = useLocale();
  if (hidden) {
    return null;
  }

  return (
    <div aria-hidden className="scale-bar">
      <span />
      <span />
      <span />
      <strong className="font-mono">{formatDistance(1, locale)}</strong>
    </div>
  );
}
