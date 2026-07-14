import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { HttpRequestLoggingMiddleware } from './http-request-logging.middleware';

type TestResponse = EventEmitter & {
  setHeader: jest.Mock<void, [string, string]>;
  statusCode: number;
};

describe('HttpRequestLoggingMiddleware', () => {
  let middleware: HttpRequestLoggingMiddleware;
  let loggedRecords: string[];
  let errorRecords: string[];

  beforeEach(() => {
    middleware = new HttpRequestLoggingMiddleware();
    loggedRecords = [];
    errorRecords = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((message) => {
      loggedRecords.push(String(message));
    });
    jest.spyOn(Logger.prototype, 'error').mockImplementation((message) => {
      errorRecords.push(String(message));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a request id and logs allowlisted request metadata only', () => {
    const request = {
      auth: {
        sessionId: 'session-1',
        userId: 'user-1',
      },
      headers: {
        authorization: 'Bearer secret-token',
        'x-request-id': 'request-from-client',
      },
      method: 'POST',
      originalUrl: '/sync/changes?cursor=secret-cursor',
    } as unknown as Request;
    const response = createResponse(201);
    const next = jest.fn();

    middleware.use(request, response as unknown as Response, next);
    response.emit('finish');

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      'request-from-client',
    );
    expect(loggedRecords).toHaveLength(1);
    const serializedRecord = loggedRecords[0] ?? '';
    expect(JSON.parse(serializedRecord)).toMatchObject({
      event: 'http_request',
      method: 'POST',
      path: '/sync/changes',
      requestId: 'request-from-client',
      sessionId: 'session-1',
      statusCode: 201,
      userId: 'user-1',
    });
    expect(serializedRecord).not.toContain('secret-token');
    expect(serializedRecord).not.toContain('secret-cursor');
    expect(errorRecords).toHaveLength(0);
  });

  it('generates a safe request id and emits error-level records for 5xx', () => {
    const request = {
      headers: {
        'x-request-id': 'invalid request id with spaces',
      },
      method: 'GET',
      originalUrl: '/health',
    } as unknown as Request;
    const response = createResponse(503);
    const responseHeaders = new Map<string, string>();
    response.setHeader.mockImplementation((name, value) => {
      responseHeaders.set(name, value);
    });

    middleware.use(request, response as unknown as Response, jest.fn());
    response.emit('finish');

    const requestId = responseHeaders.get('x-request-id') ?? '';
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(errorRecords).toHaveLength(1);
    expect(loggedRecords).toHaveLength(0);
    expect(JSON.parse(errorRecords[0] ?? '')).toMatchObject({
      event: 'http_error',
      method: 'GET',
      path: '/health',
      requestId,
      statusCode: 503,
    });
  });
});

function createResponse(statusCode: number): TestResponse {
  return Object.assign(new EventEmitter(), {
    setHeader: jest.fn<void, [string, string]>(),
    statusCode,
  });
}
