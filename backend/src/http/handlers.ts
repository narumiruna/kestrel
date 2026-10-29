import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppContext, AuthVariables } from '../auth/auth-request';
import type { SessionAuth } from '../auth/session-auth.middleware';
import { UploadError, withBoundedUpload } from './bounded-upload';
import { createLogger } from '../logger';
import { ROUTE_ASSISTANT_LIMITS } from '../route-assistant/route-assistant.models';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
  TooManyRequestsException,
  UnauthorizedException,
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

/** Larger uploads are authenticated before any body read or owned allocation. */
export function createBodyLimit(sessionAuth: SessionAuth): SessionAuth {
  return async (context, next) => {
    const method = context.req.method,
      path = context.req.path;
    const limit =
      method === 'POST' && path === '/ai/route-assistant/runs'
        ? ROUTE_ASSISTANT_LIMITS.bodyBytes
        : (method === 'POST' && path === '/routes') ||
            (method === 'PATCH' && /^\/routes\/[^/]+$/.test(path))
          ? ROUTE_WRITE_BODY_BYTES
          : null;
    if (limit === null) return defaultBodyLimit(context, next);
    try {
      await withBoundedUpload(
        context.req.raw,
        limit,
        async () => {
          let authenticated = false;
          await sessionAuth(context, () => {
            authenticated = true;
            return Promise.resolve();
          });
          if (!authenticated)
            throw new UnauthorizedException('missing authenticated session');
        },
        async (body) => {
          context.req.raw = new Request(context.req.raw, { body });
          await next();
        },
      );
    } catch (error) {
      if (error instanceof UploadError) {
        if (error.kind === 'busy')
          throw new TooManyRequestsException({
            code: 'UPLOAD_BUSY',
            message: 'Upload capacity reached',
          });
        throw new HttpException(
          { code: 'UPLOAD_TIMEOUT', message: 'Upload deadline exceeded' },
          408,
        );
      }
      if (error instanceof RangeError)
        throw new PayloadTooLargeException('request entity too large');
      if (error instanceof Error && error.name === 'AbortError')
        throw new BadRequestException('Upload cancelled');
      throw error;
    }
  };
}

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
