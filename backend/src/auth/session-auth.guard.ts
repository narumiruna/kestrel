import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { type AuthenticatedRequest, getBearerToken } from './auth-request';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly accessTokenService: AccessTokenService,
    private readonly prismaService: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & Request>();
    const token = getBearerToken(request);
    const claims = this.accessTokenService.verifyToken(token);
    const session = await this.prismaService.session.findUnique({
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

    request.auth = claims;

    return true;
  }
}
