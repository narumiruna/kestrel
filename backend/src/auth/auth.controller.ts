import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthAuditMetadata } from './auth-audit.service';
import {
  type AuthenticatedRequest,
  getAuthenticatedUserId,
  getBearerToken,
} from './auth-request';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './session-auth.guard';

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

  @UseGuards(SessionAuthGuard)
  @Post('password/change')
  changePassword(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.authService.changePassword(
      getAuthenticatedUserId(request),
      body,
      getRequestMetadata(request),
    );
  }

  @Post('session/revoke')
  revokeSession(@Req() request: Request) {
    return this.authService.revokeSession(
      getBearerToken(request),
      getRequestMetadata(request),
    );
  }
}

function getRequestMetadata(request: Request): AuthAuditMetadata {
  return {
    ipAddress: request.ip,
    userAgent: request.header('user-agent') ?? undefined,
  };
}
