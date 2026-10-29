import type { NextRequest } from 'next/server';
import {
  ASSISTANT_BODY_BYTES,
  authenticateProxyUpload,
  backendRequestUrl,
  ProxyAuthenticationError,
  proxyResponseBody,
  ROUTE_WRITE_BODY_BYTES,
} from '../../../../lib/backendProxy';

import { UploadError, withBoundedUpload } from '../../../../lib/boundedUpload';

const API_BASE_URL = process.env.KESTREL_API_BASE_URL ?? 'http://localhost:3300';
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

export async function GET(request: NextRequest, context: RouteContext<'/api/backend/[...path]'>) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext<'/api/backend/[...path]'>) {
  return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext<'/api/backend/[...path]'>) {
  return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext<'/api/backend/[...path]'>) {
  return proxyRequest(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<'/api/backend/[...path]'>,
) {
  return proxyRequest(request, context);
}

async function proxyRequest(request: NextRequest, context: RouteContext<'/api/backend/[...path]'>) {
  const { path } = await context.params;
  const url = new URL(request.url);

  const controller = new AbortController();
  const abort = () => controller.abort();
  const cleanup = () => request.signal.removeEventListener('abort', abort);
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) controller.abort();
  try {
    const backendUrl = backendRequestUrl(API_BASE_URL, path, url.search);
    const assistant = request.method === 'POST' && path.join('/') === 'ai/route-assistant/runs';
    const routeWrite =
      (request.method === 'POST' && path.length === 1 && path[0] === 'routes') ||
      (request.method === 'PATCH' && path.length === 2 && path[0] === 'routes');
    const forward = (body?: ArrayBuffer) =>
      fetch(backendUrl, {
        body,
        headers: createForwardHeaders(request.headers),
        method: request.method,
        redirect: 'manual',
        signal: controller.signal,
        cache: 'no-store',
      });
    const limit = assistant ? ASSISTANT_BODY_BYTES : routeWrite ? ROUTE_WRITE_BODY_BYTES : null;
    const response =
      limit === null
        ? await forward(
            request.method === 'GET' || request.method === 'HEAD'
              ? undefined
              : await request.arrayBuffer(),
          )
        : await withBoundedUpload(
            request,
            limit,
            (signal) => authenticateProxyUpload(request, API_BASE_URL, signal),
            forward,
          );
    if (!response.body) cleanup();
    return new Response(
      response.body ? proxyResponseBody(response.body, controller, cleanup) : null,
      {
        headers: createResponseHeaders(response.headers),
        status: response.status,
        statusText: response.statusText,
      },
    );
  } catch (error) {
    controller.abort();
    cleanup();
    return Response.json(
      {
        code:
          error instanceof ProxyAuthenticationError
            ? error.status === 401
              ? 'UNAUTHORIZED'
              : 'FORBIDDEN'
            : error instanceof UploadError
              ? error.kind === 'timeout'
                ? 'UPLOAD_TIMEOUT'
                : 'UPLOAD_BUSY'
              : error instanceof RangeError
                ? path.join('/') === 'ai/route-assistant/runs'
                  ? 'RA_BODY_LIMIT'
                  : 'BODY_TOO_LARGE'
                : error instanceof URIError
                  ? 'INVALID_PATH'
                  : 'BACKEND_UNAVAILABLE',
      },
      {
        status:
          error instanceof ProxyAuthenticationError
            ? error.status
            : error instanceof UploadError
              ? error.kind === 'timeout'
                ? 408
                : 429
              : error instanceof RangeError
                ? 413
                : error instanceof URIError
                  ? 400
                  : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}

function createForwardHeaders(headers: Headers): Headers {
  const forwardedHeaders = new Headers();

  for (const [name, value] of headers) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      forwardedHeaders.set(name, value);
    }
  }

  return forwardedHeaders;
}

function createResponseHeaders(headers: Headers): Headers {
  const responseHeaders = new Headers();

  for (const [name, value] of headers) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      responseHeaders.set(name, value);
    }
  }

  return responseHeaders;
}
