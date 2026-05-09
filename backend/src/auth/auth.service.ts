import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { argon2id, hash, verify } from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
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
    const { recoveryCodes, updatedUser } =
      await this.prismaService.$transaction(async (transaction) => {
        const recoveryCodes = await createRecoveryCodes();

        await transaction.recoveryCode.deleteMany({
          where: {
            userId: user.id,
          },
        });
        await transaction.recoveryCode.createMany({
          data: recoveryCodes.codeHashes.map((codeHash) => ({
            codeHash,
            userId: user.id,
          })),
        });
        const updatedUser = await transaction.user.update({
          data: {
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
          recoveryCodes,
          updatedUser,
        };
      });

    return {
      nextStep: 'login' as const,
      recoveryCodes: recoveryCodes.codes,
      user: updatedUser,
    };
  }

  async login(input: unknown) {
    const loginRequest = parseLoginRequest(input);
    const user = await this.authenticateUser(
      loginRequest.username,
      loginRequest.password,
    );

    if (user.totpEnabledAt == null || user.totpSecretEncrypted == null) {
      throw new UnauthorizedException('totp must be enabled before login');
    }

    const authenticatedAt = new Date();
    const refreshToken = createRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const session = await this.prismaService.$transaction(async (transaction) => {
      if (loginRequest.totpCode != null) {
        const secret = this.totpService.decryptSecret(user.totpSecretEncrypted);

        if (!this.totpService.verifyCode(secret, loginRequest.totpCode)) {
          throw new UnauthorizedException('invalid one-time code');
        }
      } else {
        const consumedRecoveryCode = await useRecoveryCode(
          transaction,
          user.id,
          loginRequest.recoveryCode,
          authenticatedAt,
        );

        if (!consumedRecoveryCode) {
          throw new UnauthorizedException('invalid one-time code');
        }
      }

      return transaction.session.create({
        data: {
          expiresAt: createSessionExpiry(authenticatedAt),
          lastUsedAt: authenticatedAt,
          refreshTokenHash,
          userId: user.id,
        },
        select: {
          createdAt: true,
          expiresAt: true,
          id: true,
        },
      });
    });

    return {
      authMethod:
        loginRequest.totpCode != null ? ('totp' as const) : ('recovery_code' as const),
      refreshToken,
      session,
      user: {
        id: user.id,
        username: user.username,
      },
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
const RECOVERY_CODE_GROUP_COUNT = 2;
const RECOVERY_CODE_ALPHABET_MASK = 31;
const RECOVERY_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const RECOVERY_CODE_MAX_ATTEMPTS = 100;
const SESSION_DURATION_DAYS = 30;
const REFRESH_TOKEN_BYTES = 32;
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

function parseLoginRequest(input: unknown):
  | {
      password: string;
      recoveryCode: string;
      totpCode?: never;
      username: string;
    }
  | {
      password: string;
      recoveryCode?: never;
      totpCode: string;
      username: string;
    } {
  const inputRecord = parseUnknownRecord(input);
  const totpCode = inputRecord.totpCode;
  const recoveryCode = inputRecord.recoveryCode;

  if (typeof totpCode === 'string' && recoveryCode == null) {
    return {
      password: validatePassword(inputRecord.password),
      totpCode,
      username: normalizeUsername(inputRecord.username),
    };
  }

  if (typeof recoveryCode === 'string' && totpCode == null) {
    return {
      password: validatePassword(inputRecord.password),
      recoveryCode: normalizeRecoveryCode(recoveryCode),
      username: normalizeUsername(inputRecord.username),
    };
  }

  throw new BadRequestException(
    'exactly one of totpCode or recoveryCode must be provided',
  );
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
  let attempts = 0;

  while (
    normalizedCodes.size < RECOVERY_CODE_COUNT &&
    attempts < RECOVERY_CODE_MAX_ATTEMPTS
  ) {
    normalizedCodes.add(createRecoveryCodeValue());
    attempts += 1;
  }

  if (normalizedCodes.size < RECOVERY_CODE_COUNT) {
    throw new InternalServerErrorException('failed to generate recovery codes');
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

  for (const byte of randomBytes(
    RECOVERY_CODE_GROUP_LENGTH * RECOVERY_CODE_GROUP_COUNT,
  )) {
    // The alphabet has 32 symbols, so taking the low 5 bits is uniform.
    value += RECOVERY_CODE_ALPHABET[byte & RECOVERY_CODE_ALPHABET_MASK];
  }

  return value;
}

function formatRecoveryCode(code: string): string {
  return [
    code.slice(0, RECOVERY_CODE_GROUP_LENGTH),
    code.slice(RECOVERY_CODE_GROUP_LENGTH),
  ].join('-');
}

function normalizeRecoveryCode(code: string): string {
  const normalizedCode = code.toUpperCase().replaceAll(/\s|-/g, '');

  if (
    normalizedCode.length !==
      RECOVERY_CODE_GROUP_LENGTH * RECOVERY_CODE_GROUP_COUNT ||
    !/^[A-Z0-9]+$/.test(normalizedCode)
  ) {
    throw new BadRequestException('recoveryCode must be 8 letters or digits');
  }

  return normalizedCode;
}

function createRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

function createSessionExpiry(authenticatedAt: Date): Date {
  return new Date(
    authenticatedAt.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );
}

async function useRecoveryCode(
  transaction: Prisma.TransactionClient,
  userId: string,
  recoveryCode: string,
  usedAt: Date,
): Promise<boolean> {
  const recoveryCodes = await transaction.recoveryCode.findMany({
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      codeHash: true,
      id: true,
    },
    where: {
      usedAt: null,
      userId,
    },
  });

  for (const storedRecoveryCode of recoveryCodes) {
    if (await verify(storedRecoveryCode.codeHash, recoveryCode)) {
      await transaction.recoveryCode.update({
        data: {
          usedAt,
        },
        where: {
          id: storedRecoveryCode.id,
        },
      });

      return true;
    }
  }

  return false;
}
