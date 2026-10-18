import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, apiFetch, readApiError } from './api.ts';

test('coded, uncoded, malformed and non-JSON failures do not expose response bodies', async () => {
  for (const response of [
    Response.json(
      { code: 'SYNC_CURSOR_EXPIRED', message: 'secret location payload' },
      { status: 400 },
    ),
    Response.json({ message: ['secret', 'body'] }, { status: 401 }),
    Response.json({ code: { bad: 'shape' } }, { status: 500 }),
    new Response('<html>secret</html>', { status: 502 }),
    Response.json(null, { status: 503 }),
  ]) {
    const result = await readApiError(response);
    assert.equal(result.message, `HTTP ${response.status}`);
    assert.ok(!JSON.stringify(result).includes('secret'));
    if (response.status === 400) assert.equal(result.code, 'SYNC_CURSOR_EXPIRED');
    else assert.equal(result.code, undefined);
  }
});
test('API URLs, JSON numbers and authenticated headers remain unchanged', async () => {
  const original = globalThis.fetch;
  let request: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init: init ?? {} };
    return Response.json({ ok: true });
  };
  try {
    await apiFetch('/places', {
      accessToken: 'test-token',
      method: 'POST',
      body: JSON.stringify({ latitude: 1.5, longitude: -2.25 }),
    });
    assert.ok(request);
    assert.equal(request.url, '/api/backend/places');
    assert.equal(request.init.body, '{"latitude":1.5,"longitude":-2.25}');
    assert.equal(
      (request.init.headers as Record<string, string>).authorization,
      'Bearer test-token',
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('API failures retain status and code for existing auth/retry decisions', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ code: 'reauthentication_required', message: 'secret' }, { status: 403 });
  try {
    await assert.rejects(
      () => apiFetch('/auth/android-login-attempts'),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 403 &&
        error.code === 'reauthentication_required' &&
        !error.message.includes('secret'),
    );
  } finally {
    globalThis.fetch = original;
  }
});
