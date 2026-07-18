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

test('route inspector prioritizes waypoints with one scroll region', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Desktop inspector geometry is sufficient.');
  await page.goto('/dashboard/map?kind=routes');

  const inspector = page.locator('.index-card-route');
  const editor = inspector.locator('.route-editor');
  const waypoints = editor.locator('.route-editor-waypoints-section');
  const settings = editor.locator('.route-settings-disclosure');
  await expect(waypoints).toBeVisible();
  await expect(settings).toBeVisible();
  expect(
    await waypoints.evaluate(
      (element, settingsElement) =>
        (element.compareDocumentPosition(settingsElement as Node) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
      await settings.elementHandle(),
    ),
  ).toBe(true);

  const waypointList = waypoints.locator('.waypoint-list');
  await expect(waypointList).toHaveCSS('overflow-y', 'visible');
  await expect(inspector.getByRole('button', { name: /^Device/ })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(
    inspector.locator('.route-editor-footer').getByRole('button', { name: 'Share' }),
  ).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: /Save route/ })).toBeVisible();

  const closedCoordinates = waypoints
    .locator('.waypoint-row:not(.selected) .waypoint-coordinates')
    .first();
  await expect(closedCoordinates).toBeHidden();
});

test('route waypoint keyboard menu reorders the selected point', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-light',
    'One keyboard interaction path is sufficient.',
  );
  await page.goto('/dashboard/map?kind=routes');

  const rows = page.locator('.index-card-route .waypoint-row');
  await expect(rows).not.toHaveCount(0);
  await rows.first().locator('.waypoint-focus').click();
  const coordinates = await rows.first().locator('.waypoint-coordinates').textContent();
  await rows.first().locator('.waypoint-menu > summary').click();
  await page.getByRole('button', { name: 'Move down' }).click();

  await expect(rows.nth(1)).toHaveClass(/selected/);
  await expect(rows.nth(1).locator('.waypoint-coordinates')).toHaveText(coordinates ?? '');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
});

test('new route exposes required settings and both waypoint entry paths', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'One creation flow is sufficient.');
  await page.goto('/dashboard/map?kind=routes&new=1');

  const inspector = page.locator('.index-card-route');
  const settings = inspector.locator('.route-settings-disclosure');
  const favorites = inspector.locator('.route-add-from-favorites');
  const rows = inspector.locator('.waypoint-row');
  await expect(settings).toHaveAttribute('open', '');
  await expect(settings.getByLabel('Name')).toBeVisible();
  await expect(favorites).toHaveAttribute('open', '');
  await expect(inspector).toHaveScreenshot('route-inspector-new.png');
  await favorites.locator('.favorite-add').first().click();
  await expect(rows).toHaveCount(1);

  const canvas = page.locator('.cartographer-map .maplibregl-canvas');
  await expect(canvas).toBeVisible();
  await canvas.click({ position: { x: 500, y: 300 } });
  await expect(rows).toHaveCount(2);
  await settings.getByLabel('Name').fill('Inspector test route');
  await expect(inspector.getByRole('button', { name: 'Save route' })).toBeEnabled();
});

test('route inspector preserves settings, dialog, and error recovery paths', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'One recovery flow is sufficient.');
  await page.goto('/dashboard/map?kind=routes');

  const inspector = page.locator('.index-card-route');
  const settings = inspector.locator('.route-settings-disclosure');
  await settings.locator(':scope > summary').click();
  await expect(settings.getByLabel('Name')).toBeVisible();
  await expect(settings.getByLabel('Default speed (km/h)')).toBeVisible();
  await expect(settings.getByLabel('Playback mode')).toBeVisible();
  await settings.getByText('More details').click();
  await expect(settings.getByLabel('Description (optional)')).toBeVisible();

  const share = inspector.getByRole('button', { name: 'Share' });
  await share.click();
  await expect(page.getByRole('dialog', { name: 'Share route' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(share).toBeFocused();

  const device = inspector.getByRole('button', { name: /^Device/ });
  await device.click();
  await expect(page.getByRole('dialog', { name: 'Web remote control' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(device).toBeFocused();

  await settings.getByLabel('Name').fill('Route save error fixture');
  await page.route('**/api/backend/routes/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({
        body: JSON.stringify({ message: 'Test save failed' }),
        contentType: 'application/json',
        status: 500,
      });
      return;
    }
    await route.continue();
  });
  await inspector.getByRole('button', { name: 'Save route' }).click();
  await expect(inspector.getByRole('alert')).toContainText('Test save failed');
  await inspector.getByRole('button', { name: 'Discard changes' }).click();
  await expect(inspector.getByRole('alert')).toHaveCount(0);
});

