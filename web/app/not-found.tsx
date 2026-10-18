import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('Framework');
  return (
    <main className="shell stack">
      <h1>{t('notFoundTitle')}</h1>
      <p>{t('notFoundHelp')}</p>
      <Link href="/">{t('home')}</Link>
    </main>
  );
}
