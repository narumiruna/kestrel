import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex
      .replace('#', '')
      .match(/.{2}/g)
      ?.map((channel) => Number.parseInt(channel, 16) / 255);
    if (channels == null) throw new Error(`Invalid color: ${hex}`);
    const [red, green, blue] = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
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
  const more = firstActions.getByRole('button', { name: /More/ });
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

  if (testInfo.project.name === 'desktop-light') {
    await page.getByRole('button', { name: /New item/ }).focus();
    await page.keyboard.press('Enter');
    const newPlace = page.getByRole('menuitem', { name: 'New place' });
    await expect(newPlace).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/dashboard\/map\?kind=places&new=1$/);
  }
});

test('map workspace keeps labeled regions and recovery controls', async ({ page }, testInfo) => {
  await page.goto('/dashboard/map?kind=routes');
  await expect(page.getByRole('link', { name: 'Map' }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  if (testInfo.project.name === 'mobile-light') {
    const mobilePanels = page.locator('.mobile-workspace-actions');
    await mobilePanels.getByRole('radio', { name: 'Choose' }).click();
    await expect(mobilePanels.getByRole('radio', { checked: true, name: 'Choose' })).toBeVisible();
    await mobilePanels.getByRole('radio', { name: 'Edit' }).click();
    await expect(mobilePanels.getByRole('radio', { checked: true, name: 'Edit' })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /Save route/ })).toBeVisible();
  await page.locator('.route-settings-disclosure > .ui-disclosure-trigger').click();
  await page.getByLabel('Playback mode').click();
  await expect(page.getByRole('option', { name: 'Ping-pong' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.route-settings-disclosure > .ui-disclosure-trigger').click();

  await expect(page.locator('.index-card')).toBeVisible();
});

test('map workspace groups controls and preserves draft through panel focus', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Desktop panel controls are sufficient.');
  await page.goto('/dashboard/map?kind=routes');

  const picker = page.getByRole('complementary', { name: 'Map item picker' });
  const selectedItem = picker.locator('.notebook-entry.active');
  await expect(selectedItem).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Map viewport' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Map appearance' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zoom in' })).toHaveAttribute('title', 'Zoom in');
  await expect(page.getByRole('button', { name: 'Zoom out' })).toHaveAttribute('title', 'Zoom out');
  await expect(page.getByRole('button', { name: 'Fit to all pins' })).toBeVisible();
  await page.getByRole('link', { name: 'Map' }).first().focus();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard field notes' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard field notes' })).toHaveCount(0);

  const settings = page.locator('.route-settings-disclosure');
  await settings.locator(':scope > .ui-disclosure-trigger').click();
  const name = settings.getByLabel('Name');
  await name.fill('Panel focus draft');
  const focus = page.getByRole('button', { name: 'Focus map' });
  await focus.click();
  await expect(page.getByRole('button', { name: 'Show item picker' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show inspector' })).toBeVisible();
  const restore = page.getByRole('button', { name: 'Show map panels' });
  await expect(restore).toHaveAttribute('aria-pressed', 'true');
  await restore.click();
  await expect(page.getByRole('button', { name: 'Hide item picker' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide inspector' })).toBeVisible();
  await expect(name).toHaveValue('Panel focus draft');
  await expect(page.getByText('Unsaved changes')).toBeVisible();

  const appearance = page.getByRole('button', { name: /Map appearance/ });
  await appearance.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(appearance).toBeFocused();
});

test('map workspace keeps one contextual panel across mobile and tablet modes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-light', 'Mobile draft continuity is sufficient.');
  await page.goto('/dashboard/map?kind=routes');
  const mobilePanels = page.locator('.mobile-workspace-actions');
  await mobilePanels.getByRole('radio', { name: 'Edit' }).click();
  const settings = page.locator('.route-settings-disclosure');
  await settings.locator(':scope > .ui-disclosure-trigger').click();
  const name = settings.getByLabel('Name');
  await name.fill('Mobile panel draft');

  await mobilePanels.getByRole('radio', { name: 'Map', exact: true }).click();
  await expect(page.locator('.map-library-panel')).toBeHidden();
  await expect(page.locator('.index-card')).toBeHidden();
  await mobilePanels.getByRole('radio', { name: 'Choose' }).click();
  await expect(page.locator('.map-library-panel')).toBeVisible();
  await expect(page.locator('.index-card')).toBeHidden();
  await mobilePanels.getByRole('radio', { name: 'Edit' }).click();
  await expect(name).toHaveValue('Mobile panel draft');
  await expect(page.getByText('Unsaved changes')).toBeVisible();

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole('navigation', { name: 'Map workspace panels' })).toBeVisible();
  await expect(page.locator('.map-library-panel')).toBeHidden();
  await expect(page.locator('.index-card')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('route builder consistently calls Place records saved places', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'One copy audit fixture is sufficient.');
  await page.goto('/dashboard/map?kind=routes&new=1');
  await expect(page.getByText('Add from saved places')).toBeVisible();
  await expect(page.getByLabel('Search saved places')).toBeVisible();
  await expect(page.getByText(/favorites/i)).toHaveCount(0);
});

test('map workspace picker stays scannable, focused, and accessible when dense', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-light',
    'Desktop light/dark fixtures are sufficient.',
  );
  await page.goto('/dashboard/map?kind=routes');
  await page.setViewportSize({ width: 1440, height: 900 });

  const stage = page.locator('.cartographer-stage-map');
  const picker = page.locator('.map-library-panel');
  const list = picker.locator('.notebook-list');
  const selected = picker.locator('.notebook-entry.active');
  await expect(selected.locator('.notebook-entry-selected-mark')).toBeVisible();
  await selected.focus();
  await expect(selected).toBeFocused();
  await expect(selected).toHaveCSS('outline-style', 'none');
  await expect(selected).not.toHaveCSS('box-shadow', 'none');
  await expect(selected.locator('.route-card-meta-line')).toHaveCSS('color', 'rgb(114, 88, 63)');
  expect(contrastRatio('#72583f', '#fff9ec')).toBeGreaterThanOrEqual(4.5);

  await list.evaluate((element) => {
    const source = element.querySelector('.notebook-entry:not(.active)');
    if (source == null) return;
    for (let index = element.children.length; index < 50; index += 1) {
      const clone = source.cloneNode(true) as HTMLElement;
      clone.setAttribute('aria-pressed', 'false');
      clone.setAttribute('data-dense-map-item', String(index));
      element.append(clone);
    }
  });
  await expect(list.locator('.notebook-entry')).toHaveCount(50);

  const results = await new AxeBuilder({ page }).include('.cartographer-stage-map').analyze();
  expect(results.violations).toEqual([]);
  await expect(stage).toBeVisible();
});

test('map workspace keeps useful map width at the compact desktop breakpoint', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-light',
    'One compact desktop fixture is sufficient.',
  );
  await page.goto('/dashboard/map?kind=places');
  await page.setViewportSize({ width: 1024, height: 768 });

  const picker = page.locator('.map-library-panel');
  const inspector = page.locator('.index-card');
  const pickerBox = await picker.boundingBox();
  const inspectorBox = await inspector.boundingBox();
  expect(
    (inspectorBox?.x ?? 0) - ((pickerBox?.x ?? 0) + (pickerBox?.width ?? 0)),
  ).toBeGreaterThanOrEqual(380);
  await expect(picker.locator('.notebook-entry.active')).toHaveAttribute('aria-pressed', 'true');
  await expectNoHorizontalOverflow(page);
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
  await rows.first().locator('.waypoint-menu-trigger').click();
  await page.getByRole('menuitem', { name: 'Move down' }).click();

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
  await expect(settings).toHaveAttribute('data-state', 'open');
  await expect(settings.getByLabel('Name')).toBeVisible();
  await expect(favorites).toHaveAttribute('data-state', 'open');
  await favorites.locator('.favorite-add').first().click();
  await expect(rows).toHaveCount(1);

  const canvas = page.locator('.cartographer-map .maplibregl-canvas');
  await expect(canvas).toBeVisible();
  await canvas.click({ position: { x: 500, y: 300 } });
  await expect(rows).toHaveCount(2);
  await settings.getByLabel('Name').fill('Inspector test route');
  await expect(inspector.getByRole('button', { name: 'Save route' })).toBeEnabled();
});

