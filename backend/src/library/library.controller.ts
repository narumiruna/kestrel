import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth-request';
import { getAuthenticatedUserId } from '../auth/auth-request';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { LibraryService } from './library.service';

@UseGuards(SessionAuthGuard)
@Controller()
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get('places')
  listPlaces(
    @Req() request: AuthenticatedRequest,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.libraryService.listPlaces(
      getAuthenticatedUserId(request),
      parseIncludeDeletedQuery(includeDeleted),
    );
  }

  @Get('places/:placeId')
  getPlace(
    @Req() request: AuthenticatedRequest,
    @Param('placeId') placeId: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.libraryService.getPlace(
      getAuthenticatedUserId(request),
      placeId,
      parseIncludeDeletedQuery(includeDeleted),
    );
  }

  @Post('places')
  createPlace(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.libraryService.createPlace(
      getAuthenticatedUserId(request),
      body,
    );
  }

  @Patch('places/:placeId')
  updatePlace(
    @Req() request: AuthenticatedRequest,
    @Param('placeId') placeId: string,
    @Body() body: unknown,
  ) {
    return this.libraryService.updatePlace(
      getAuthenticatedUserId(request),
      placeId,
      body,
    );
  }

  @Delete('places/:placeId')
  deletePlace(
    @Req() request: AuthenticatedRequest,
    @Param('placeId') placeId: string,
  ) {
    return this.libraryService.deletePlace(
      getAuthenticatedUserId(request),
      placeId,
    );
  }

  @Get('routes')
  listRoutes(
    @Req() request: AuthenticatedRequest,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.libraryService.listRoutes(
      getAuthenticatedUserId(request),
      parseIncludeDeletedQuery(includeDeleted),
    );
  }

  @Get('routes/:routeId')
  getRoute(
    @Req() request: AuthenticatedRequest,
    @Param('routeId') routeId: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.libraryService.getRoute(
      getAuthenticatedUserId(request),
      routeId,
      parseIncludeDeletedQuery(includeDeleted),
    );
  }

  @Post('routes')
  createRoute(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.libraryService.createRoute(
      getAuthenticatedUserId(request),
      body,
    );
  }

  @Patch('routes/:routeId')
  updateRoute(
    @Req() request: AuthenticatedRequest,
    @Param('routeId') routeId: string,
    @Body() body: unknown,
  ) {
    return this.libraryService.updateRoute(
      getAuthenticatedUserId(request),
      routeId,
      body,
    );
  }

  @Delete('routes/:routeId')
  deleteRoute(
    @Req() request: AuthenticatedRequest,
    @Param('routeId') routeId: string,
  ) {
    return this.libraryService.deleteRoute(
      getAuthenticatedUserId(request),
      routeId,
    );
  }

  @Post('library-items/reorder')
  reorderLibraryItem(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.libraryService.reorderLibraryItem(
      getAuthenticatedUserId(request),
      body,
    );
  }

  @Post('library-items/:libraryItemId/touch')
  touchLibraryItem(
    @Req() request: AuthenticatedRequest,
    @Param('libraryItemId') libraryItemId: string,
  ) {
    return this.libraryService.touchLibraryItem(
      getAuthenticatedUserId(request),
      libraryItemId,
    );
  }
}

function parseIncludeDeletedQuery(includeDeleted: string | undefined): boolean {
  if (includeDeleted == null) {
    return false;
  }

  if (includeDeleted === 'true') {
    return true;
  }

  if (includeDeleted === 'false') {
    return false;
  }

  throw new BadRequestException('includeDeleted must be true or false');
}
