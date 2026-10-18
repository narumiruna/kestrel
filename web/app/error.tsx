'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/radix-ui';

export default function ErrorPage({
  reset,
}: {
  reset: () => void;
  error: Error & { digest?: string };
}) {
  const t = useTranslations('Framework');
  return (
    <main className="shell stack" role="alert">
      <h1>{t('errorTitle')}</h1>
      <p>{t('errorHelp')}</p>
      <Button type="button" onClick={reset}>
        {t('retry')}
      </Button>
    </main>
  );
}
