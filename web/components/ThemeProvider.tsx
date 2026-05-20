'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type Theme = 'dark' | 'light';

type ThemeContextValue = {
  isHydrated: boolean;
  theme: Theme;
  toggleTheme: () => void;
};

const STORAGE_KEY = 'kestrel-theme';
const TRANSITION_CLASS = 'theme-transition-enabled';
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function applyStoredOrSystemTheme() {
      const storedTheme = readStoredTheme();
      const nextTheme = storedTheme ?? getSystemTheme(mediaQuery);

      applyTheme(nextTheme);
      setTheme(nextTheme);
    }

    applyStoredOrSystemTheme();
    setIsHydrated(true);

    function handleSystemThemeChange() {
      if (readStoredTheme() != null) {
        return;
      }

      applyStoredOrSystemTheme();
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange);

    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';

      enableManualThemeTransition();
      writeStoredTheme(nextTheme);
      applyTheme(nextTheme);

      return nextTheme;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      isHydrated,
      theme,
      toggleTheme,
    }),
    [isHydrated, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (context == null) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}

function readStoredTheme(): Theme | null {
  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);

    return storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A blocked or full Web Storage area should not break theme switching.
  }
}

function getSystemTheme(mediaQuery: MediaQueryList): Theme {
  return mediaQuery.matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function enableManualThemeTransition() {
  document.documentElement.classList.add(TRANSITION_CLASS);
  window.setTimeout(() => {
    document.documentElement.classList.remove(TRANSITION_CLASS);
  }, 220);
}