test('route inspector adapts to long and dense content without nested scrolling', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-light',
    'One deterministic viewport matrix is sufficient.',
  );
  await page.goto('/dashboard/map?kind=routes');
  await page.setViewportSize({ width: 1440, height: 900 });

  const inspector = page.locator('.index-card-route');
  await expect(inspector).toHaveScreenshot('route-inspector-declutter.png');
  const list = inspector.locator('.waypoint-list');
  const cloneRowsTo = (count: number) =>
    list.evaluate((element, targetCount) => {
      const row = element.querySelector('.waypoint-row');
      if (row == null) return;
      for (let index = element.children.length; index < targetCount; index += 1) {
        const clone = row.cloneNode(true) as HTMLElement;
        clone.setAttribute('data-dense-waypoint', String(index));
        element.append(clone);
      }
    }, count);
  await cloneRowsTo(15);
  await expect(list.locator('.waypoint-row')).toHaveCount(15);
  await cloneRowsTo(50);
  await expect(list.locator('.waypoint-row')).toHaveCount(50);
  expect(
    await list.evaluate((element) => {
      let ancestor = element.parentElement;
      let scrollOwners = 0;
      while (ancestor != null) {
        const overflowY = getComputedStyle(ancestor).overflowY;
        if (
          (overflowY === 'auto' || overflowY === 'scroll') &&
          ancestor.scrollHeight > ancestor.clientHeight
        ) {
          scrollOwners += 1;
        }
        ancestor = ancestor.parentElement;
      }
      return scrollOwners;
    }),
  ).toBe(1);
  await list.locator('.waypoint-row').last().scrollIntoViewIfNeeded();
  await expect(list.locator('.waypoint-row').last()).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Save route' })).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expectNoHorizontalOverflow(page);
  const settings = inspector.locator('.route-settings-disclosure');
  await settings.locator(':scope > summary').click();
  await settings
    .getByLabel('Name')
    .fill('伊勢市から宇治山田駅までの長い経路名 Long inspector route name');
  await settings.locator(':scope > summary').click();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Edit' }).click();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 600, height: 400 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectNoHorizontalOverflow(page);
});

test('route inspector explains the empty favorites state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'One empty-state fixture is sufficient.');
  await page.route('**/api/backend/places', (route) =>
    route.fulfill({ body: '[]', contentType: 'application/json', status: 200 }),
  );
  await page.goto('/dashboard/map?kind=routes&new=1');
  await expect(page.getByText('No favorite places yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create a favorite place first' })).toBeVisible();
});

test('share remains directly discoverable and public view is usable', async ({
  page,
  browser,
  baseURL,
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

  const publicContext = await browser.newContext({
    baseURL,
    colorScheme: 'light',
    viewport: { width: 1200, height: 792 },
  });
  const publicPage = await publicContext.newPage();
  await publicPage.goto(new URL(publicUrl).pathname);
  await expect(publicPage.getByRole('heading', { name: 'Taipei 101' })).toBeVisible();
  await expect(publicPage.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(publicPage.getByRole('button', { name: 'Sign in to copy' })).toBeVisible();
  await expectNoHorizontalOverflow(publicPage);
  await expect(publicPage.locator('.public-share-header')).toHaveScreenshot(
    'public-share-header.png',
  );
  await expect(publicPage.locator('.public-share-card').last()).toHaveScreenshot(
    'public-share-copy-card.png',
  );
  await publicContext.close();

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
