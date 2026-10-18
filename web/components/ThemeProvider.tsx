'use client';

import { Theme as RadixTheme } from '@radix-ui/themes';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createThemePreference, type Theme } from './themePreference';

type ThemeContextValue = {
  isHydrated: boolean;
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const TRANSITION_CLASS = 'theme-transition-enabled';
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setCurrentTheme] = useState<Theme>('light');
  const [isHydrated, setIsHydrated] = useState(false);
  const [preference] = useState(createThemePreference);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function applyStoredOrSystemTheme() {
      const nextTheme = preference.resolveTheme(mediaQuery.matches ? 'dark' : 'light');

      applyTheme(nextTheme);
      setCurrentTheme(nextTheme);
    }

    applyStoredOrSystemTheme();
    setIsHydrated(true);
    mediaQuery.addEventListener('change', applyStoredOrSystemTheme);

    return () => mediaQuery.removeEventListener('change', applyStoredOrSystemTheme);
  }, [preference]);

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      enableManualThemeTransition();
      preference.setTheme(nextTheme);
      applyTheme(nextTheme);
      setCurrentTheme(nextTheme);
    },
    [preference],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      isHydrated,
      theme,
      setTheme,
    }),
    [isHydrated, theme, setTheme],
  );

  return (
    <RadixTheme
      accentColor="blue"
      appearance={isHydrated ? theme : 'inherit'}
      grayColor="slate"
      panelBackground="solid"
      radius="large"
      scaling="100%"
    >
      <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    </RadixTheme>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (context == null) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.remove('light', 'dark', 'light-theme', 'dark-theme');
  document.documentElement.classList.add(theme, `${theme}-theme`);
  document.documentElement.style.colorScheme = theme;
}

function enableManualThemeTransition() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  document.documentElement.classList.add(TRANSITION_CLASS);
  window.setTimeout(() => {
    document.documentElement.classList.remove(TRANSITION_CLASS);
  }, 220);
}
