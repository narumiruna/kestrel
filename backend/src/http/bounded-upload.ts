export const UPLOAD_DEADLINE_MS = 15_000;
export const UPLOAD_MAX_BYTES = 32 * 1024 * 1024;
export const UPLOAD_MAX_REQUESTS = 16;

export class UploadError extends Error {
  readonly kind: 'busy' | 'timeout';

  constructor(kind: 'busy' | 'timeout') {
    super(kind === 'busy' ? 'UPLOAD_BUSY' : 'UPLOAD_TIMEOUT');
    this.kind = kind;
  }
}

type Reservation = {
  reserve(bytes: number): void;
  releaseBytes(bytes: number): void;
  close(): void;
};

/** Accounts for owned buffers, including temporary growth and final copies. */
export class UploadBudget {
  private bytes = 0;
  private requests = 0;
  private readonly maxBytes: number;
  private readonly maxRequests: number;

  constructor(maxBytes = UPLOAD_MAX_BYTES, maxRequests = UPLOAD_MAX_REQUESTS) {
    this.maxBytes = maxBytes;
    this.maxRequests = maxRequests;
  }

  get usage() {
    return { bytes: this.bytes, requests: this.requests };
  }

  open(): Reservation {
    if (this.requests >= this.maxRequests) throw new UploadError('busy');
    this.requests++;
    let held = 0;
    let closed = false;
    return {
      reserve: (bytes) => {
        if (closed || this.bytes + bytes > this.maxBytes)
          throw new UploadError('busy');
        this.bytes += bytes;
        held += bytes;
      },
      releaseBytes: (bytes) => {
        if (closed || bytes > held)
          throw new Error('Invalid upload reservation');
        this.bytes -= bytes;
        held -= bytes;
      },
      close: () => {
        if (closed) return;
        closed = true;
        this.bytes -= held;
        this.requests--;
        held = 0;
      },
    };
  }
}

const uploads = new UploadBudget();

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Upload aborted', 'AbortError');
}

function untilAborted<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    operation.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error instanceof Error ? error : new Error('Upload failed'));
      },
    );
  });
}

async function readBody(
  request: Request,
  limit: number,
  signal: AbortSignal,
  reservation: Reservation,
  expiresAt: number,
): Promise<ArrayBuffer> {
  if (performance.now() >= expiresAt) throw new UploadError('timeout');
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit))
    throw new RangeError('body limit');
  signal.throwIfAborted();
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  let buffer = new Uint8Array(0);
  let length = 0;
  let complete = false;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (performance.now() >= expiresAt) throw new UploadError('timeout');
      const chunk = await untilAborted(reader.read(), signal);
      signal.throwIfAborted();
      if (performance.now() >= expiresAt) throw new UploadError('timeout');
      if (chunk.done) break;
      const end = length + chunk.value.byteLength;
      if (end > limit) throw new RangeError('body limit');
      if (end > buffer.byteLength) {
        const capacity = Math.min(
          limit,
          Math.max(1024, end, buffer.byteLength * 2),
        );
        reservation.reserve(capacity);
        const next = new Uint8Array(capacity);
        next.set(buffer.subarray(0, length));
        reservation.releaseBytes(buffer.byteLength);
        buffer = next;
      }
      buffer.set(chunk.value, length);
      length = end;
    }
    signal.throwIfAborted();
    let body: ArrayBuffer;
    if (length === buffer.byteLength) body = buffer.buffer;
    else {
      reservation.reserve(length);
      body = buffer.buffer.slice(0, length);
      reservation.releaseBytes(buffer.byteLength);
    }
    complete = true;
    return body;
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}

/** Authenticate before reading; the deadline covers auth and reception, not inference. */
export async function withBoundedUpload<T>(
  request: Request,
  limit: number,
  authenticate: (signal: AbortSignal) => Promise<unknown>,
  consume: (body: ArrayBuffer) => Promise<T>,
  budget = uploads,
): Promise<T> {
  let reservation: Reservation | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let received = false;
  try {
    reservation = budget.open();
    const deadline = new AbortController();
    const expiresAt = performance.now() + UPLOAD_DEADLINE_MS;
    timer = setTimeout(
      () => deadline.abort(new UploadError('timeout')),
      UPLOAD_DEADLINE_MS,
    );
    const signal = AbortSignal.any([request.signal, deadline.signal]);
    signal.throwIfAborted();
    await untilAborted(
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return authenticate(signal);
      }),
      signal,
    );
    signal.throwIfAborted();
    const body = await readBody(request, limit, signal, reservation, expiresAt);
    received = true;
    clearTimeout(timer);
    return await consume(body);
  } finally {
    clearTimeout(timer);
    reservation?.close();
    if (!received && request.body && !request.body.locked)
      void request.body.cancel().catch(() => undefined);
  }
}
