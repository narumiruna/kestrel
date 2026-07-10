import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DevicePlatform } from '@prisma/client';
import { AccountSecurityService } from './account-security.service';

describe('AccountSecurityService', () => {
  const now = new Date('2026-07-10T12:00:00.000Z');
  let authService: { confirmCurrentPassword: jest.Mock };
  let auditService: { log: jest.Mock };
  let prisma: {
    device: { findFirst: jest.Mock };
    session: { findFirst: jest.Mock; findMany: jest.Mock };
  };
  let revocationService: {
    revokeDevice: jest.Mock;
    revokeSessions: jest.Mock;
  };
  let service: AccountSecurityService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    authService = {
      confirmCurrentPassword: jest.fn().mockResolvedValue(undefined),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      device: { findFirst: jest.fn() },
      session: { findFirst: jest.fn(), findMany: jest.fn() },
    };
    revocationService = {
      revokeDevice: jest.fn().mockResolvedValue({ devicesRevoked: 1 }),
      revokeSessions: jest.fn().mockResolvedValue({ sessionsRevoked: 1 }),
    };
    service = new AccountSecurityService(
      authService as never,
      auditService as never,
      prisma as never,
      revocationService as never,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('lists only active owner sessions and marks the current session', async () => {
    prisma.session.findMany.mockResolvedValue([
      sessionRecord({ id: 'session-current' }),
      sessionRecord({
        id: 'session-android',
        ipAddress: '203.0.113.7',
        userAgent: 'Kestrel Android',
      }),
    ]);

    const result = await service.listSessions('user-1', 'session-current');

    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          expiresAt: { gt: now },
          revokedAt: null,
          userId: 'user-1',
        },
      }),
    );
    expect(result.sessions).toEqual([
      expect.objectContaining({ id: 'session-current', isCurrent: true }),
      expect.objectContaining({
        id: 'session-android',
        ipAddress: '203.0.113.7',
        isCurrent: false,
        userAgent: 'Kestrel Android',
      }),
    ]);
  });

  it('revokes the current session without password step-up', async () => {
    prisma.session.findFirst.mockResolvedValue(
      sessionRecord({ id: 'session-current' }),
    );

    const result = await service.revokeSession(
      'user-1',
      'session-current',
      'session-current',
      {},
    );

    expect(authService.confirmCurrentPassword).not.toHaveBeenCalled();
    expect(revocationService.revokeSessions).toHaveBeenCalledWith(
      'user-1',
      ['session-current'],
      now,
    );
    expect(result.session).toEqual({
      id: 'session-current',
      isCurrent: true,
      revokedAt: now,
    });
  });

  it('requires the current password before revoking another session', async () => {
    prisma.session.findFirst.mockResolvedValue(
      sessionRecord({ id: 'session-2' }),
    );

    await service.revokeSession('user-1', 'session-current', 'session-2', {
      currentPassword: 'admin',
    });

    expect(authService.confirmCurrentPassword).toHaveBeenCalledWith(
      'user-1',
      'admin',
    );
    expect(revocationService.revokeSessions).toHaveBeenCalledWith(
      'user-1',
      ['session-2'],
      now,
    );
  });

  it('does not reveal or revoke a foreign session', async () => {
    prisma.session.findFirst.mockResolvedValue(null);

    await expect(
      service.revokeSession('user-1', 'session-current', 'foreign-session', {
        currentPassword: 'correct password',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(authService.confirmCurrentPassword).not.toHaveBeenCalled();
    expect(revocationService.revokeSessions).not.toHaveBeenCalled();
  });

  it('revokes all active sessions except the current one after step-up', async () => {
    prisma.session.findMany.mockResolvedValue([
      { id: 'session-2' },
      { id: 'session-3' },
    ]);

    const result = await service.revokeOtherSessions(
      'user-1',
      'session-current',
      { currentPassword: 'admin' },
    );

    expect(authService.confirmCurrentPassword).toHaveBeenCalledWith(
      'user-1',
      'admin',
    );
    expect(revocationService.revokeSessions).toHaveBeenCalledWith(
      'user-1',
      ['session-2', 'session-3'],
      now,
    );
    expect(result.revokedSessionIds).toEqual(['session-2', 'session-3']);
  });

  it('revokes an owned Android device and its linked session after step-up', async () => {
    prisma.device.findFirst.mockResolvedValue({
      id: 'device-1',
      name: 'Pixel',
      platform: DevicePlatform.ANDROID,
      revokedAt: null,
    });

    const result = await service.revokeDevice(
      'user-1',
      'session-current',
      'device-1',
      {
        currentPassword: 'admin',
      },
    );

    expect(authService.confirmCurrentPassword).toHaveBeenCalledWith(
      'user-1',
      'admin',
    );
    expect(revocationService.revokeDevice).toHaveBeenCalledWith(
      'user-1',
      'device-1',
      now,
    );
    expect(result.device).toEqual({
      id: 'device-1',
      name: 'Pixel',
      revokedAt: now,
    });
  });

  it('propagates failed password step-up without revoking', async () => {
    prisma.session.findFirst.mockResolvedValue(
      sessionRecord({ id: 'session-2' }),
    );
    authService.confirmCurrentPassword.mockRejectedValue(
      new UnauthorizedException('invalid current password'),
    );

    await expect(
      service.revokeSession('user-1', 'session-current', 'session-2', {
        currentPassword: 'wrong',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(revocationService.revokeSessions).not.toHaveBeenCalled();
  });
});

function sessionRecord(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    expiresAt: new Date('2026-08-01T10:00:00.000Z'),
    id: 'session-1',
    ipAddress: null,
    lastUsedAt: new Date('2026-07-09T10:00:00.000Z'),
    revokedAt: null,
    userAgent: null,
    ...overrides,
  };
}
