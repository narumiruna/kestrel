import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import { AuthProvider } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata: Metadata = {
  description: 'Web console for editing Kestrel cloud places and routes.',
  title: 'Kestrel Cloud',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning style={{ colorScheme: 'light dark' }}>
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
