import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenClaims } from './access-token.service';

export type AuthenticatedRequest = Request & {
  auth?: AccessTokenClaims;
};

export function getAuthenticatedUserId(request: AuthenticatedRequest): string {
  if (request.auth == null) {
    throw new UnauthorizedException('missing authenticated user');
  }

  return request.auth.userId;
}

export function getBearerToken(request: Request): string {
  const authorizationHeader = request.header('authorization');
  const [scheme, token, ...rest] = authorizationHeader?.split(' ') ?? [];

  if (scheme !== 'Bearer' || token == null || rest.length > 0) {
    throw new UnauthorizedException('missing bearer token');
  }

  return token;
}
