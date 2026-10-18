import { getTranslations } from 'next-intl/server';

export default async function Loading() {
  const t = await getTranslations('Framework');
  return (
    <main className="shell" role="status">
      {t('loading')}
    </main>
  );
}
