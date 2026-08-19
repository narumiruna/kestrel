import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth/auth-request';
import { Logger } from './logger';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function createHttpRequestLogging(): MiddlewareHandler<{
  Variables: AuthVariables;
}> {
  const logger = new Logger('HttpRequest');

  return async (context, next) => {
    const startedAt = Date.now();
    const requestId = getRequestId(context.req.header('x-request-id'));
    context.header('x-request-id', requestId);

    await next();

    const statusCode = context.res.status;
    const isError = statusCode >= 500;
    const auth = context.get('auth');
    const record = JSON.stringify({
      durationMs: Date.now() - startedAt,
      event: isError ? 'http_error' : 'http_request',
      method: context.req.method,
      path: context.req.path,
      requestId,
      ...(auth == null
        ? {}
        : {
            sessionId: auth.sessionId,
            userId: auth.userId,
          }),
      statusCode,
    });

    if (isError) {
      logger.error(record);
    } else {
      logger.log(record);
    }
  };
}

function getRequestId(header: string | undefined): string {
  return header != null && REQUEST_ID_PATTERN.test(header)
    ? header
    : randomUUID();
}
