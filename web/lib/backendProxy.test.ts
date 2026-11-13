import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as turn } from 'node:timers/promises';
import {
  ASSISTANT_BODY_BYTES,
  authenticateProxyUpload,
  backendRequestUrl,
  DEFAULT_BODY_BYTES,
  forwardProxyRequest,
  ProxyAuthenticationError,
  proxyResponseBody,
  ROUTE_WRITE_BODY_BYTES,
} from './backendProxy.ts';

import {
  UPLOAD_DEADLINE_MS,
  UploadBudget,
  UploadError,
  withBoundedUpload,
} from './boundedUpload.ts';

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

const BACKEND = 'http://backend:3300/api';

function forward(request: Request, path: string[], fetcher: typeof fetch, budget?: UploadBudget) {
  return forwardProxyRequest(request, BACKEND, path, request.signal, fetcher, budget);
}

function upload(
  method: string,
  sizes: number[],
  headers: Record<string, string> = {},
  signal?: AbortSignal,
) {
  let cancelled = false;
  let readers = 0;
  const request = new Request('http://localhost/api/backend/upload?key=value', {
    method,
    headers,
    signal,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const size of sizes) controller.enqueue(new Uint8Array(size));
      },
      cancel() {
        cancelled = true;
      },
    }),
    duplex: 'half',
  } as RequestInit);
  assert.ok(request.body);
  const body = request.body;
  const getReader = body.getReader.bind(body);
  Object.defineProperty(body, 'getReader', {
    value: () => {
      readers++;
      return getReader();
    },
  });
  return { request, cancelled: () => cancelled, readers: () => readers };
}

test('actual forwarding permits public login, preserves bytes and strips transport headers', async () => {
  const body = JSON.stringify({ username: 'admin', password: 'admin' });
  const request = new Request('http://localhost/api/backend/auth/login?key=value', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'content-length': String(body.length) },
  });
  let calls = 0;
  const response = await forward(request, ['auth', 'login'], async (url, init) => {
    calls++;
    assert.equal(String(url), `${BACKEND}/auth/login?key=value`);
    assert.equal(init?.method, 'POST');
    assert.equal(new TextDecoder().decode(init?.body as ArrayBuffer), body);
    assert.equal(new Headers(init?.headers).get('content-type'), 'application/json');
    assert.equal(new Headers(init?.headers).has('content-length'), false);
    assert.equal(init?.redirect, 'manual');
    assert.equal(init?.cache, 'no-store');
    return Response.json({ ok: true });
  });
  assert.equal(calls, 1);
  assert.deepEqual(await response.json(), { ok: true });
});

test('default forwarding accepts the exact cap and empty POST bodies without an auth probe', async () => {
  for (const body of [new Uint8Array(DEFAULT_BODY_BYTES), undefined]) {
    let calls = 0;
    await forward(
      new Request('http://localhost/api/backend/auth/login', { method: 'POST', body }),
      ['auth', 'login'],
      async (url, init) => {
        calls++;
        assert.equal(String(url), `${BACKEND}/auth/login`);
        assert.ok(init?.body instanceof ArrayBuffer);
        assert.equal(init.body.byteLength, body?.byteLength ?? 0);
        return new Response(null, { status: 204 });
      },
    );
    assert.equal(calls, 1);
  }
});

test('default proxy cap rejects declared and chunked excess on every body-bearing method', async () => {
  for (const [method, path] of [
    ['POST', ['auth', 'login']],
    ['PUT', ['devices', 'id']],
    ['PATCH', ['places', 'id']],
    ['DELETE', ['account', 'sessions', 'id']],
    ['POST', ['routes', 'id', 'share-links']],
    ['POST', ['ai', 'other']],
  ] as const) {
    for (const declared of [true, false]) {
      const source = upload(
        method,
        declared ? [1] : [DEFAULT_BODY_BYTES, 1],
        declared ? { 'content-length': String(DEFAULT_BODY_BYTES + 1) } : {},
      );
      const budget = new UploadBudget();
      await assert.rejects(
        forward(
          source.request,
          [...path],
          async () => assert.fail('oversized default request reached Backend'),
          budget,
        ),
        RangeError,
      );
      assert.equal(source.cancelled(), true);
      assert.equal(source.readers(), declared ? 0 : 1);
      assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
    }
  }
});

