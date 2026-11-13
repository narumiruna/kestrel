import { type UploadBudget, withBoundedUpload } from './boundedUpload.ts';

export const DEFAULT_BODY_BYTES = 100 * 1024;
export const ASSISTANT_BODY_BYTES = 4 * 1024 * 1024;
export const ROUTE_WRITE_BODY_BYTES = 256 * 1024;

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export function proxyHeaders(headers: Headers): Headers {
  const forwarded = new Headers();
  for (const [name, value] of headers) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) forwarded.set(name, value);
  }
  return forwarded;
}

/** Every body-bearing method shares upload admission, storage and reception limits. */
export async function forwardProxyRequest(
  request: Request,
  base: string,
  path: string[],
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  budget?: UploadBudget,
): Promise<Response> {
  const backendUrl = backendRequestUrl(base, path, new URL(request.url).search);
  const forward = (body?: ArrayBuffer) =>
    fetcher(backendUrl, {
      body,
      headers: proxyHeaders(request.headers),
      method: request.method,
      redirect: 'manual',
      signal,
      cache: 'no-store',
    });
  if (request.method === 'GET' || request.method === 'HEAD') return forward();

  const assistant = request.method === 'POST' && path.join('/') === 'ai/route-assistant/runs';
  const routeWrite =
    (request.method === 'POST' && path.length === 1 && path[0] === 'routes') ||
    (request.method === 'PATCH' && path.length === 2 && path[0] === 'routes');
  const limit = assistant
    ? ASSISTANT_BODY_BYTES
    : routeWrite
      ? ROUTE_WRITE_BODY_BYTES
      : DEFAULT_BODY_BYTES;
  return withBoundedUpload(
    request,
    limit,
    async (uploadSignal) => {
      if (assistant || routeWrite)
        await authenticateProxyUpload(request, base, uploadSignal, fetcher);
    },
    forward,
    budget,
  );
}

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
