import type { MiddlewareHandler } from 'hono';
import { UnauthorizedException } from '../http/errors';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { type AuthVariables, getBearerToken } from './auth-request';

export type SessionAuth = MiddlewareHandler<{ Variables: AuthVariables }>;

export function createSessionAuth(
  accessTokenService: AccessTokenService,
  prismaService: PrismaService,
): SessionAuth {
  return async (context, next) => {
    const token = getBearerToken(context);
    const claims = accessTokenService.verifyToken(token);
    const session = await prismaService.session.findUnique({
      select: {
        expiresAt: true,
        revokedAt: true,
        userId: true,
      },
      where: {
        id: claims.sessionId,
      },
    });

    if (
      session == null ||
      session.userId !== claims.userId ||
      session.revokedAt != null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('session is no longer active');
    }

    context.set('auth', claims);

    await next();
  };
}
