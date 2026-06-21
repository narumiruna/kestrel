import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth-request';
import { getAuthenticatedUserId } from '../auth/auth-request';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RemoteControlService } from './remote-control.service';

@UseGuards(SessionAuthGuard)
@Controller()
export class RemoteControlController {
  constructor(private readonly remoteControlService: RemoteControlService) {}

  @Post('devices/register')
  registerDevice(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.remoteControlService.registerDevice(
      getAuthenticatedUserId(request),
      body,
    );
  }

  @Get('devices')
  listDevices(@Req() request: AuthenticatedRequest) {
    return this.remoteControlService.listDevices(
      getAuthenticatedUserId(request),
    );
  }

  @Post('devices/:deviceId/commands')
  createCommand(
    @Req() request: AuthenticatedRequest,
    @Param('deviceId') deviceId: string,
    @Body() body: unknown,
  ) {
    return this.remoteControlService.createCommand(
      getAuthenticatedUserId(request),
      deviceId,
      body,
    );
  }

  @Post('devices/:deviceId/commands/poll')
  pollCommands(
    @Req() request: AuthenticatedRequest,
    @Param('deviceId') deviceId: string,
    @Body() body: unknown,
  ) {
    return this.remoteControlService.pollCommands(
      getAuthenticatedUserId(request),
      deviceId,
      body,
    );
  }

  @Post('devices/:deviceId/commands/:commandId/ack')
  ackCommand(
    @Req() request: AuthenticatedRequest,
    @Param('deviceId') deviceId: string,
    @Param('commandId') commandId: string,
    @Body() body: unknown,
  ) {
    return this.remoteControlService.ackCommand(
      getAuthenticatedUserId(request),
      deviceId,
      commandId,
      body,
    );
  }
}
