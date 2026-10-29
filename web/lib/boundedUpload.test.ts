import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as turn } from 'node:timers/promises';
import {
  UPLOAD_DEADLINE_MS,
  UploadBudget,
  UploadError,
  withBoundedUpload,
} from './boundedUpload.ts';

function pendingBody(signal?: AbortSignal, bytes = 0) {
  let cancelled = false;
  let readers = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (bytes) controller.enqueue(new Uint8Array(bytes));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request('http://localhost/upload', {
    method: 'POST',
    body: stream,
    signal,
    headers: { 'content-length': '1' },
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
const authenticated = async () => undefined;
const consume = async (body: ArrayBuffer) => body;

test('authentication failure never opens a body reader or allocates an upload buffer', async () => {
  const source = pendingBody();
  const budget = new UploadBudget();
  await assert.rejects(
    withBoundedUpload(
      source.request,
      4 * 1024 * 1024,
      async () => {
        throw new Error('unauthorized');
      },
      consume,
      budget,
    ),
    /unauthorized/,
  );
  assert.equal(source.readers(), 0);
  assert.equal(source.cancelled(), true);
  assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
});

test('32 stalled uploads retain only incremental storage and exceed admission safely', async () => {
  const budget = new UploadBudget();
  const before = process.memoryUsage().arrayBuffers;
  const controllers = Array.from({ length: 32 }, () => new AbortController());
  const requests = controllers.map((controller) => pendingBody(controller.signal, 1));
  const results = Promise.allSettled(
    requests.map((source) =>
      withBoundedUpload(source.request, 4 * 1024 * 1024, authenticated, consume, budget),
    ),
  );
  await turn();
  assert.deepEqual(budget.usage, { bytes: 16 * 1024, requests: 16 });
  assert.ok(process.memoryUsage().arrayBuffers - before < 2 * 1024 * 1024);
  controllers.forEach((controller) => {
    controller.abort();
  });
  const settled = await results;
  assert.equal(
    settled.filter(
      (result) =>
        result.status === 'rejected' &&
        result.reason instanceof UploadError &&
        result.reason.kind === 'busy',
    ).length,
    16,
  );
  assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
  assert.ok(requests.every((source) => source.cancelled()));
});

test('a stalled empty body has no allocation and expires with capacity released', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const budget = new UploadBudget();
  const source = pendingBody();
  const result = withBoundedUpload(source.request, 4 * 1024 * 1024, authenticated, consume, budget);
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

test('pending authentication expires before body reads and cannot later forward a request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const budget = new UploadBudget();
  const source = pendingBody();
  let resolve!: () => void;
  let forwarded = 0;
  const auth = new Promise<void>((done) => {
    resolve = done;
  });
  const result = withBoundedUpload(
    source.request,
    100,
    () => auth,
    async () => {
      forwarded++;
    },
    budget,
  );
  const rejected = assert.rejects(
    result,
    (error) => error instanceof UploadError && error.kind === 'timeout',
  );
  await turn();
  t.mock.timers.tick(UPLOAD_DEADLINE_MS);
  await rejected;
  resolve();
  await turn();
  assert.equal(source.readers(), 0);
  assert.equal(forwarded, 0);
  assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
});

test('the upload deadline is absolute and is not extended by received bytes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let writer!: ReadableStreamDefaultController<Uint8Array>;
  const request = new Request('http://localhost/upload', {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        writer = controller;
      },
    }),
    duplex: 'half',
  } as RequestInit);
  const budget = new UploadBudget();
  const result = withBoundedUpload(request, 100, authenticated, consume, budget);
  const rejected = assert.rejects(
    result,
    (error) => error instanceof UploadError && error.kind === 'timeout',
  );
  await turn();
  t.mock.timers.tick(UPLOAD_DEADLINE_MS - 1);
  writer.enqueue(new Uint8Array(1));
  await turn();
  t.mock.timers.tick(1);
  await rejected;
  assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
});

test('temporary resize and exact-copy allocations share the global byte budget', async () => {
  const budget = new UploadBudget(3072, 2);
  const request = new Request('http://localhost/upload', {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1000));
        controller.enqueue(new Uint8Array(1000));
        controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit);
  await assert.rejects(
    withBoundedUpload(request, 4096, authenticated, consume, budget),
    (error) => error instanceof UploadError && error.kind === 'busy',
  );
  assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
  const result = await withBoundedUpload(
    new Request('http://localhost/upload', { method: 'POST', body: 'ok' }),
    4096,
    authenticated,
    consume,
    budget,
  );
  assert.equal(new TextDecoder().decode(result), 'ok');
  assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
});

test('concurrent bodies share the same byte ceiling without freeing another owner', async () => {
  const budget = new UploadBudget(1500, 4);
  const controller = new AbortController();
  const first = withBoundedUpload(
    pendingBody(controller.signal, 1).request,
    4096,
    authenticated,
    consume,
    budget,
  );
  const stopped = assert.rejects(first, { name: 'AbortError' });
  await turn();
  assert.deepEqual(budget.usage, { bytes: 1024, requests: 1 });
  await assert.rejects(
    withBoundedUpload(
      new Request('http://localhost/upload', { method: 'POST', body: 'second' }),
      4096,
      authenticated,
      consume,
      budget,
    ),
    (error) => error instanceof UploadError && error.kind === 'busy',
  );
  assert.deepEqual(budget.usage, { bytes: 1024, requests: 1 });
  controller.abort();
  await stopped;
  assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
});

test('owned bytes stay accounted while forwarding but upload timeout does not cut inference short', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const budget = new UploadBudget();
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const result = withBoundedUpload(
    new Request('http://localhost/upload', { method: 'POST', body: 'hello' }),
    100,
    authenticated,
    async (body) => {
      assert.equal(new TextDecoder().decode(body), 'hello');
      await gate;
    },
    budget,
  );
  await turn();
  assert.deepEqual(budget.usage, { bytes: 5, requests: 1 });
  t.mock.timers.tick(UPLOAD_DEADLINE_MS + 1);
  assert.deepEqual(budget.usage, { bytes: 5, requests: 1 });
  finish();
  await result;
  assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
});

test('abort and forwarding failures release capacity even when source cancellation stalls', async () => {
  const controller = new AbortController();
  const budget = new UploadBudget();
  const request = new Request('http://localhost/upload', {
    method: 'POST',
    signal: controller.signal,
    body: new ReadableStream({ cancel: () => new Promise(() => {}) }),
    duplex: 'half',
  } as RequestInit);
  const result = withBoundedUpload(request, 100, authenticated, consume, budget);
  const rejected = assert.rejects(result, { name: 'AbortError' });
  await turn();
  controller.abort();
  await rejected;
  assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
  await assert.rejects(
    withBoundedUpload(
      new Request('http://localhost/upload', { method: 'POST', body: 'valid' }),
      100,
      authenticated,
      async () => {
        throw new Error('forward failed');
      },
      budget,
    ),
    /forward failed/,
  );
  assert.deepEqual(budget.usage, { bytes: 0, requests: 0 });
});
