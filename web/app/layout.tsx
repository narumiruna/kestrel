import 'maplibre-gl/dist/maplibre-gl.css';
import '@radix-ui/themes/styles.css';
import '@radix-ui/colors/amber.css';
import '@radix-ui/colors/amber-dark.css';
import '@radix-ui/colors/grass.css';
import '@radix-ui/colors/grass-dark.css';
import '@radix-ui/colors/orange.css';
import '@radix-ui/colors/orange-dark.css';
import '@radix-ui/colors/red.css';
import '@radix-ui/colors/red-dark.css';
import '@radix-ui/colors/sand.css';
import '@radix-ui/colors/sand-dark.css';
import './globals.css';
import './redesign.css';
import './map-workspace.css';
import './workspace-theme.css';
import './radix-ui.css';
import './account-ui.css';
import './workspace-ux.css';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { AuthProvider } from '@/components/AuthProvider';
import { I18nProvider } from '@/components/I18nProvider';
import { ThemeProvider } from '@/components/ThemeProvider';

const fontSans = Inter({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-sans',
});
const fontMono = JetBrains_Mono({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-mono',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Metadata');
  return { title: t('title'), description: t('description') };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations('Framework');
  return (
    <html
      className={`${fontSans.variable} ${fontMono.variable}`}
      lang={locale}
      suppressHydrationWarning
      style={{ colorScheme: 'light dark' }}
    >
      <body>
        <Script id="kestrel-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <I18nProvider locale={locale} messages={messages} fallbackMessage={t('messageUnavailable')}>
          <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

const themeInitScript = `
(() => {
  try {
    const storedTheme = window.localStorage.getItem('kestrel-theme');
    const theme = storedTheme === 'dark' || storedTheme === 'light'
      ? storedTheme
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.remove('light', 'dark', 'light-theme', 'dark-theme');
    document.documentElement.classList.add(theme, theme + '-theme');
    document.documentElement.style.colorScheme = theme;
  } catch {
    // Keep CSS prefers-color-scheme fallback.
  }
})();
`;
