import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.KESTREL_UI_BASE_URL ?? 'http://127.0.0.1:3401';
const chromeArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export default defineConfig({
  testDir: './tests/ui',
  outputDir: 'test-results/ui',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    },
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    channel: 'chrome',
    headless: true,
    launchOptions: { args: chromeArgs },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-light',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'light',
        viewport: { width: 1200, height: 792 },
      },
    },
    {
      name: 'mobile-light',
      use: {
        colorScheme: 'light',
        isMobile: true,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'desktop-dark',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'dark',
        viewport: { width: 1200, height: 792 },
      },
    },
  ],
});