test('GET and HEAD forward without a body, authentication probe or upload admission', async () => {
  for (const method of ['GET', 'HEAD']) {
    const request = new Request('http://localhost/api/backend/routes', { method });
    Object.defineProperty(request, 'arrayBuffer', {
      value: () => assert.fail('bodyless method read its body'),
    });
    let calls = 0;
    await forward(
      request,
      ['routes'],
      async (_url, init) => {
        calls++;
        assert.equal(init?.method, method);
        assert.equal(init?.body, undefined);
        return new Response(null, { status: 204 });
      },
      new UploadBudget(0, 0),
    );
    assert.equal(calls, 1);
  }
});

test('route and assistant selections authenticate before readers and retain larger limits', async () => {
  for (const [method, path, limit] of [
    ['POST', ['routes'], ROUTE_WRITE_BODY_BYTES],
    ['PATCH', ['routes', 'id'], ROUTE_WRITE_BODY_BYTES],
    ['POST', ['ai', 'route-assistant', 'runs'], ASSISTANT_BODY_BYTES],
  ] as const) {
    const anonymous = upload(method, [1]);
    await assert.rejects(
      forward(anonymous.request, [...path], async () => assert.fail('anonymous upload probed')),
      (error) => error instanceof ProxyAuthenticationError && error.status === 401,
    );
    assert.equal(anonymous.readers(), 0);
    assert.equal(anonymous.cancelled(), true);

    const rejected = upload(method, [1], { Authorization: 'Bearer expired' });
    await assert.rejects(
      forward(rejected.request, [...path], async (url, init) => {
        assert.equal(String(url), `${BACKEND}/auth/session`);
        assert.equal(init?.body, undefined);
        assert.equal(rejected.readers(), 0);
        return new Response(null, { status: 401 });
      }),
      (error) => error instanceof ProxyAuthenticationError && error.status === 401,
    );
    assert.equal(rejected.readers(), 0);
    assert.equal(rejected.cancelled(), true);

    const allowed = new Request('http://localhost/api/backend/upload', {
      method,
      headers: { Authorization: 'Bearer valid' },
      body: new Uint8Array(limit),
    });
    let calls = 0;
    await forward(allowed, [...path], async (url, init) => {
      calls++;
      if (calls === 1) {
        assert.equal(String(url), `${BACKEND}/auth/session`);
        assert.equal(allowed.bodyUsed, false);
        return new Response(null, { status: 204 });
      }
      assert.equal(String(url), `${BACKEND}/${path.join('/')}`);
      assert.ok(init?.body instanceof ArrayBuffer);
      assert.equal(init.body.byteLength, limit);
      return new Response(null, { status: 204 });
    });
    assert.equal(calls, 2);

    const excessive = upload(method, [limit, 1], { Authorization: 'Bearer valid' });
    let probes = 0;
    await assert.rejects(
      forward(excessive.request, [...path], async (url) => {
        probes++;
        assert.equal(String(url), `${BACKEND}/auth/session`);
        return new Response(null, { status: 204 });
      }),
      RangeError,
    );
    assert.equal(probes, 1);
    assert.equal(excessive.cancelled(), true);
  }
});

test('default uploads use the reception deadline and release admission on timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const budget = new UploadBudget();
  const source = upload('POST', []);
  const result = forward(
    source.request,
    ['auth', 'login'],
    async () => assert.fail('stalled body reached Backend'),
    budget,
  );
  const rejected = assert.rejects(
    result,
    (error) => error instanceof UploadError && error.kind === 'timeout',
  );
  await turn();
  assert.deepEqual(budget.usage, { bytes: 0, requests: 1 });
  t.mock.timers.tick(UPLOAD_DEADLINE_MS);
  await rejected;
  assert.equal(source.cancelled(), true);
  assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
});

test('default and larger uploads share admission while forwarded bodies remain accounted', async () => {
  const budget = new UploadBudget(DEFAULT_BODY_BYTES, 1);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const first = forward(
    new Request('http://localhost/upload', { method: 'POST', body: 'login' }),
    ['auth', 'login'],
    async () => {
      await pending;
      return new Response(null, { status: 204 });
    },
    budget,
  );
  await turn();
  assert.deepEqual(budget.usage, { bytes: 5, requests: 1 });
  const second = upload('PATCH', [], { Authorization: 'Bearer valid' });
  try {
    await assert.rejects(
      forward(
        second.request,
        ['routes', 'id'],
        async () => assert.fail('busy upload reached Backend'),
        budget,
      ),
      (error) => error instanceof UploadError && error.kind === 'busy',
    );
    assert.equal(second.readers(), 0);
    assert.equal(second.cancelled(), true);
    assert.deepEqual(budget.usage, { bytes: 5, requests: 1 });
  } finally {
    finish();
    await first;
  }
  assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
});
