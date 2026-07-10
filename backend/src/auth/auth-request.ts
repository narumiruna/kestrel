import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenClaims } from './access-token.service';
import type { AuthAuditMetadata } from './auth-audit.service';

export type AuthenticatedRequest = Request & {
  auth?: AccessTokenClaims;
};

export function getAuthenticatedUserId(request: AuthenticatedRequest): string {
  if (request.auth == null) {
    throw new UnauthorizedException('missing authenticated user');
  }

  return request.auth.userId;
}

export function getAuthenticatedSessionId(
  request: AuthenticatedRequest,
): string {
  if (request.auth == null) {
    throw new UnauthorizedException('missing authenticated session');
  }

  return request.auth.sessionId;
}

export function getRequestMetadata(request: Request): AuthAuditMetadata {
  return {
    ipAddress: sanitizeMetadata(request.ip, 64),
    userAgent: sanitizeMetadata(request.header('user-agent'), 512),
  };
}

export function getBearerToken(request: Request): string {
  const authorizationHeader = request.header('authorization');
  const [scheme, token, ...rest] = authorizationHeader?.split(' ') ?? [];

  if (scheme !== 'Bearer' || token == null || rest.length > 0) {
    throw new UnauthorizedException('missing bearer token');
  }

  return token;
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
