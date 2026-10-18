export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'kestrel-theme';

export function createThemePreference() {
  let selectedTheme: Theme | null = null;

  return {
    resolveTheme(systemTheme: Theme): Theme {
      if (selectedTheme != null) {
        return selectedTheme;
      }

      try {
        const storedTheme = window.localStorage.getItem(STORAGE_KEY);
        if (storedTheme === 'dark' || storedTheme === 'light') {
          return storedTheme;
        }
      } catch {
        // Use the system theme when Web Storage is unavailable.
      }

      return systemTheme;
    },
    setTheme(theme: Theme) {
      selectedTheme = theme;

      try {
        window.localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Keep the explicit choice in memory when Web Storage is unavailable.
      }
    },
  };
}
