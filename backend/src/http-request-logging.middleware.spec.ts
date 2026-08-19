import { Hono } from 'hono';
import type { AuthVariables } from './auth/auth-request';
import { createHttpRequestLogging } from './http-request-logging.middleware';
import { Logger } from './logger';

describe('http request logging middleware', () => {
  let loggedRecords: string[];
  let errorRecords: string[];

  beforeEach(() => {
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

  it('returns a request id and logs allowlisted request metadata only', async () => {
    const app = createTestApp('/sync/changes', 201);

    const response = await app.request('/sync/changes?cursor=secret-cursor', {
      headers: {
        authorization: 'Bearer secret-token',
        'x-request-id': 'request-from-client',
      },
      method: 'POST',
    });

    expect(response.headers.get('x-request-id')).toBe('request-from-client');
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

  it('generates a safe request id and emits error-level records for 5xx', async () => {
    const app = createTestApp('/health', 503, false);

    const response = await app.request('/health', {
      headers: { 'x-request-id': 'invalid request id with spaces' },
    });

    const requestId = response.headers.get('x-request-id') ?? '';
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

function createTestApp(
  path: string,
  statusCode: 201 | 503,
  authenticated = true,
): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use('*', createHttpRequestLogging());
  app.all(path, (context) => {
    if (authenticated) {
      context.set('auth', {
        expiresAt: new Date('2026-05-09T18:00:00.000Z'),
        sessionId: 'session-1',
        userId: 'user-1',
      });
    }

    return context.json({}, statusCode);
  });

  return app;
}
