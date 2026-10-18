import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/radix-ui';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AuthOidc');
  return {
    title: t('androidMetadataTitle'),
    robots: { follow: false, index: false },
  };
}

export default async function AndroidOidcCallbackPage() {
  const t = await getTranslations('AuthOidc');
  return (
    <main className="auth-page">
      <section className="card auth-card stack">
        <BrandMark className="auth-brand" subtitle={t('androidSubtitle')} titleAs="h1" />
        <p className="muted">{t('androidHelp')}</p>
        <Button asChild className="secondary">
          <Link href="/login">{t('returnToLogin')}</Link>
        </Button>
      </section>
    </main>
  );
}
