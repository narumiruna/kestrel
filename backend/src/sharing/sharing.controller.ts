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
  @Get('places/:placeId/share-link')
  getPlaceShareLink(
    @Req() request: AuthenticatedRequest,
    @Param('placeId') placeId: string,
  ) {
    return this.sharingService.getPlaceShareLink(
      getAuthenticatedUserId(request),
      placeId,
    );
  }

  @UseGuards(SessionAuthGuard)
  @Post('places/:placeId/share-link')
  createPlaceShareLink(
    @Req() request: AuthenticatedRequest,
    @Param('placeId') placeId: string,
  ) {
    return this.sharingService.createPlaceShareLink(
      getAuthenticatedUserId(request),
      placeId,
    );
  }

  @UseGuards(SessionAuthGuard)
  @Patch('places/:placeId/share-link')
  updatePlaceShareLink(
    @Req() request: AuthenticatedRequest,
    @Param('placeId') placeId: string,
    @Body() body: unknown,
  ) {
    return this.sharingService.updatePlaceShareLink(
      getAuthenticatedUserId(request),
      placeId,
      body,
    );
  }

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
  getSharedItem(@Param('token') token: string) {
    return this.sharingService.getSharedItem(token);
  }

  @UseGuards(SessionAuthGuard)
  @Post('shares/:token/copy')
  copySharedItem(
    @Req() request: AuthenticatedRequest,
    @Param('token') token: string,
    @Body() body: unknown,
  ) {
    return this.sharingService.copySharedItem(
      getAuthenticatedUserId(request),
      token,
      body,
    );
  }
}
