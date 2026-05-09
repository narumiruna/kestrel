import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { argon2id, hash, verify } from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TotpService } from './totp.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly totpService: TotpService,
  ) {}

  async register(input: unknown) {
    const { password, username } = parseRegisterRequest(input);
    const normalizedUsername = normalizeUsername(username);
    const normalizedPassword = validatePassword(password);

    const existingUser = await this.prismaService.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true },
    });

    if (existingUser != null) {
      throw new ConflictException('username already exists');
    }

    const passwordHash = await hash(normalizedPassword, {
      type: argon2id,
    });

    try {
      const user = await this.prismaService.user.create({
        data: {
          passwordHash,
          username: normalizedUsername,
        },
        select: {
          createdAt: true,
          id: true,
          username: true,
        },
      });

      return {
        nextStep: 'totp_setup' as const,
        user,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('username already exists');
      }

      throw error;
    }
  }

  async setupTotp(input: unknown) {
    const { password, username } = parseUsernamePasswordRequest(input);
    const user = await this.authenticateUser(username, password);

    if (user.totpEnabledAt != null) {
      throw new ConflictException('totp already enabled');
    }

    const setup = await this.totpService.createSetup(user.username);

    await this.prismaService.user.update({
      data: {
        totpEnabledAt: null,
        totpSecretEncrypted: setup.encryptedSecret,
      },
      select: {
        id: true,
        username: true,
      },
      where: {
        id: user.id,
      },
    });

    return {
      otpauthUrl: setup.otpauthUrl,
      qrCodeDataUrl: setup.qrCodeDataUrl,
      secret: setup.secret,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  async verifyTotp(input: unknown) {
    const { code, password, username } = parseTotpVerifyRequest(input);
    const user = await this.authenticateUser(username, password);

    if (user.totpEnabledAt != null) {
      throw new ConflictException('totp already enabled');
    }

    if (user.totpSecretEncrypted == null) {
      throw new BadRequestException('totp setup has not been started');
    }

    const secret = this.totpService.decryptSecret(user.totpSecretEncrypted);

    if (!this.totpService.verifyCode(secret, code)) {
      throw new BadRequestException('invalid totp code');
    }

    const totpEnabledAt = new Date();
    const recoveryCodes = await createRecoveryCodes();
    const updatedUser = await this.prismaService.user.update({
      data: {
        recoveryCodes: {
          createMany: {
            data: recoveryCodes.codeHashes.map((codeHash) => ({
              codeHash,
            })),
          },
          deleteMany: {},
        },
        totpEnabledAt,
      },
      select: {
        id: true,
        totpEnabledAt: true,
        username: true,
      },
      where: {
        id: user.id,
      },
    });

    return {
      nextStep: 'login' as const,
      recoveryCodes: recoveryCodes.codes,
      user: updatedUser,
    };
  }

  private async authenticateUser(username: string, password: string) {
    const user = await this.prismaService.user.findUnique({
      select: {
        id: true,
        passwordHash: true,
        totpEnabledAt: true,
        totpSecretEncrypted: true,
        username: true,
      },
      where: { username },
    });

    if (user == null) {
      throw new UnauthorizedException('invalid username or password');
    }

    const passwordMatches = await verify(user.passwordHash, password);

    if (!passwordMatches) {
      throw new UnauthorizedException('invalid username or password');
    }

    return user;
  }
}

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 64;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_GROUP_LENGTH = 4;
const RECOVERY_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

function parseRegisterRequest(input: unknown): {
  password: unknown;
  username: unknown;
} {
  const inputRecord = parseUnknownRecord(input);

  return {
    password: inputRecord.password,
    username: inputRecord.username,
  };
}

function parseUsernamePasswordRequest(input: unknown): {
  password: string;
  username: string;
} {
  const { password, username } = parseRegisterRequest(input);

  return {
    password: validatePassword(password),
    username: normalizeUsername(username),
  };
}

function parseTotpVerifyRequest(input: unknown): {
  code: string;
  password: string;
  username: string;
} {
  const inputRecord = parseUnknownRecord(input);

  if (typeof inputRecord.code !== 'string') {
    throw new BadRequestException('code must be a string');
  }

  return {
    code: inputRecord.code,
    password: validatePassword(inputRecord.password),
    username: normalizeUsername(inputRecord.username),
  };
}

function parseUnknownRecord(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== 'object') {
    throw new BadRequestException('request body must be an object');
  }

  return input as Record<string, unknown>;
}

function normalizeUsername(username: unknown): string {
  if (typeof username !== 'string') {
    throw new BadRequestException('username must be a string');
  }

  const normalizedUsername = username.trim();

  if (
    normalizedUsername.length < MIN_USERNAME_LENGTH ||
    normalizedUsername.length > MAX_USERNAME_LENGTH
  ) {
    throw new BadRequestException(
      'username must be between 3 and 64 characters',
    );
  }

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    throw new BadRequestException(
      'username may only contain letters, numbers, dots, underscores, and hyphens',
    );
  }

  return normalizedUsername;
}

function validatePassword(password: unknown): string {
  if (typeof password !== 'string') {
    throw new BadRequestException('password must be a string');
  }

  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new BadRequestException(
      'password must be between 12 and 256 characters',
    );
  }

  return password;
}

async function createRecoveryCodes(): Promise<{
  codeHashes: string[];
  codes: string[];
}> {
  const normalizedCodes = new Set<string>();

  while (normalizedCodes.size < RECOVERY_CODE_COUNT) {
    normalizedCodes.add(createRecoveryCodeValue());
  }

  const codes = Array.from(normalizedCodes, formatRecoveryCode);
  const codeHashes = await Promise.all(
    Array.from(normalizedCodes, (code) =>
      hash(code, {
        type: argon2id,
      }),
    ),
  );

  return {
    codeHashes,
    codes,
  };
}

function createRecoveryCodeValue(): string {
  let value = '';

  for (const byte of randomBytes(RECOVERY_CODE_GROUP_LENGTH * 2)) {
    value += RECOVERY_CODE_ALPHABET[byte & 31];
  }

  return value;
}

function formatRecoveryCode(code: string): string {
  return [
    code.slice(0, RECOVERY_CODE_GROUP_LENGTH),
    code.slice(RECOVERY_CODE_GROUP_LENGTH),
  ].join('-');
}
