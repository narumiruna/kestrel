import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AccessTokenService } from './access-token.service';
import { AuthAuditService } from './auth-audit.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionRevocationService } from './session-revocation.service';
import { TotpService } from './totp.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AccessTokenService,
    AuthAuditService,
    AuthRateLimitService,
    AuthService,
    SessionAuthGuard,
    SessionRevocationService,
    TotpService,
  ],
  exports: [
    AccessTokenService,
    AuthAuditService,
    AuthService,
    SessionAuthGuard,
    SessionRevocationService,
  ],
})
export class AuthModule {}
