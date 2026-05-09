import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthAuditMetadata } from './auth-audit.service';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: unknown) {
    return this.authService.register(body);
  }

  @Post('totp/setup')
  setupTotp(@Body() body: unknown) {
    return this.authService.setupTotp(body);
  }

  @Post('totp/verify')
  verifyTotp(@Body() body: unknown) {
    return this.authService.verifyTotp(body);
  }

  @Post('login')
  login(@Body() body: unknown, @Req() request: Request) {
    return this.authService.login(body, getRequestMetadata(request));
  }

  @Post('refresh')
  refresh(@Body() body: unknown, @Req() request: Request) {
    return this.authService.refresh(body, getRequestMetadata(request));
  }

  @Post('session/revoke')
  revokeSession(@Req() request: Request) {
    return this.authService.revokeSession(
      getBearerToken(request),
      getRequestMetadata(request),
    );
  }
}

function getBearerToken(request: Request): string {
  const authorizationHeader = request.header('authorization');
  const [scheme, token, ...rest] = authorizationHeader?.split(' ') ?? [];

  if (scheme !== 'Bearer' || token == null || rest.length > 0) {
    throw new UnauthorizedException('missing bearer token');
  }

  return token;
}

function getRequestMetadata(request: Request): AuthAuditMetadata {
  return {
    ipAddress: request.ip,
    userAgent: request.header('user-agent') ?? undefined,
  };
}
