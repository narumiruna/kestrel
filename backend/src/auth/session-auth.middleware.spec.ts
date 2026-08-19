import { Hono } from 'hono';
import { handleError } from '../http/handlers';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenService } from './access-token.service';
import type { AuthVariables } from './auth-request';
import { createSessionAuth } from './session-auth.middleware';

const CLAIMS = {
  expiresAt: new Date('2026-05-09T18:00:00.000Z'),
  sessionId: 'session-1',
  userId: 'user-1',
};

describe('session auth middleware', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-09T17:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts an active session and attaches claims to the context', async () => {
    const accessTokenService = {
      verifyToken: jest.fn().mockReturnValue(CLAIMS),
    };
    const prismaService = {
      session: {
        findUnique: jest.fn().mockResolvedValue({
          expiresAt: new Date('2026-05-09T18:00:00.000Z'),
          revokedAt: null,
          userId: 'user-1',
        }),
      },
    };
    const response = await createTestApp(
      accessTokenService,
      prismaService,
    ).request('/', {
      headers: { authorization: 'Bearer access-token' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      auth: {
        expiresAt: '2026-05-09T18:00:00.000Z',
        sessionId: 'session-1',
        userId: 'user-1',
      },
    });
    expect(accessTokenService.verifyToken).toHaveBeenCalledWith('access-token');
    expect(prismaService.session.findUnique).toHaveBeenCalledWith({
      select: {
        expiresAt: true,
        revokedAt: true,
        userId: true,
      },
      where: {
        id: 'session-1',
      },
    });
  });

  it('rejects revoked sessions', async () => {
    const accessTokenService = {
      verifyToken: jest.fn().mockReturnValue(CLAIMS),
    };
    const prismaService = {
      session: {
        findUnique: jest.fn().mockResolvedValue({
          expiresAt: new Date('2026-05-09T18:00:00.000Z'),
          revokedAt: new Date('2026-05-09T17:00:00.000Z'),
          userId: 'user-1',
        }),
      },
    };

    const response = await createTestApp(
      accessTokenService,
      prismaService,
    ).request('/', { headers: { authorization: 'Bearer access-token' } });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      message: 'session is no longer active',
    });
  });

  it('rejects a request without a bearer token', async () => {
    const app = createTestApp(
      { verifyToken: jest.fn() },
      { session: { findUnique: jest.fn() } },
    );

    const response = await app.request('/');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      message: 'missing bearer token',
    });
  });
});

function createTestApp(
  accessTokenService: object,
  prismaService: object,
): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use(
    '*',
    createSessionAuth(
      accessTokenService as AccessTokenService,
      prismaService as unknown as PrismaService,
    ),
  );
  app.get('/', (context) => context.json({ auth: context.get('auth') }));
  app.onError(handleError);

  return app;
}
