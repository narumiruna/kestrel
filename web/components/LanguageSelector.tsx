'use client';

import { Select } from '@radix-ui/themes';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { saveLocale } from '@/i18n/actions';
import { changeLocale } from '@/i18n/changeLocale';
import { localeNames, locales } from '@/i18n/config';

export function LanguageSelector() {
  const locale = useLocale();
  const t = useTranslations('Language');
  const router = useRouter();
  const labelId = useId();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div className="stack">
      <span id={labelId}>{t('label')}</span>
      <Select.Root
        value={locale}
        disabled={pending}
        onValueChange={(value) => {
          setFailed(false);
          startTransition(async () => {
            const ok = await changeLocale(value, saveLocale, () => router.refresh());
            setFailed(!ok);
          });
        }}
      >
        <Select.Trigger aria-labelledby={labelId} placeholder={localeNames[locale]} />
        <Select.Content>
          {locales.map((value) => (
            <Select.Item key={value} value={value}>
              {localeNames[value]}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      {failed ? (
        <p role="alert" className="error">
          {t('saveFailed')}
        </p>
      ) : null}
    </div>
  );
}
