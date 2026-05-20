import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import type { Metadata } from 'next';
import { Cormorant_Garamond, Inter, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { AuthProvider } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/ThemeProvider';

const fontSans = Inter({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-sans',
});
const fontSerif = Cormorant_Garamond({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['500', '600', '700'],
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
      className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable}`}
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
    document.documentElement.style.colorScheme = theme;
  } catch {
    // Keep CSS prefers-color-scheme fallback.
  }
})();
`;
