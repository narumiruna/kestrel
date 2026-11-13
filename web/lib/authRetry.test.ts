import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, apiFetch } from './api.ts';
import { withAccessTokenRetry } from './authRetry.ts';

test('wrong current passwords never refresh, replay, or replace the domain rejection', async (t) => {
  for (const path of [
    '/auth/password/change',
    '/auth/oidc/link/start',
    '/auth/sessions/other/revoke',
    '/auth/sessions/revoke-others',
    '/devices/id/revoke',
  ]) {
    let requests = 0;
    let refreshes = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      requests++;
      return Response.json(
        { code: 'INVALID_CURRENT_PASSWORD', message: 'invalid current password' },
        { status: 401 },
      );
    });
    await assert.rejects(
      withAccessTokenRetry(
        () => apiFetch(path, { method: 'POST', body: '{"currentPassword":"wrong"}' }),
        async () => {
          refreshes++;
          return apiFetch(path, { method: 'POST' });
        },
      ),
      (error) =>
        error instanceof ApiError &&
        error.status === 401 &&
        error.code === 'INVALID_CURRENT_PASSWORD',
    );
    assert.equal(requests, 1, path);
    assert.equal(refreshes, 0, path);
    t.mock.restoreAll();
  }
});

test('uncoded and coded access-token 401 failures still refresh and replay exactly once', async (t) => {
  for (const code of [undefined, 'UNAUTHORIZED', 'ACCESS_TOKEN_EXPIRED']) {
    let requests = 0;
    let refreshes = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      requests++;
      return requests === 1
        ? Response.json({ code, message: 'expired token' }, { status: 401 })
        : Response.json({ ok: true });
    });
    const request = () => apiFetch('/auth/password/change', { method: 'POST', body: '{}' });
    const response = await withAccessTokenRetry(request, async () => {
      refreshes++;
      return request();
    });
    assert.deepEqual(response, { ok: true });
    assert.equal(requests, 2);
    assert.equal(refreshes, 1);
    t.mock.restoreAll();
  }
});

test('a wrong current password after token refresh is returned without a second refresh', async (t) => {
  let requests = 0;
  let refreshes = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return Response.json(requests === 1 ? {} : { code: 'INVALID_CURRENT_PASSWORD' }, {
      status: 401,
    });
  });
  const request = () => apiFetch('/auth/password/change', { method: 'POST', body: '{}' });
  await assert.rejects(
    withAccessTokenRetry(request, async () => {
      refreshes++;
      return request();
    }),
    (error) => error instanceof ApiError && error.code === 'INVALID_CURRENT_PASSWORD',
  );
  assert.equal(requests, 2);
  assert.equal(refreshes, 1);
});

test('rate limits, forbidden responses and network failures are never retried', async () => {
  for (const error of [
    new ApiError('rate limited', 429),
    new ApiError('forbidden', 403),
    new TypeError('network failed'),
  ]) {
    let retries = 0;
    await assert.rejects(
      withAccessTokenRetry(
        async () => {
          throw error;
        },
        async () => {
          retries++;
        },
      ),
      (actual) => actual === error,
    );
    assert.equal(retries, 0);
  }
});
