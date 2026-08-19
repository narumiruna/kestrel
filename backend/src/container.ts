import { AccountSecurityService } from './account-security/account-security.service';
import { AppService } from './app.service';
import { AccessTokenService } from './auth/access-token.service';
import { AuthAuditService } from './auth/auth-audit.service';
import { AuthRateLimitService } from './auth/auth-rate-limit.service';
import { AuthService } from './auth/auth.service';
import { SessionRevocationService } from './auth/session-revocation.service';
import {
  type SessionAuth,
  createSessionAuth,
} from './auth/session-auth.middleware';
import { TotpService } from './auth/totp.service';
import { ConfigService } from './config.service';
import { LibraryService } from './library/library.service';
import { PrismaService } from './prisma/prisma.service';
import { RemoteControlService } from './remote-control/remote-control.service';
import { SharingService } from './sharing/sharing.service';
import { SyncService } from './sync/sync.service';

export type Container = {
  accessTokenService: AccessTokenService;
  accountSecurityService: AccountSecurityService;
  appService: AppService;
  authService: AuthService;
  libraryService: LibraryService;
  prismaService: PrismaService;
  remoteControlService: RemoteControlService;
  sessionAuth: SessionAuth;
  sharingService: SharingService;
  syncService: SyncService;
  totpService: TotpService;
};

export function createContainer(
  overrides: { prismaService?: PrismaService } = {},
): Container {
  const configService = new ConfigService();
  const prismaService = overrides.prismaService ?? new PrismaService();

  const accessTokenService = new AccessTokenService(configService);
  const authAuditService = new AuthAuditService(prismaService);
  const authRateLimitService = new AuthRateLimitService(
    configService,
    prismaService,
  );
  const sessionRevocationService = new SessionRevocationService(prismaService);
  const totpService = new TotpService(configService);

  const authService = new AuthService(
    accessTokenService,
    authAuditService,
    authRateLimitService,
    prismaService,
    sessionRevocationService,
    totpService,
  );

  return {
    accessTokenService,
    accountSecurityService: new AccountSecurityService(
      authService,
      authAuditService,
      prismaService,
      sessionRevocationService,
    ),
    appService: new AppService(configService, prismaService),
    authService,
    libraryService: new LibraryService(prismaService),
    prismaService,
    remoteControlService: new RemoteControlService(prismaService),
    sessionAuth: createSessionAuth(accessTokenService, prismaService),
    sharingService: new SharingService(prismaService),
    syncService: new SyncService(prismaService),
    totpService,
  };
}
