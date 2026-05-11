import { UnauthorizedException } from '@nestjs/common';
import { SessionAuthGuard } from './session-auth.guard';

describe('SessionAuthGuard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-09T17:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts an active session and attaches claims to the request', async () => {
    const request = {
      header: jest.fn().mockReturnValue('Bearer access-token'),
    };
    const accessTokenService = {
      verifyToken: jest.fn().mockReturnValue({
        expiresAt: new Date('2026-05-09T18:00:00.000Z'),
        sessionId: 'session-1',
        userId: 'user-1',
      }),
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
    const guard = new SessionAuthGuard(
      accessTokenService as never,
      prismaService as never,
    );

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).resolves.toBe(true);
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
    expect(request).toMatchObject({
      auth: {
        expiresAt: new Date('2026-05-09T18:00:00.000Z'),
        sessionId: 'session-1',
        userId: 'user-1',
      },
    });
  });

  it('rejects revoked sessions', async () => {
    const accessTokenService = {
      verifyToken: jest.fn().mockReturnValue({
        expiresAt: new Date('2026-05-09T18:00:00.000Z'),
        sessionId: 'session-1',
        userId: 'user-1',
      }),
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
    const guard = new SessionAuthGuard(
      accessTokenService as never,
      prismaService as never,
    );

    await expect(
      guard.canActivate(
        createExecutionContext({
          header: jest.fn().mockReturnValue('Bearer access-token'),
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});

function createExecutionContext(request: object) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}
