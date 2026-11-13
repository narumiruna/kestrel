import type { NextRequest } from 'next/server';
import {
  forwardProxyRequest,
  ProxyAuthenticationError,
  proxyHeaders,
  proxyResponseBody,
} from '../../../../lib/backendProxy';

import { UploadError } from '../../../../lib/boundedUpload';

const API_BASE_URL = process.env.KESTREL_API_BASE_URL ?? 'http://localhost:3300';

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

  const controller = new AbortController();
  const abort = () => controller.abort();
  const cleanup = () => request.signal.removeEventListener('abort', abort);
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) controller.abort();
  try {
    const response = await forwardProxyRequest(request, API_BASE_URL, path, controller.signal);
    if (!response.body) cleanup();
    return new Response(
      response.body ? proxyResponseBody(response.body, controller, cleanup) : null,
      {
        headers: proxyHeaders(response.headers),
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
