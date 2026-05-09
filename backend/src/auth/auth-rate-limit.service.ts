import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

export const AUTH_RATE_LIMIT_TYPE = {
  PASSWORD: 'password',
  RECOVERY_CODE: 'recovery_code',
  TOTP: 'totp',
} as const;

export type AuthRateLimitType =
  (typeof AUTH_RATE_LIMIT_TYPE)[keyof typeof AUTH_RATE_LIMIT_TYPE];

@Injectable()
export class AuthRateLimitService {
  constructor(private readonly prismaService: PrismaService) {}

  async assertAllowed(
    type: AuthRateLimitType,
    subject: string,
    now: Date = new Date(),
  ) {
    const rateLimit = await this.prismaService.authRateLimit.findUnique({
      where: {
        type_subject: {
          subject,
          type,
        },
      },
    });

    if (
      rateLimit?.blockedUntil != null &&
      rateLimit.blockedUntil.getTime() > now.getTime()
    ) {
      throw new HttpException(
        getRateLimitMessage(type),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(
    type: AuthRateLimitType,
    subject: string,
    now: Date = new Date(),
  ) {
    const rateLimit = await this.prismaService.authRateLimit.findUnique({
      where: {
        type_subject: {
          subject,
          type,
        },
      },
    });

    if (rateLimit == null || isWindowExpired(rateLimit.windowStartedAt, now)) {
      await this.prismaService.authRateLimit.upsert({
        create: {
          attempts: 1,
          blockedUntil: null,
          subject,
          type,
          windowStartedAt: now,
        },
        update: {
          attempts: 1,
          blockedUntil: null,
          windowStartedAt: now,
        },
        where: {
          type_subject: {
            subject,
            type,
          },
        },
      });

      return;
    }

    const attempts = rateLimit.attempts + 1;

    await this.prismaService.authRateLimit.update({
      data: {
        attempts,
        blockedUntil:
          attempts >= RATE_LIMIT_MAX_ATTEMPTS
            ? new Date(now.getTime() + RATE_LIMIT_BLOCK_MS)
            : null,
      },
      where: {
        type_subject: {
          subject,
          type,
        },
      },
    });
  }

  async reset(type: AuthRateLimitType, subject: string) {
    await this.prismaService.authRateLimit.deleteMany({
      where: {
        subject,
        type,
      },
    });
  }
}

function getRateLimitMessage(type: AuthRateLimitType): string {
  switch (type) {
    case AUTH_RATE_LIMIT_TYPE.PASSWORD:
      return 'too many password attempts';
    case AUTH_RATE_LIMIT_TYPE.TOTP:
      return 'too many totp attempts';
    case AUTH_RATE_LIMIT_TYPE.RECOVERY_CODE:
      return 'too many recovery code attempts';
  }
}

function isWindowExpired(windowStartedAt: Date, now: Date): boolean {
  return now.getTime() - windowStartedAt.getTime() >= RATE_LIMIT_WINDOW_MS;
}
