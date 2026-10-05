import { Prisma } from '@prisma/client';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TotpService } from './totp.service';

const exchangeSessionSelect = Prisma.validator<Prisma.SessionSelect>()({
  createdAt: true,
  expiresAt: true,
  id: true,
  lastUsedAt: true,
  refreshTokenHash: true,
  revokedAt: true,
  rotatedRefreshTokenEncrypted: true,
  user: { select: { id: true, username: true } },
});

// Attempt authorization and initial credential derivation belong to each protocol.
// Derive only after the session lookup and expiry check, as in both exchange flows.
export async function recoverExchangeSessionCredential(
  prisma: PrismaService,
  totp: TotpService,
  sessionId: string,
  now: Date,
  deriveInitialToken: () => string,
) {
  const session = await prisma.session.findUnique({
    select: exchangeSessionSelect,
    where: { id: sessionId },
  });
  if (
    session == null ||
    session.revokedAt != null ||
    session.expiresAt <= now
  ) {
    return null;
  }
  let refreshToken = deriveInitialToken();
  if (!matchesRefreshHash(session.refreshTokenHash, refreshToken)) {
    if (session.rotatedRefreshTokenEncrypted == null) {
      return null;
    }
    try {
      refreshToken = totp.decryptSecret(session.rotatedRefreshTokenEncrypted);
    } catch {
      return null;
    }
    if (!matchesRefreshHash(session.refreshTokenHash, refreshToken)) {
      return null;
    }
  }
  return { session, refreshToken };
}

function matchesRefreshHash(expectedHash: string, value: string): boolean {
  const actual = Buffer.from(
    createHash('sha256').update(value).digest('hex'),
    'hex',
  );
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
