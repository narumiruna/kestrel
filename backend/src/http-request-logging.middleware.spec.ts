import { Hono } from 'hono';
import pino from 'pino';
import type { AuthVariables } from './auth/auth-request';
import { createHttpRequestLogging } from './http-request-logging.middleware';

describe('http request logging middleware', () => {
  let lines: string[];
  let logger: pino.Logger;

  beforeEach(() => {
    lines = [];
    logger = pino(
      {
        base: undefined,
        formatters: {
          level: (label) => ({ level: label }),
        },
      },
      {
        write: (line: string) => {
          lines.push(line);
        },
      },
    );
  });

  it('returns a request id and logs allowlisted request metadata only', async () => {
    const app = createTestApp(logger, '/sync/changes', 201);

    const response = await app.request('/sync/changes?cursor=secret-cursor', {
      headers: {
        authorization: 'Bearer secret-token',
        'x-request-id': 'request-from-client',
      },
      method: 'POST',
    });

    expect(response.headers.get('x-request-id')).toBe('request-from-client');
    expect(lines).toHaveLength(1);
    const serializedRecord = lines[0] ?? '';
    expect(JSON.parse(serializedRecord)).toMatchObject({
      event: 'http_request',
      level: 'info',
      method: 'POST',
      path: '/sync/changes',
      requestId: 'request-from-client',
      sessionId: 'session-1',
      statusCode: 201,
      userId: 'user-1',
    });
    expect(serializedRecord).not.toContain('secret-token');
    expect(serializedRecord).not.toContain('secret-cursor');
  });

  it('generates a safe request id and emits error-level records for 5xx', async () => {
    const app = createTestApp(logger, '/health', 503, false);

    const response = await app.request('/health', {
      headers: { 'x-request-id': 'invalid request id with spaces' },
    });

    const requestId = response.headers.get('x-request-id') ?? '';
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines).toHaveLength(1);
    const record: unknown = JSON.parse(lines[0] ?? '');
    expect(record).toMatchObject({
      event: 'http_error',
      level: 'error',
      method: 'GET',
      path: '/health',
      requestId,
      statusCode: 503,
    });
    expect(record).not.toHaveProperty('userId');
    expect(record).not.toHaveProperty('sessionId');
  });
});

function createTestApp(
  logger: pino.Logger,
  path: string,
  statusCode: 201 | 503,
  authenticated = true,
): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use('*', createHttpRequestLogging(logger));
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
