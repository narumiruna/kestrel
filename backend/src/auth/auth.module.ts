import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TotpService } from './totp.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, TotpService],
})
export class AuthModule {}