test('route settings reopen when hidden speed validation fails', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'One native validation path is sufficient.');
  await page.goto('/dashboard/map?kind=routes');

  const settings = page.locator('.route-settings-disclosure');
  await settings.locator(':scope > .ui-disclosure-trigger').click();
  const speed = settings.getByLabel('Default speed (km/h)');
  await speed.fill('');
  await settings.locator(':scope > .ui-disclosure-trigger').click();
  await expect(settings).toHaveAttribute('data-state', 'closed');
  await page.getByRole('button', { name: 'Save route' }).click();

  await expect(settings).toHaveAttribute('data-state', 'open');
  await expect(speed).toBeVisible();
  await expect(speed).toBeFocused();
});

test('route inspector preserves settings, dialog, and error recovery paths', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'One recovery flow is sufficient.');
  await page.goto('/dashboard/map?kind=routes');

  const inspector = page.locator('.index-card-route');
  const settings = inspector.locator('.route-settings-disclosure');
  await settings.locator(':scope > .ui-disclosure-trigger').click();
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
  const remoteDialog = page.getByRole('dialog', { name: 'Web remote control' });
  await expect(remoteDialog).toBeVisible();
  await expect(remoteDialog.getByRole('combobox', { name: 'Device' })).toContainText(
    'No Android devices',
  );
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
  await settings.locator(':scope > .ui-disclosure-trigger').click();
  await settings
    .getByLabel('Name')
    .fill('伊勢市から宇治山田駅までの長い経路名 Long inspector route name');
  await settings.locator(':scope > .ui-disclosure-trigger').click();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mobile-workspace-actions').getByRole('radio', { name: 'Edit' }).click();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 600, height: 400 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectNoHorizontalOverflow(page);
});

