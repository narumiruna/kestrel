import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountSecurityController } from './account-security.controller';
import { AccountSecurityService } from './account-security.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AccountSecurityController],
  providers: [AccountSecurityService],
})
export class AccountSecurityModule {}
