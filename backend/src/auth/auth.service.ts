import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterRequestDto } from './dto/register-request.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prismaService: PrismaService) {}

  async register({ password, username }: RegisterRequestDto) {
    const normalizedUsername = normalizeUsername(username);
    validatePassword(password);

    const existingUser = await this.prismaService.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true },
    });

    if (existingUser != null) {
      throw new ConflictException('username already exists');
    }

    const passwordHash = await hash(password, {
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
}

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 64;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

function normalizeUsername(username: string): string {
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

function validatePassword(password: string): void {
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
}
