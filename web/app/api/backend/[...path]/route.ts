import type { NextRequest } from 'next/server';

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
  const backendUrl = new URL(path.join('/'), normalizedApiBaseUrl());
  backendUrl.search = url.search;

  const response = await fetch(backendUrl, {
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer(),
    headers: createForwardHeaders(request.headers),
    method: request.method,
    redirect: 'manual',
  });

  return new Response(response.body, {
    headers: createResponseHeaders(response.headers),
    status: response.status,
    statusText: response.statusText,
  });
}

function normalizedApiBaseUrl(): string {
  return API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
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
