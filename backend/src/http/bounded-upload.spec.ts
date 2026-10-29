import {
  UPLOAD_DEADLINE_MS,
  UploadBudget,
  UploadError,
  withBoundedUpload,
} from './bounded-upload';

function pendingBody(signal?: AbortSignal, bytes = 0) {
  let cancelled = false;
  let readers = 0;
  const request = new Request('http://localhost/upload', {
    method: 'POST',
    signal,
    headers: { 'content-length': '1' },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        if (bytes) controller.enqueue(new Uint8Array(bytes));
      },
      cancel() {
        cancelled = true;
      },
    }),
    duplex: 'half',
  } as RequestInit);
  const body = request.body;
  if (!body) throw new Error('fixture body');
  const getReader = body.getReader.bind(body);
  Object.defineProperty(body, 'getReader', {
    value: () => {
      readers++;
      return getReader();
    },
  });
  return { request, readers: () => readers, cancelled: () => cancelled };
}
const authenticated = () => Promise.resolve();
const consume = (body: ArrayBuffer) => Promise.resolve(body);
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('bounded authenticated upload ownership', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not read or allocate a body when authentication fails', async () => {
    const source = pendingBody();
    const budget = new UploadBudget();
    await expect(
      withBoundedUpload(
        source.request,
        4 * 1024 * 1024,
        () => Promise.reject(new Error('unauthorized')),
        consume,
        budget,
      ),
    ).rejects.toThrow('unauthorized');
    expect(source.readers()).toBe(0);
    expect(source.cancelled()).toBe(true);
    expect(budget.usage).toEqual({ bytes: 0, requests: 0 });
  });

  it('bounds32 stalled uploads without max-sized allocations', async () => {
    const budget = new UploadBudget();
    const before = process.memoryUsage().arrayBuffers;
    const controllers = Array.from({ length: 32 }, () => new AbortController());
    const sources = controllers.map((controller) =>
      pendingBody(controller.signal, 1),
    );
    const results = Promise.allSettled(
      sources.map((source) =>
        withBoundedUpload(
          source.request,
          4 * 1024 * 1024,
          authenticated,
          consume,
          budget,
        ),
      ),
    );
    await turn();
    expect(budget.usage).toEqual({ bytes: 16 * 1024, requests: 16 });
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(
      2 * 1024 * 1024,
    );
    controllers.forEach((controller) => {
      controller.abort();
    });
    const settled = await results;
    expect(
      settled.filter(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof UploadError &&
          result.reason.kind === 'busy',
      ),
    ).toHaveLength(16);
    expect(budget.usage).toEqual({ bytes: 0, requests: 0 });
    expect(sources.every((source) => source.cancelled())).toBe(true);
  });

  it('expires stalled reception even with a misleading small Content-Length', async () => {
    jest.useFakeTimers();
    const budget = new UploadBudget();
    const source = pendingBody();
    const rejected = expect(
      withBoundedUpload(
        source.request,
        4 * 1024 * 1024,
        authenticated,
        consume,
        budget,
      ),
    ).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(0);
    expect(budget.usage).toEqual({ bytes: 0, requests: 1 });
    await jest.advanceTimersByTimeAsync(UPLOAD_DEADLINE_MS);
    await rejected;
    expect(source.cancelled()).toBe(true);
    expect(budget.usage).toEqual({ bytes: 0, requests: 0 });
  });

  it('bounds pending authentication and cannot forward after a late completion', async () => {
    jest.useFakeTimers();
    const budget = new UploadBudget();
    const source = pendingBody();
    let finish!: () => void;
    const auth = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const forward = jest.fn(consume);
    const rejected = expect(
      withBoundedUpload(source.request, 100, () => auth, forward, budget),
    ).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(UPLOAD_DEADLINE_MS);
    await rejected;
    finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(source.readers()).toBe(0);
    expect(forward).not.toHaveBeenCalled();
    expect(budget.usage).toEqual({ bytes: 0, requests: 0 });
  });

  it('does not extend the deadline when more bytes arrive', async () => {
    jest.useFakeTimers();
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
    const rejected = expect(
      withBoundedUpload(request, 100, authenticated, consume, budget),
    ).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(UPLOAD_DEADLINE_MS - 1);
    writer.enqueue(new Uint8Array(1));
    await jest.advanceTimersByTimeAsync(1);
    await rejected;
    expect(budget.usage).toEqual({ bytes: 0, requests: 0 });
  });

  it('accounts for temporary growth/copy and recovers from exhaustion', async () => {
    for (const quota of [2500, 3072]) {
      const budget = new UploadBudget(quota, 2);
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
      await expect(
        withBoundedUpload(request, 4096, authenticated, consume, budget),
      ).rejects.toMatchObject({ kind: 'busy' });
      expect(budget.usage).toEqual({ bytes: 0, requests: 0 });
      const result = await withBoundedUpload(
        new Request('http://localhost/upload', { method: 'POST', body: 'ok' }),
        4096,
        authenticated,
        consume,
        budget,
      );
      expect(new TextDecoder().decode(result)).toBe('ok');
      expect(budget.usage).toEqual({ bytes: 0, requests: 0 });
    }
  });

  it('shares the byte ceiling across concurrent owners without leaking or stealing reservations', async () => {
    const budget = new UploadBudget(1500, 4);
    const controller = new AbortController();
    const stopped = expect(
      withBoundedUpload(
        pendingBody(controller.signal, 1).request,
        4096,
        authenticated,
        consume,
        budget,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await turn();
    expect(budget.usage).toEqual({ bytes: 1024, requests: 1 });
    await expect(
      withBoundedUpload(
        new Request('http://localhost/upload', {
          method: 'POST',
          body: 'second',
        }),
        4096,
        authenticated,
        consume,
        budget,
      ),
    ).rejects.toMatchObject({ kind: 'busy' });
    expect(budget.usage).toEqual({ bytes: 1024, requests: 1 });
    controller.abort();
    await stopped;
    expect(budget.usage).toEqual({ bytes: 0, requests: 0 });
  });

  it('keeps bytes charged during processing without shortening inference to the upload timeout', async () => {
    jest.useFakeTimers();
    const budget = new UploadBudget();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const result = withBoundedUpload(
      new Request('http://localhost/upload', { method: 'POST', body: 'hello' }),
      100,
      authenticated,
      () => gate,
      budget,
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(budget.usage).toEqual({ bytes: 5, requests: 1 });
    await jest.advanceTimersByTimeAsync(UPLOAD_DEADLINE_MS + 1);
    expect(budget.usage.requests).toBe(1);
    finish();
    await result;
    expect(budget.usage).toEqual({ bytes: 0, requests: 0 });
  });

  it('does not wait for a stalled cancel promise and releases failed handlers', async () => {
    const controller = new AbortController();
    const budget = new UploadBudget();
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      signal: controller.signal,
      body: new ReadableStream({ cancel: () => new Promise(() => {}) }),
      duplex: 'half',
    } as RequestInit);
    const rejected = expect(
      withBoundedUpload(request, 100, authenticated, consume, budget),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await turn();
    controller.abort();
    await rejected;
    expect(budget.usage).toEqual({ bytes: 0, requests: 0 });
    await expect(
      withBoundedUpload(
        new Request('http://localhost/upload', {
          method: 'POST',
          body: 'valid',
        }),
        100,
        authenticated,
        () => Promise.reject(new Error('handler failed')),
        budget,
      ),
    ).rejects.toThrow('handler failed');
    expect(budget.usage).toEqual({ bytes: 0, requests: 0 });
  });
});
