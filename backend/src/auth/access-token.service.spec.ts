import { UnauthorizedException } from '../http/errors';
import { ConfigService } from '../config.service';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  let accessTokenService: AccessTokenService;

  beforeEach(() => {
    accessTokenService = new AccessTokenService({
      get: jest.fn((key: string) => {
        switch (key) {
          case 'AUTH_ACCESS_TOKEN_SECRET':
            return 'test-access-token-secret';
          case 'AUTH_ACCESS_TOKEN_TTL_SECONDS':
            return '900';
          default:
            return undefined;
        }
      }),
    } as unknown as ConfigService);
  });

  it('issues and verifies a signed short-lived access token', () => {
    const issuedAt = new Date('2026-05-09T16:00:00.000Z');
    const token = accessTokenService.issueToken(
      {
        sessionId: 'session-1',
        userId: 'user-1',
      },
      issuedAt,
    );

    expect(token.expiresAt).toEqual(new Date('2026-05-09T16:15:00.000Z'));
    expect(accessTokenService.verifyToken(token.token, issuedAt)).toEqual({
      expiresAt: new Date('2026-05-09T16:15:00.000Z'),
      sessionId: 'session-1',
      userId: 'user-1',
    });
  });

  it('rejects expired access tokens', () => {
    const token = accessTokenService.issueToken(
      {
        sessionId: 'session-1',
        userId: 'user-1',
      },
      new Date('2026-05-09T16:00:00.000Z'),
    );

    expect(() =>
      accessTokenService.verifyToken(
        token.token,
        new Date('2026-05-09T16:16:00.000Z'),
      ),
    ).toThrow(UnauthorizedException);
  });
});
