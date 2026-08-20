import { HttpException, HttpStatus } from '../http/errors';
import { ConfigService } from '../config.service';
import { createLogger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const DEFAULT_RATE_LIMIT_BLOCK_SECONDS = 15 * 60;
const DEFAULT_RATE_LIMIT_MAX_ATTEMPTS = 5;

export const AUTH_RATE_LIMIT_TYPE = {
  PASSWORD: 'password',
  RECOVERY_CODE: 'recovery_code',
  TOTP: 'totp',
} as const;

export type AuthRateLimitType =
  (typeof AUTH_RATE_LIMIT_TYPE)[keyof typeof AUTH_RATE_LIMIT_TYPE];

export class AuthRateLimitService {
  private readonly logger = createLogger(AuthRateLimitService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

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
      // The subject is a username; it stays in the audit table, not in stdout.
      this.logger.warn(
        {
          attempts: rateLimit.attempts,
          event: 'auth_rate_limit_rejected',
          type,
        },
        'rejected an auth attempt from a blocked subject',
      );

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

    if (
      rateLimit == null ||
      isWindowExpired(rateLimit.windowStartedAt, now, this.getWindowMs())
    ) {
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
    const isBlocked = attempts >= this.getMaxAttempts();

    await this.prismaService.authRateLimit.update({
      data: {
        attempts,
        blockedUntil: isBlocked
          ? new Date(now.getTime() + this.getBlockWindowMs())
          : null,
      },
      where: {
        type_subject: {
          subject,
          type,
        },
      },
    });

    if (isBlocked) {
      this.logger.warn(
        {
          attempts,
          blockSeconds: this.getBlockWindowMs() / 1000,
          event: 'auth_rate_limit_blocked',
          type,
        },
        'blocked a subject after repeated auth failures',
      );
    }
  }

  async reset(type: AuthRateLimitType, subject: string) {
    await this.prismaService.authRateLimit.deleteMany({
      where: {
        subject,
        type,
      },
    });
  }

  private getBlockWindowMs(): number {
    return (
      this.getPositiveIntegerConfig(
        'AUTH_RATE_LIMIT_BLOCK_SECONDS',
        DEFAULT_RATE_LIMIT_BLOCK_SECONDS,
      ) * 1000
    );
  }

  private getMaxAttempts(): number {
    return this.getPositiveIntegerConfig(
      'AUTH_RATE_LIMIT_MAX_ATTEMPTS',
      DEFAULT_RATE_LIMIT_MAX_ATTEMPTS,
    );
  }

  private getWindowMs(): number {
    return (
      this.getPositiveIntegerConfig(
        'AUTH_RATE_LIMIT_WINDOW_SECONDS',
        DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
      ) * 1000
    );
  }

  private getPositiveIntegerConfig(key: string, defaultValue: number): number {
    const configuredValue = this.configService.get<string>(key);

    if (configuredValue == null || configuredValue.trim() === '') {
      return defaultValue;
    }

    const parsedValue = Number.parseInt(configuredValue, 10);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      return defaultValue;
    }

    return parsedValue;
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

function isWindowExpired(
  windowStartedAt: Date,
  now: Date,
  windowMs: number,
): boolean {
  return now.getTime() - windowStartedAt.getTime() >= windowMs;
}
