import { Hono } from 'hono';
import type { AccessTokenService } from '../auth/access-token.service';
import type { AuthVariables } from '../auth/auth-request';
import {
  createSessionAuth,
  type SessionAuth,
} from '../auth/session-auth.middleware';
import type { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedException } from './errors';
import { createBodyLimit, handleError } from './handlers';
import { UPLOAD_DEADLINE_MS } from './bounded-upload';

function source(headers: Record<string, string> = {}) {
  let writer!: ReadableStreamDefaultController<Uint8Array>;
  const request = new Request('http://localhost/routes', {
    method: 'POST',
    headers,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        writer = controller;
      },
    }),
    duplex: 'half',
  } as RequestInit);
  const body = request.body;
  if (!body) throw new Error('fixture body');
  const getReader = body.getReader.bind(body);
  const reads = jest.fn(() => getReader());
  Object.defineProperty(body, 'getReader', { value: reads });
  return { request, reads, writer };
}
function setup() {
  const row = {
    userId: 'owner',
    expiresAt: new Date(Date.now() + 60000),
    revokedAt: null as Date | null,
  };
  const tokens = {
    verifyToken: jest.fn((token: string) => {
      if (token !== 'valid') throw new UnauthorizedException('invalid token');
      return {
        userId: 'owner',
        sessionId: 'session',
        expiresAt: row.expiresAt,
      };
    }),
  };
  const prisma = {
    session: { findUnique: jest.fn(() => Promise.resolve(row)) },
  };
  const auth = createSessionAuth(
    tokens as unknown as AccessTokenService,
    prisma as unknown as PrismaService,
  );
  return { row, tokens, prisma, auth };
}
function appFor(auth: SessionAuth) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const entered = jest.fn();
  app.use('*', createBodyLimit(auth));
  app.post('/routes', auth, (context) => {
    entered();
    return context.json({ ok: true });
  });
  app.onError(handleError);
  return { app, entered };
}

describe('large-upload authentication boundary', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it.each(['missing', 'invalid', 'revoked', 'expired'])(
    'rejects %s authentication before opening a body reader',
    async (kind) => {
      const h = setup();
      if (kind === 'revoked') h.row.revokedAt = new Date();
      if (kind === 'expired') h.row.expiresAt = new Date(0);
      const headers =
        kind === 'missing'
          ? {}
          : {
              Authorization:
                kind === 'invalid' ? 'Bearer invalid' : 'Bearer valid',
            };
      const upload = source(headers);
      const { app, entered } = appFor(h.auth);
      const response = await app.request(upload.request);
      expect(response.status).toBe(401);
      expect(upload.reads).not.toHaveBeenCalled();
      expect(entered).not.toHaveBeenCalled();
    },
  );

  it('rechecks revocation after reception instead of trusting preflight authentication', async () => {
    const h = setup();
    const upload = source({ Authorization: 'Bearer valid' });
    const { app, entered } = appFor(h.auth);
    const response = app.request(upload.request);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(h.tokens.verifyToken).toHaveBeenCalledTimes(1);
    h.row.revokedAt = new Date();
    upload.writer.enqueue(new TextEncoder().encode('{}'));
    upload.writer.close();
    expect((await response).status).toBe(401);
    expect(h.tokens.verifyToken).toHaveBeenCalledTimes(2);
    expect(entered).not.toHaveBeenCalled();
  });

  it('returns408 for stalled authentication without reading or late handler entry', async () => {
    jest.useFakeTimers();
    let finish!: () => void;
    const auth: SessionAuth = async (_context, next) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      await next();
    };
    const upload = source({ Authorization: 'Bearer valid' });
    const { app, entered } = appFor(auth);
    const response = app.request(upload.request);
    await jest.advanceTimersByTimeAsync(UPLOAD_DEADLINE_MS);
    expect((await response).status).toBe(408);
    expect(upload.reads).not.toHaveBeenCalled();
    finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(entered).not.toHaveBeenCalled();
  });

  it('returns408 for a stalled authenticated body and keeps normal successful routes usable', async () => {
    jest.useFakeTimers();
    const h = setup();
    const upload = source({ Authorization: 'Bearer valid' });
    const { app, entered } = appFor(h.auth);
    const response = app.request(upload.request);
    await jest.advanceTimersByTimeAsync(UPLOAD_DEADLINE_MS);
    expect((await response).status).toBe(408);
    expect(entered).not.toHaveBeenCalled();
    const result = await app.request('/routes', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: '{}',
    });
    expect(result.status).toBe(200);
    expect(entered).toHaveBeenCalledTimes(1);
  });
});
