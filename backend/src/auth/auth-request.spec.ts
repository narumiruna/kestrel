import { Hono } from 'hono';
import { handleError } from '../http/handlers';
import {
  type AuthVariables,
  getAuthenticatedSessionId,
  getRequestMetadata,
} from './auth-request';

const NUL = String.fromCodePoint(0);

describe('auth request helpers', () => {
  it('returns the authenticated session id from verified claims', async () => {
    const app = new Hono<{ Variables: AuthVariables }>();

    app.get('/', (context) => {
      context.set('auth', {
        expiresAt: new Date('2026-07-10T12:15:00.000Z'),
        sessionId: 'session-1',
        userId: 'user-1',
      });

      return context.json({ sessionId: getAuthenticatedSessionId(context) });
    });

    await expect((await app.request('/')).json()).resolves.toEqual({
      sessionId: 'session-1',
    });
  });

  it('rejects a request without authenticated claims', async () => {
    const app = new Hono<{ Variables: AuthVariables }>();

    app.get('/', (context) =>
      context.json({ sessionId: getAuthenticatedSessionId(context) }),
    );
    app.onError(handleError);

    const response = await app.request('/');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      message: 'missing authenticated session',
    });
  });

  it('sanitizes and bounds owner-visible client metadata', async () => {
    const app = new Hono<{ Variables: AuthVariables }>();

    app.get('/', (context) => context.json(getRequestMetadata(context)));

    const response = await app.request(
      '/',
      { headers: { 'user-agent': `Kestrel Client ${'x'.repeat(600)}` } },
      {
        incoming: {
          socket: {
            remoteAddress: ` 203.0.113.7${NUL}${'9'.repeat(100)} `,
          },
        },
      },
    );
    const metadata = (await response.json()) as {
      ipAddress?: string;
      userAgent?: string;
    };

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
