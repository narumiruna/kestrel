import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppContext, AuthVariables } from '../auth/auth-request';
import { createLogger } from '../logger';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
} from './errors';

const logger = createLogger('HttpException');

// Matches the request body limit the previous express.json() default enforced.
const MAX_BODY_BYTES = 100 * 1024;

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
export const enforceBodyLimit = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: () => {
    throw new PayloadTooLargeException('request entity too large');
  },
});

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
