import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth');
  return { title: t('metadataTitle') };
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
