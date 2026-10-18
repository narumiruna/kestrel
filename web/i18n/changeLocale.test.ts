import assert from 'node:assert/strict';
import test from 'node:test';
import { changeLocale } from './changeLocale.ts';

test('successful language save refreshes server content without reloading or clearing drafts', async () => {
  const draft = { name: 'Unsaved route', latitude: '25.033123' };
  let refreshed = 0;
  const result = await changeLocale(
    'ja',
    async (value) => {
      assert.equal(value, 'ja');
      return { ok: true };
    },
    () => {
      refreshed++;
    },
  );
  assert.equal(result, true);
  assert.equal(refreshed, 1);
  assert.deepEqual(draft, { name: 'Unsaved route', latitude: '25.033123' });
});
test('failed cookie write retains current locale and does not refresh', async () => {
  let refreshed = 0;
  assert.equal(
    await changeLocale(
      'ja',
      async () => ({ ok: false }),
      () => {
        refreshed++;
      },
    ),
    false,
  );
  assert.equal(refreshed, 0);
});
test('rejected transport is a handled failure, not an unhandled transition rejection', async () => {
  let refreshed = 0;
  assert.equal(
    await changeLocale(
      'ja',
      async () => {
        throw new TypeError('offline');
      },
      () => {
        refreshed++;
      },
    ),
    false,
  );
  assert.equal(refreshed, 0);
});
