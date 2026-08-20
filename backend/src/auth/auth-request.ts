import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { UnauthorizedException } from '../http/errors';
import type { AccessTokenClaims } from './access-token.service';
import type { AuthAuditMetadata } from './auth-audit.service';

export type AuthVariables = {
  auth?: AccessTokenClaims;
  requestId?: string;
};

export type AppContext = Context<{ Variables: AuthVariables }>;

export function getAuthenticatedUserId(context: AppContext): string {
  return getClaims(context, 'missing authenticated user').userId;
}

export function getAuthenticatedSessionId(context: AppContext): string {
  return getClaims(context, 'missing authenticated session').sessionId;
}

export function getRequestMetadata(context: AppContext): AuthAuditMetadata {
  return {
    ipAddress: sanitizeMetadata(getRemoteAddress(context), 64),
    userAgent: sanitizeMetadata(context.req.header('user-agent'), 512),
  };
}

export function getBearerToken(context: AppContext): string {
  const authorizationHeader = context.req.header('authorization');
  const [scheme, token, ...rest] = authorizationHeader?.split(' ') ?? [];

  if (scheme !== 'Bearer' || token == null || rest.length > 0) {
    throw new UnauthorizedException('missing bearer token');
  }

  return token;
}

function getClaims(context: AppContext, message: string): AccessTokenClaims {
  const claims = context.get('auth');

  if (claims == null) {
    throw new UnauthorizedException(message);
  }

  return claims;
}

function getRemoteAddress(context: AppContext): string | undefined {
  return context.env == null ? undefined : getConnInfo(context).remote.address;
}

function sanitizeMetadata(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  const sanitized =
    value == null
      ? undefined
      : Array.from(value)
          .map((character) => (isControlCharacter(character) ? ' ' : character))
          .join('')
          .trim();

  return sanitized == null || sanitized === ''
    ? undefined
    : sanitized.slice(0, maxLength);
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;

  return codePoint <= 31 || codePoint === 127;
}
