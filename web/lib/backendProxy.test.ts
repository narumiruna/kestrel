import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authenticateProxyUpload,
  backendRequestUrl,
  ProxyAuthenticationError,
  proxyResponseBody,
  ROUTE_WRITE_BODY_BYTES,
} from './backendProxy.ts';

import { UploadBudget, withBoundedUpload } from './boundedUpload.ts';

const boundedProxyBody = (request: Request, limit = 4 * 1024 * 1024) =>
  withBoundedUpload(
    request,
    limit,
    async () => undefined,
    async (body) => body,
    new UploadBudget(),
  );

function request(chunks: number[], headers?: Record<string, string>, signal?: AbortSignal) {
  let cancelled = false;
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of chunks) controller.enqueue(new Uint8Array(size));
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    request: new Request('http://localhost/runs', {
      method: 'POST',
      body: source,
      headers,
      signal,
      duplex: 'half',
    } as RequestInit),
    cancelled: () => cancelled,
  };
}

test('large proxy uploads authenticate through a bodyless session probe before receiving data', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), 'http://backend:3300/auth/session');
    assert.equal(init?.method, 'GET');
    assert.equal(init?.body, undefined);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer token');
    return new Response(null, { status: 204 });
  };
  const anonymous = new Request('http://localhost/upload', {
    method: 'POST',
    body: 'private input',
  });
  await assert.rejects(
    authenticateProxyUpload(
      anonymous,
      'http://backend:3300',
      new AbortController().signal,
      fetcher,
    ),
    (error) => error instanceof ProxyAuthenticationError && error.status === 401,
  );
  assert.equal(calls, 0);
  assert.equal(anonymous.bodyUsed, false);
  const owned = new Request('http://localhost/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: 'private input',
  });
  await authenticateProxyUpload(
    owned,
    'http://backend:3300',
    new AbortController().signal,
    fetcher,
  );
  assert.equal(calls, 1);
  assert.equal(owned.bodyUsed, false);
  for (const status of [401, 403])
    await assert.rejects(
      authenticateProxyUpload(
        owned,
        'http://backend:3300',
        new AbortController().signal,
        async () => new Response('private error', { status }),
      ),
      (error) =>
        error instanceof ProxyAuthenticationError &&
        error.status === status &&
        !error.message.includes('private'),
    );
});

test('proxy URL stays on the configured Backend and preserves its path prefix', () => {
  const base = 'http://backend:3300/api';
  assert.equal(
    backendRequestUrl(base, ['routes', 'a b'], '?limit=2').href,
    'http://backend:3300/api/routes/a%20b?limit=2',
  );
  for (const path of [
    ['http://attacker.invalid'],
    ['//attacker.invalid'],
    ['\\\\attacker.invalid'],
    ['routes', '/ai/route-assistant/runs'],
  ]) {
    const url = backendRequestUrl(base, path, '');
    assert.equal(url.origin, 'http://backend:3300');
    assert.ok(url.pathname.startsWith('/api/'));
  }
  for (const path of [
    ['..', 'ai'],
    ['routes', '.', 'id'],
  ])
    assert.throws(() => backendRequestUrl(base, path, ''), URIError);
});

test('proxy admits full-precision 1000-point route saves and bounds route uploads', async () => {
  const points = Array.from({ length: 1000 }, (_, n) => ({
    latitude: 25.0330123456789 + n / 1e10,
    longitude: 121.56541234567891,
    speedKmh: 5.123456789012345,
    pauseSeconds: 2.123456789012345,
  }));
  const body = JSON.stringify({ waypoints: points });
  assert.ok(new TextEncoder().encode(body).byteLength > 100 * 1024);
  const result = await boundedProxyBody(
    new Request('http://localhost/routes', { method: 'POST', body }),
    ROUTE_WRITE_BODY_BYTES,
  );
  assert.deepEqual(JSON.parse(new TextDecoder().decode(result)).waypoints, points);
  const oversized = request([ROUTE_WRITE_BODY_BYTES, 1]);
  await assert.rejects(boundedProxyBody(oversized.request, ROUTE_WRITE_BODY_BYTES), RangeError);
});

test('proxy rejects oversized declared or actual chunked image bodies before a full allocation', async () => {
  const declared = request([1], { 'content-length': '17' });
  await assert.rejects(boundedProxyBody(declared.request, 16), RangeError);
  const chunks = request([8, 9]);
  await assert.rejects(boundedProxyBody(chunks.request, 16), RangeError);
  assert.equal(chunks.cancelled(), true);
});

test('proxy buffers only bounded body bytes and handles empty uploads', async () => {
  const bytes = await boundedProxyBody(
    new Request('http://localhost/runs', { method: 'POST', body: '12345' }),
    5,
  );
  assert.equal(new TextDecoder().decode(bytes), '12345');
  assert.equal(
    (await boundedProxyBody(new Request('http://localhost/runs', { method: 'POST' }))).byteLength,
    0,
  );
});

test('aborted upload cancels its reader', async () => {
  const controller = new AbortController();
  const source = request([1], undefined, controller.signal);
  const result = boundedProxyBody(source.request, 10);
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(source.cancelled(), true);
});

test('downstream stream cancellation explicitly aborts the Backend fetch', async () => {
  const upstream = new AbortController();
  let cancelled = false;
  let cleanup = 0;
  const source = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const response = proxyResponseBody(source, upstream, () => cleanup++);
  const reader = response.getReader();
  await reader.cancel('stop');
  assert.equal(upstream.signal.aborted, true);
  assert.equal(cancelled, true);
  assert.equal(cleanup, 1);
});

test('proxy forwards response chunks without waiting for completion and releases resources', async () => {
  let output!: ReadableStreamDefaultController<Uint8Array>;
  let cleaned = 0;
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      output = controller;
    },
  });
  const response = proxyResponseBody(source, new AbortController(), () => cleaned++);
  const reader = response.getReader();
  output.enqueue(new TextEncoder().encode('status\n'));
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'status\n');
  assert.equal(cleaned, 0);
  output.close();
  assert.equal((await reader.read()).done, true);
  assert.equal(cleaned, 1);
});
