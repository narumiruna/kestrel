import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SharingController } from './sharing.controller';
import { SharingService } from './sharing.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [SharingController],
  providers: [SharingService],
})
export class SharingModule {}
