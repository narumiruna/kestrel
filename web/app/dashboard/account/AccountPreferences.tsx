'use client';

import { RadioCards } from '@radix-ui/themes';
import { useTranslations } from 'next-intl';
import { LanguageSelector } from '@/components/LanguageSelector';
import { useTheme } from '@/components/ThemeProvider';
import { MoonIcon, SunIcon } from '@/components/ui/icons';

export function AccountPreferences() {
  const t = useTranslations('Account');
  const { isHydrated, theme, setTheme } = useTheme();

  return (
    <section
      className="panel account-security-panel account-preferences"
      aria-labelledby="preferences-heading"
    >
      <h2 id="preferences-heading">{t('preferences')}</h2>
      <div className="account-preference-group">
        <LanguageSelector />
      </div>
      <div className="account-preference-group">
        <h3 id="appearance-heading">{t('appearance')}</h3>
        <p id="appearance-help" className="muted">
          {t('appearanceHelp')}
        </p>
        <RadioCards.Root
          aria-labelledby="appearance-heading"
          aria-describedby="appearance-help"
          className="account-appearance-options"
          columns="2"
          value={theme}
          disabled={!isHydrated}
          onValueChange={(value) => {
            if (value === 'light' || value === 'dark') setTheme(value);
          }}
        >
          {/* Activating the current system-derived value must also save an explicit choice. */}
          <RadioCards.Item
            value="light"
            onClick={() => {
              if (theme === 'light') setTheme('light');
            }}
          >
            <SunIcon />
            {t('light')}
          </RadioCards.Item>
          <RadioCards.Item
            value="dark"
            onClick={() => {
              if (theme === 'dark') setTheme('dark');
            }}
          >
            <MoonIcon />
            {t('dark')}
          </RadioCards.Item>
        </RadioCards.Root>
      </div>
    </section>
  );
}
