import type { AuthVariables } from '../auth/auth-request';
import type { SessionAuth } from '../auth/session-auth.middleware';

export const TEST_CLAIMS: AuthVariables['auth'] = {
  expiresAt: new Date('2026-05-09T18:00:00.000Z'),
  sessionId: 'session-1',
  userId: 'user-1',
};

export function createStubSessionAuth(
  claims: AuthVariables['auth'] = TEST_CLAIMS,
): SessionAuth {
  return async (context, next) => {
    context.set('auth', claims);

    await next();
  };
}

export function jsonRequest(body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  };
}
