import assert from 'node:assert/strict';
import test from 'node:test';
import { createThemePreference } from './themePreference.ts';

test('creates a preference without reading browser storage', () => {
  let reads = 0;
  withLocalStorage(
    {
      getItem() {
        reads += 1;
        throw new Error('storage unavailable');
      },
      setItem() {},
    },
    () => {
      assert.doesNotThrow(createThemePreference);
      assert.equal(reads, 0);
    },
  );
});

test('preserves saved light and dark preferences under the existing storage key', () => {
  for (const savedTheme of ['light', 'dark'] as const) {
    withLocalStorage(
      {
        getItem(key) {
          assert.equal(key, 'kestrel-theme');
          return savedTheme;
        },
        setItem() {},
      },
      () => {
        const preference = createThemePreference();
        assert.equal(preference.resolveTheme('light'), savedTheme);
        assert.equal(preference.resolveTheme('dark'), savedTheme);
      },
    );
  }
});

test('follows system changes when the saved preference is missing or invalid', () => {
  for (const savedTheme of [null, '', 'system', 'DARK']) {
    withLocalStorage({ getItem: () => savedTheme, setItem() {} }, () => {
      const preference = createThemePreference();
      assert.equal(preference.resolveTheme('light'), 'light');
      assert.equal(preference.resolveTheme('dark'), 'dark');
      assert.equal(preference.resolveTheme('light'), 'light');
    });
  }
});

test('follows the system when storage access is blocked and no choice was made', () => {
  withLocalStorage(null, () => {
    const preference = createThemePreference();
    assert.equal(preference.resolveTheme('dark'), 'dark');
    assert.equal(preference.resolveTheme('light'), 'light');
  });
});

test('sets explicit choices without toggling and keeps the existing storage format', () => {
  const values = new Map<string, string>();
  withLocalStorage(
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
    },
    () => {
      const preference = createThemePreference();
      assert.equal(preference.resolveTheme('light'), 'light');
      for (const theme of ['light', 'light', 'dark', 'dark', 'light'] as const) {
        preference.setTheme(theme);
        assert.equal(values.get('kestrel-theme'), theme);
        assert.equal(preference.resolveTheme('dark'), theme);
        assert.equal(preference.resolveTheme('light'), theme);
        assert.equal(createThemePreference().resolveTheme('dark'), theme);
      }
    },
  );
});

test('retains explicit choices across system changes when storage access is blocked', () => {
  withLocalStorage(null, () => {
    const preference = createThemePreference();
    for (const theme of ['light', 'dark'] as const) {
      assert.doesNotThrow(() => preference.setTheme(theme));
      assert.equal(preference.resolveTheme('dark'), theme);
      assert.equal(preference.resolveTheme('light'), theme);
    }
  });
});

test('retains an explicit choice when storage writes fail but an older value is readable', () => {
  withLocalStorage(
    {
      getItem: () => 'dark',
      setItem() {
        throw new Error('storage full');
      },
    },
    () => {
      const preference = createThemePreference();
      assert.equal(preference.resolveTheme('light'), 'dark');
      preference.setTheme('light');
      assert.equal(preference.resolveTheme('dark'), 'light');
      assert.equal(preference.resolveTheme('light'), 'light');
    },
  );
});

function withLocalStorage(storage: Pick<Storage, 'getItem' | 'setItem'> | null, run: () => void) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      get localStorage() {
        if (storage == null) {
          throw new Error('storage unavailable');
        }
        return storage;
      },
    },
  });

  try {
    run();
  } finally {
    if (originalWindow == null) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', originalWindow);
    }
  }
}
