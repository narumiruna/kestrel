import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth-request';
import { getAuthenticatedUserId } from '../auth/auth-request';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SharingService } from './sharing.service';

@Controller()
export class SharingController {
  constructor(private readonly sharingService: SharingService) {}

  @UseGuards(SessionAuthGuard)
  @Get('routes/:routeId/share-link')
  getRouteShareLink(
    @Req() request: AuthenticatedRequest,
    @Param('routeId') routeId: string,
  ) {
    return this.sharingService.getRouteShareLink(
      getAuthenticatedUserId(request),
      routeId,
    );
  }

  @UseGuards(SessionAuthGuard)
  @Post('routes/:routeId/share-link')
  createRouteShareLink(
    @Req() request: AuthenticatedRequest,
    @Param('routeId') routeId: string,
  ) {
    return this.sharingService.createRouteShareLink(
      getAuthenticatedUserId(request),
      routeId,
    );
  }

  @UseGuards(SessionAuthGuard)
  @Patch('routes/:routeId/share-link')
  updateRouteShareLink(
    @Req() request: AuthenticatedRequest,
    @Param('routeId') routeId: string,
    @Body() body: unknown,
  ) {
    return this.sharingService.updateRouteShareLink(
      getAuthenticatedUserId(request),
      routeId,
      body,
    );
  }

  @Get('shares/:token')
  getSharedRoute(@Param('token') token: string) {
    return this.sharingService.getSharedRoute(token);
  }

  @UseGuards(SessionAuthGuard)
  @Post('shares/:token/copy')
  copySharedRoute(
    @Req() request: AuthenticatedRequest,
    @Param('token') token: string,
    @Body() body: unknown,
  ) {
    return this.sharingService.copySharedRoute(
      getAuthenticatedUserId(request),
      token,
      body,
    );
  }
}
