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

export class ProxyAuthenticationError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403) {
    super('Upload authentication failed');
    this.status = status;
  }
}

/** Validate the session without accepting or forwarding the caller's upload body. */
export async function authenticateProxyUpload(
  request: Request,
  base: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer \S+$/.test(authorization))
    throw new ProxyAuthenticationError(401);
  const response = await fetcher(backendRequestUrl(base, ['auth', 'session'], ''), {
    method: 'GET',
    headers: { Authorization: authorization },
    signal,
    redirect: 'manual',
    cache: 'no-store',
  });
  if (response.body) void response.body.cancel().catch(() => undefined);
  if (response.status === 401 || response.status === 403)
    throw new ProxyAuthenticationError(response.status);
  if (response.status !== 204) throw new Error('Backend authentication unavailable');
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
