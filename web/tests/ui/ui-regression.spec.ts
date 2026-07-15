import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

function dynamicMasks(page: import('@playwright/test').Page) {
  return [page.locator('.dashboard-last-updated')];
}

test('login keeps one clear authentication path', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({
    colorScheme: testInfo.project.use.colorScheme,
    viewport: testInfo.project.use.viewport,
  });
  const page = await context.newPage();
  await page.goto(`${baseURL}/login`);
  await expect(page.getByRole('heading', { name: 'Kestrel Cloud' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot('login.png', { timeout: 15_000 });
  await context.close();
});

test('library preserves hierarchy without horizontal overflow', async ({ page }, testInfo) => {
  await page.goto('/dashboard/library');
  await expect(page.getByRole('heading', { name: 'Places and routes' })).toBeVisible();
  await expect(page.locator('.maplibregl-map')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  const firstActions = page.locator('.library-item-actions').first();
  const open = firstActions.getByRole('link', { name: 'Open on map' });
  const share = firstActions.getByRole('button', { name: 'Share' });
  const more = firstActions.getByText('More', { exact: true });
  await expect(open).toBeVisible();
  await expect(share).toBeVisible();
  await expect(more).toBeVisible();

  const [openBox, shareBox, moreBox] = await Promise.all([
    open.boundingBox(),
    share.boundingBox(),
    more.boundingBox(),
  ]);
  expect(openBox?.height).toBeGreaterThanOrEqual(40);
  expect(shareBox?.height).toBeGreaterThanOrEqual(40);
  expect(moreBox?.height).toBeGreaterThanOrEqual(40);
  if (testInfo.project.name === 'mobile-light') {
    expect(Math.abs((shareBox?.y ?? 0) - (moreBox?.y ?? 1))).toBeLessThan(2);
    expect(openBox?.width ?? 0).toBeGreaterThan((shareBox?.width ?? 0) * 1.8);
  }

  await expect(page).toHaveScreenshot('library.png', { mask: dynamicMasks(page) });
});

test('map workspace keeps labeled regions and recovery controls', async ({ page }, testInfo) => {
  await page.goto('/dashboard/map?kind=routes');
  await expect(page.getByRole('link', { name: 'Map' }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  if (testInfo.project.name === 'mobile-light') {
    await page.getByRole('button', { name: 'Choose' }).click();
    await expect(page.getByRole('button', { name: 'Choose', pressed: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('button', { name: 'Edit', pressed: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /Save route/ })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Ping-pong' })).toHaveCount(1);

  if (testInfo.project.name === 'mobile-light') {
    await expect(page).toHaveScreenshot('map-workspace.png', {
      fullPage: true,
      mask: [page.locator('.cartographer-map-layer')],
      maskColor: '#d8cfbf',
    });
  } else {
    await expect(page.locator('.index-card')).toHaveScreenshot('map-editor.png');
  }
});

test('share remains directly discoverable and public view is usable', async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-light',
    'One deterministic share lifecycle is sufficient.',
  );
  await page.goto('/dashboard/library');
  const shareLoaded = page.waitForResponse(
    (response) => response.url().includes('/share-link') && response.request().method() === 'GET',
  );
  await page
    .locator('.library-item-actions')
    .first()
    .getByRole('button', { name: 'Share' })
    .click();
  await shareLoaded;
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(/Taipei 101/);
  await expect(dialog.getByText('Share place', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();
  const createLink = dialog.getByRole('button', { name: 'Create public link' });
  if (await createLink.isVisible()) await createLink.click();
  const enableLink = dialog.getByRole('button', { name: 'Re-enable link' });
  if (await enableLink.isVisible()) await enableLink.click();
  const publicUrl = await dialog.getByLabel('Public URL').inputValue();
  await expect(page).toHaveScreenshot('share-dialog.png', {
    mask: [...dynamicMasks(page), dialog.getByLabel('Public URL')],
  });

  const publicPage = await context.newPage();
  await publicPage.goto(publicUrl);
  await expect(publicPage.getByRole('heading', { name: 'Taipei 101' })).toBeVisible();
  await expectNoHorizontalOverflow(publicPage);
  await expect(publicPage).toHaveScreenshot('public-share.png');
  await publicPage.close();

  const disableLink = dialog.getByRole('button', { name: 'Disable link' });
  if (await disableLink.isVisible()) await disableLink.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('library adapts at 320, tablet, wide, zoom, dense, and RTL states', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-light',
    'One deterministic responsive matrix is sufficient.',
  );
  await page.goto('/dashboard/library');
  await expect(page.getByRole('heading', { name: 'Places and routes' })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 568 });
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot('library-320.png', { mask: dynamicMasks(page) });

  await page.setViewportSize({ width: 1024, height: 768 });
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectNoHorizontalOverflow(page);

  await page.evaluate(() => {
    const list = document.querySelector('.library-item-list');
    const row = list?.querySelector('.library-item-row');
    if (list == null || row == null) return;
    for (let index = list.children.length; index < 55; index += 1) {
      const clone = row.cloneNode(true) as HTMLElement;
      clone.setAttribute('data-dense-fixture', String(index));
      list.append(clone);
    }
  });
  await page.setViewportSize({ width: 1200, height: 800 });
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot('library-dense.png', { mask: dynamicMasks(page) });

  await page.setViewportSize({ width: 600, height: 400 });
  await page.evaluate(() => {
    document.documentElement.dir = 'rtl';
    document.documentElement.style.fontSize = '200%';
  });
  await expectNoHorizontalOverflow(page);
});

test('core surfaces have no automated accessibility violations', async ({ page }) => {
  await page.goto('/dashboard/library');
  await expect(page.getByRole('heading', { name: 'Places and routes' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
