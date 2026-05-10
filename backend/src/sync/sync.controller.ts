import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth-request';
import { getAuthenticatedUserId } from '../auth/auth-request';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { parseSinceCursorQuery } from './sync.validation';
import { SyncService } from './sync.service';

@UseGuards(SessionAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('bootstrap')
  bootstrap(@Req() request: AuthenticatedRequest) {
    return this.syncService.bootstrap(getAuthenticatedUserId(request));
  }

  @Post('upload')
  upload(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.syncService.upload(getAuthenticatedUserId(request), body);
  }

  @Get('changes')
  getChanges(
    @Req() request: AuthenticatedRequest,
    @Query('since') since: string | undefined,
  ) {
    return this.syncService.getChanges(
      getAuthenticatedUserId(request),
      parseSinceCursorQuery(since),
    );
  }
}
