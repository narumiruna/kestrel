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
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { AuthProvider } from '@/components/AuthProvider';
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

export const metadata: Metadata = {
  description: 'Web console for editing Kestrel cloud places and routes.',
  title: 'Kestrel Cloud',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={`${fontSans.variable} ${fontMono.variable}`}
      lang="en"
      suppressHydrationWarning
      style={{ colorScheme: 'light dark' }}
    >
      <body>
        <Script id="kestrel-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
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
