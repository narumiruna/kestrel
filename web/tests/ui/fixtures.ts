import { type BrowserContext, test as base, expect } from '@playwright/test';

type WorkerFixtures = {
  authenticatedContext: BrowserContext;
};

export const test = base.extend<object, WorkerFixtures>({
  authenticatedContext: [
    async ({ browser }, use, workerInfo) => {
      const context = await browser.newContext({
        baseURL: workerInfo.project.use.baseURL,
        colorScheme: workerInfo.project.use.colorScheme,
        isMobile: workerInfo.project.use.isMobile,
        viewport: workerInfo.project.use.viewport,
      });
      const page = await context.newPage();
      await page.goto('/login');
      await expect(page).toHaveURL(/\/login$/);
      await page.getByLabel('Username').fill('admin');
      await page.getByLabel('Password').fill('admin');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/dashboard(?:\/map)?$/);
      await page.close();
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],
  page: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
