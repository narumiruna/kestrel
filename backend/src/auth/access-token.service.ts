import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

const ACCESS_TOKEN_VERSION = 'v1';
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

type AccessTokenPayload = {
  exp: number;
  sid: string;
  sub: string;
};

export type AccessTokenClaims = {
  expiresAt: Date;
  sessionId: string;
  userId: string;
};

@Injectable()
export class AccessTokenService {
  constructor(private readonly configService: ConfigService) {}

  issueToken(
    input: {
      sessionId: string;
      userId: string;
    },
    issuedAt: Date = new Date(),
  ): {
    expiresAt: Date;
    token: string;
  } {
    const expiresAt = new Date(
      issuedAt.getTime() + this.getTtlSeconds() * 1000,
    );
    const payload = Buffer.from(
      JSON.stringify({
        exp: Math.floor(expiresAt.getTime() / 1000),
        sid: input.sessionId,
        sub: input.userId,
      } satisfies AccessTokenPayload),
    ).toString('base64url');
    const signedPayload = `${ACCESS_TOKEN_VERSION}.${payload}`;

    return {
      expiresAt,
      token: `${signedPayload}.${this.sign(signedPayload)}`,
    };
  }

  verifyToken(
    token: string,
    now: Date = new Date(),
  ): AccessTokenClaims {
    const [version, encodedPayload, signature, ...rest] = token.split('.');

    if (
      version !== ACCESS_TOKEN_VERSION ||
      encodedPayload == null ||
      signature == null ||
      rest.length > 0
    ) {
      throw new UnauthorizedException('invalid access token');
    }

    const signedPayload = `${version}.${encodedPayload}`;
    const expectedSignature = this.sign(signedPayload);

    if (!safeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException('invalid access token');
    }

    const payload = parseAccessTokenPayload(encodedPayload);
    const expiresAt = new Date(payload.exp * 1000);

    if (expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException('access token expired');
    }

    return {
      expiresAt,
      sessionId: payload.sid,
      userId: payload.sub,
    };
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.getSecret())
      .update(payload)
      .digest('base64url');
  }

  private getSecret(): string {
    const configuredSecret = this.configService.get<string>(
      'AUTH_ACCESS_TOKEN_SECRET',
    );
    const secret = configuredSecret?.trim();

    if (secret == null || secret === '') {
      throw new InternalServerErrorException(
        'AUTH_ACCESS_TOKEN_SECRET is not configured',
      );
    }

    return secret;
  }

  private getTtlSeconds(): number {
    const configuredTtl = this.configService.get<string>(
      'AUTH_ACCESS_TOKEN_TTL_SECONDS',
    );

    if (configuredTtl == null || configuredTtl.trim() === '') {
      return DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
    }

    const ttlSeconds = Number.parseInt(configuredTtl, 10);

    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new InternalServerErrorException(
        'AUTH_ACCESS_TOKEN_TTL_SECONDS must be a positive integer',
      );
    }

    return ttlSeconds;
  }
}

function parseAccessTokenPayload(encodedPayload: string): AccessTokenPayload {
  try {
    const decodedPayload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<AccessTokenPayload>;

    if (
      typeof decodedPayload.exp !== 'number' ||
      !Number.isInteger(decodedPayload.exp) ||
      typeof decodedPayload.sid !== 'string' ||
      typeof decodedPayload.sub !== 'string'
    ) {
      throw new Error('invalid payload');
    }

    return {
      exp: decodedPayload.exp,
      sid: decodedPayload.sid,
      sub: decodedPayload.sub,
    };
  } catch {
    throw new UnauthorizedException('invalid access token');
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