test('dirty route guards the empty saved-place navigation', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-light',
    'One guarded navigation path is sufficient.',
  );
  await page.route('**/api/backend/places', (route) =>
    route.fulfill({ body: '[]', contentType: 'application/json', status: 200 }),
  );
  await page.goto('/dashboard/map?kind=routes&new=1');
  const name = page.getByLabel('Name');
  await name.fill('Guarded route draft');
  const createSavedPlace = page.getByRole('link', { name: 'Create a saved place first' });

  await createSavedPlace.click();
  const discardDialog = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
  await expect(discardDialog).toBeVisible();
  await expect(discardDialog).toContainText(
    'Your unsaved map edits will be lost. Save first if you want to keep them.',
  );
  await discardDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/dashboard\/map\?kind=routes&new=1$/);
  await expect(name).toHaveValue('Guarded route draft');

  await createSavedPlace.click();
  await discardDialog.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(/\/dashboard\/library\/places$/);
});

test('route inspector explains the empty saved places state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'One empty-state fixture is sufficient.');
  await page.route('**/api/backend/places', (route) =>
    route.fulfill({ body: '[]', contentType: 'application/json', status: 200 }),
  );
  await page.goto('/dashboard/map?kind=routes&new=1');
  await expect(page.getByText('No saved places yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create a saved place first' })).toBeVisible();
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
  await expect(publicPage.locator('.public-share-header')).toBeVisible();
  await expect(publicPage.locator('.public-share-card').last()).toBeVisible();
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
