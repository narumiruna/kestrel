import { UnauthorizedException } from '@nestjs/common';
import { getAuthenticatedSessionId, getRequestMetadata } from './auth-request';

describe('auth request helpers', () => {
  it('returns the authenticated session id from verified claims', () => {
    expect(
      getAuthenticatedSessionId({
        auth: {
          expiresAt: new Date('2026-07-10T12:15:00.000Z'),
          sessionId: 'session-1',
          userId: 'user-1',
        },
      } as never),
    ).toBe('session-1');
  });

  it('rejects a request without authenticated claims', () => {
    expect(() => getAuthenticatedSessionId({} as never)).toThrow(
      UnauthorizedException,
    );
  });

  it('sanitizes and bounds owner-visible client metadata', () => {
    const request = {
      header: jest
        .fn()
        .mockReturnValue(` Kestrel\u0000Client ${'x'.repeat(600)} `),
      ip: ` 203.0.113.7\u0000${'9'.repeat(100)} `,
    };

    const metadata = getRequestMetadata(request as never);

    expect(hasControlCharacter(metadata.ipAddress)).toBe(false);
    expect(hasControlCharacter(metadata.userAgent)).toBe(false);
    expect(metadata.ipAddress?.length).toBeLessThanOrEqual(64);
    expect(metadata.userAgent?.length).toBeLessThanOrEqual(512);
  });
});

function hasControlCharacter(value: string | undefined): boolean {
  return Array.from(value ?? '').some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;

    return codePoint <= 31 || codePoint === 127;
  });
}
