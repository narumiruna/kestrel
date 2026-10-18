import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('SharedItem');
  return { title: t('title') };
}
export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
