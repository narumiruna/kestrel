import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RemoteControlController } from './remote-control.controller';
import { RemoteControlService } from './remote-control.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [RemoteControlController],
  providers: [RemoteControlService],
})
export class RemoteControlModule {}
