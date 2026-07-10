import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type AuthenticatedRequest,
  getAuthenticatedSessionId,
  getAuthenticatedUserId,
  getRequestMetadata,
} from '../auth/auth-request';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AccountSecurityService } from './account-security.service';

@UseGuards(SessionAuthGuard)
@Controller()
export class AccountSecurityController {
  constructor(
    private readonly accountSecurityService: AccountSecurityService,
  ) {}

  @Get('auth/sessions')
  listSessions(@Req() request: AuthenticatedRequest) {
    return this.accountSecurityService.listSessions(
      getAuthenticatedUserId(request),
      getAuthenticatedSessionId(request),
    );
  }

  @Post('auth/sessions/revoke-others')
  revokeOtherSessions(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.accountSecurityService.revokeOtherSessions(
      getAuthenticatedUserId(request),
      getAuthenticatedSessionId(request),
      body,
      getRequestMetadata(request),
    );
  }

  @Post('auth/sessions/:sessionId/revoke')
  revokeSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ) {
    return this.accountSecurityService.revokeSession(
      getAuthenticatedUserId(request),
      getAuthenticatedSessionId(request),
      sessionId,
      body,
      getRequestMetadata(request),
    );
  }

  @Post('devices/:deviceId/revoke')
  revokeDevice(
    @Req() request: AuthenticatedRequest,
    @Param('deviceId') deviceId: string,
    @Body() body: unknown,
  ) {
    return this.accountSecurityService.revokeDevice(
      getAuthenticatedUserId(request),
      getAuthenticatedSessionId(request),
      deviceId,
      body,
      getRequestMetadata(request),
    );
  }
}
