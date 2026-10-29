import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppContext, AuthVariables } from '../auth/auth-request';
import { createLogger } from '../logger';
import { ROUTE_ASSISTANT_LIMITS } from '../route-assistant/route-assistant.models';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
} from './errors';

const logger = createLogger('HttpException');

// Matches the request body limit the previous express.json() default enforced.
const MAX_BODY_BYTES = 100 * 1024;
const ROUTE_WRITE_BODY_BYTES = 256 * 1024;

export const handleError: ErrorHandler<{ Variables: AuthVariables }> = (
  error,
  context,
) => {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const response = error.getResponse();

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      logger.warn(
        {
          ...describeRequest(context),
          exception: error.name,
          reason: error.message,
          statusCode: status,
        },
        'request failed with a server-side http exception',
      );
    }

    return context.json(
      typeof response === 'string'
        ? { message: response, statusCode: status }
        : response,
      status as ContentfulStatusCode,
    );
  }

  logger.error(
    {
      ...describeRequest(context),
      err: error,
    },
    'unhandled request error',
  );

  return context.json(
    {
      message: 'Internal server error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
};

export const handleNotFound: NotFoundHandler = (context) =>
  context.json(
    {
      error: 'Not Found',
      message: `Cannot ${context.req.method} ${context.req.path}`,
      statusCode: HttpStatus.NOT_FOUND,
    },
    HttpStatus.NOT_FOUND,
  );

// Rejects oversized bodies while streaming, the way express.json() did.
const defaultBodyLimit = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: () => {
    throw new PayloadTooLargeException('request entity too large');
  },
});

// Hono's default shortcut trusts Content-Length. These larger payloads always
// count received chunks before JSON parsing, including a misleading length.
function boundedBodyLimit(maxSize: number): typeof defaultBodyLimit {
  return async (context, next) => {
    const request = context.req.raw;
    const declared = request.headers.get('content-length');
    const oversized = () =>
      new PayloadTooLargeException('request entity too large');
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxSize))
      throw oversized();
    if (!request.body) return next();
    const reader = request.body.getReader();
    const body = new Uint8Array(maxSize);
    let total = 0;
    const abort = () => {
      void reader.cancel().catch(() => undefined);
    };
    request.signal.addEventListener('abort', abort, { once: true });
    try {
      while (true) {
        request.signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        const end = total + chunk.value.byteLength;
        if (end > maxSize) {
          void reader.cancel().catch(() => undefined);
          throw oversized();
        }
        body.set(chunk.value, total);
        total = end;
      }
      request.signal.throwIfAborted();
    } finally {
      request.signal.removeEventListener('abort', abort);
      reader.releaseLock();
    }
    context.req.raw = new Request(request, { body: body.subarray(0, total) });
    return next();
  };
}
const assistantBodyLimit = boundedBodyLimit(ROUTE_ASSISTANT_LIMITS.bodyBytes);
const routeWriteBodyLimit = boundedBodyLimit(ROUTE_WRITE_BODY_BYTES);
export const enforceBodyLimit: typeof defaultBodyLimit = (context, next) => {
  if (
    context.req.method === 'POST' &&
    context.req.path === '/ai/route-assistant/runs'
  )
    return assistantBodyLimit(context, next);
  if (
    (context.req.method === 'POST' && context.req.path === '/routes') ||
    (context.req.method === 'PATCH' &&
      /^\/routes\/[^/]+$/.test(context.req.path))
  )
    return routeWriteBodyLimit(context, next);
  return defaultBodyLimit(context, next);
};

function describeRequest(context: AppContext): {
  method: string;
  path: string;
  requestId: string | undefined;
} {
  return {
    method: context.req.method,
    path: context.req.path,
    requestId: context.get('requestId'),
  };
}

export async function readJsonBody(context: Context): Promise<unknown> {
  const raw = await context.req.text();

  if (raw.trim() === '') {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestException('request body must be valid JSON');
  }
}
