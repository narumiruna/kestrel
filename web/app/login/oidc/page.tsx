import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OidcCallback } from '@/components/OidcCallback';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AuthOidc');
  return {
    title: t('metadataTitle'),
    robots: { follow: false, index: false },
  };
}

export default function OidcCallbackPage() {
  return <OidcCallback />;
}
