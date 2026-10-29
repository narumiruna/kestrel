export const ASSISTANT_BODY_BYTES = 4 * 1024 * 1024;
export const ROUTE_WRITE_BODY_BYTES = 256 * 1024;

/** Path parameters cannot replace the configured Backend authority or escape its prefix. */
export function backendRequestUrl(base: string, path: string[], search: string) {
  if (path.some((part) => part === '.' || part === '..')) throw new URIError('invalid path');
  const url = new URL(base.endsWith('/') ? base : `${base}/`);
  url.pathname += path.map(encodeURIComponent).join('/');
  url.search = search;
  return url;
}

/** Count actual chunks before buffering; Content-Length is only an early rejection. */
export async function boundedProxyBody(request: Request, limit = ASSISTANT_BODY_BYTES) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new RangeError('body limit');
  request.signal.throwIfAborted();
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const body = new Uint8Array(limit);
  let total = 0;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  request.signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      request.signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      const end = total + next.value.byteLength;
      if (end > limit) {
        void reader.cancel().catch(() => undefined);
        throw new RangeError('body limit');
      }
      body.set(next.value, total);
      total = end;
    }
    request.signal.throwIfAborted();
    return body.buffer.slice(0, total);
  } finally {
    request.signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

/** Downstream stream cancellation explicitly aborts the Backend fetch, not just its reader. */
export function proxyResponseBody(
  body: ReadableStream<Uint8Array>,
  upstream: AbortController,
  cleanup: () => void,
) {
  const reader = body.getReader();
  let ended = false;
  const finish = () => {
    if (!ended) {
      ended = true;
      cleanup();
      reader.releaseLock();
    }
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          controller.close();
          finish();
        } else controller.enqueue(next.value);
      } catch {
        controller.error(new Error('Backend stream unavailable'));
        finish();
      }
    },
    async cancel(reason) {
      upstream.abort(reason);
      try {
        await reader.cancel(reason);
      } finally {
        finish();
      }
    },
  });
}
