import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from './auth/auth-request';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

@Injectable()
export class HttpRequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  use(
    request: AuthenticatedRequest & Request,
    response: Response,
    next: NextFunction,
  ): void {
    const startedAt = Date.now();
    const requestId = getRequestId(request.headers['x-request-id']);
    response.setHeader('x-request-id', requestId);

    response.once('finish', () => {
      const isError = response.statusCode >= 500;
      const record = JSON.stringify({
        durationMs: Date.now() - startedAt,
        event: isError ? 'http_error' : 'http_request',
        method: request.method,
        path: request.originalUrl.split('?')[0] ?? request.originalUrl,
        requestId,
        ...(request.auth == null
          ? {}
          : {
              sessionId: request.auth.sessionId,
              userId: request.auth.userId,
            }),
        statusCode: response.statusCode,
      });

      if (isError) {
        this.logger.error(record);
      } else {
        this.logger.log(record);
      }
    });

    next();
  }
}

function getRequestId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;

  return candidate != null && REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : randomUUID();
}
