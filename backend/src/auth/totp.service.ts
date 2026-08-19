import { InternalServerErrorException } from '../http/errors';
import { ConfigService } from '../config.service';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import QRCode from 'qrcode';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_TOTP_ISSUER = 'Kestrel Cloud';
const ENCRYPTION_KEY_BYTES = 32;
const HOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_WINDOW = 1;
const SECRET_BYTES = 20;
const TOTP_ALGORITHM = 'SHA1';
const ENCRYPTED_SECRET_VERSION = 'v1';
const UINT32_MODULUS = 4294967296;

export class TotpService {
  private cachedEncryptionKey?: Buffer;

  constructor(private readonly configService: ConfigService) {}

  async createSetup(username: string) {
    const secret = encodeBase32(randomBytes(SECRET_BYTES));
    const encryptedSecret = this.encryptSecret(secret);
    const otpauthUrl = buildOtpauthUrl(this.getIssuer(), username, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
    });

    return {
      encryptedSecret,
      otpauthUrl,
      qrCodeDataUrl,
      secret,
    };
  }

  decryptSecret(encryptedSecret: string): string {
    const [version, iv, ciphertext, authTag, ...rest] =
      encryptedSecret.split('.');

    if (
      version !== ENCRYPTED_SECRET_VERSION ||
      iv == null ||
      ciphertext == null ||
      authTag == null ||
      rest.length > 0
    ) {
      throw new InternalServerErrorException('stored TOTP secret is invalid');
    }

    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getEncryptionKey(),
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch {
      throw new InternalServerErrorException('stored TOTP secret is invalid');
    }
  }

  encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      ENCRYPTED_SECRET_VERSION,
      iv.toString('base64url'),
      encrypted.toString('base64url'),
      authTag.toString('base64url'),
    ].join('.');
  }

  generateCode(secret: string, now: Date = new Date()): string {
    const counter = Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);

    return generateHotp(secret, counter);
  }

  verifyCode(secret: string, code: string, now: Date = new Date()): boolean {
    const normalizedCode = normalizeCode(code);

    if (normalizedCode == null) {
      return false;
    }

    const counter = Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);

    for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
      const expectedCode = generateHotp(secret, counter + offset);

      if (secureEqual(expectedCode, normalizedCode)) {
        return true;
      }
    }

    return false;
  }

  private getEncryptionKey(): Buffer {
    if (this.cachedEncryptionKey != null) {
      return this.cachedEncryptionKey;
    }

    const configuredKey = this.configService.get<string>(
      'AUTH_TOTP_ENCRYPTION_KEY',
    );

    if (configuredKey == null || configuredKey.trim() === '') {
      throw new InternalServerErrorException(
        'AUTH_TOTP_ENCRYPTION_KEY is not configured',
      );
    }

    const trimmedKey = configuredKey.trim();
    const encryptionKey = /^[0-9a-fA-F]{64}$/.test(trimmedKey)
      ? Buffer.from(trimmedKey, 'hex')
      : Buffer.from(trimmedKey, 'base64');

    if (encryptionKey.length !== ENCRYPTION_KEY_BYTES) {
      throw new InternalServerErrorException(
        'AUTH_TOTP_ENCRYPTION_KEY must decode to 32 bytes',
      );
    }

    this.cachedEncryptionKey = encryptionKey;

    return encryptionKey;
  }

  private getIssuer(): string {
    return (
      this.configService.get<string>('AUTH_TOTP_ISSUER')?.trim() ||
      DEFAULT_TOTP_ISSUER
    );
  }
}

function buildOtpauthUrl(
  issuer: string,
  username: string,
  secret: string,
): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const params = new URLSearchParams({
    algorithm: TOTP_ALGORITHM,
    digits: HOTP_DIGITS.toString(),
    issuer,
    period: TOTP_PERIOD_SECONDS.toString(),
    secret,
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

function normalizeCode(code: string): string | null {
  const normalizedCode = code.replaceAll(/\s|-/g, '');

  if (!/^\d{6}$/.test(normalizedCode)) {
    return null;
  }

  return normalizedCode;
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function encodeBase32(input: Buffer): string {
  let output = '';
  let bits = 0;
  let value = 0;

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function decodeBase32(input: string): Buffer {
  const normalized = input.toUpperCase().replaceAll('=', '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of normalized) {
    const alphabetIndex = BASE32_ALPHABET.indexOf(character);

    if (alphabetIndex < 0) {
      throw new InternalServerErrorException('invalid TOTP secret format');
    }

    value = (value << 5) | alphabetIndex;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateHotp(secret: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  const highCounter = Math.floor(counter / UINT32_MODULUS);
  const lowCounter = counter >>> 0;

  counterBuffer.writeUInt32BE(highCounter, 0);
  counterBuffer.writeUInt32BE(lowCounter, 4);

  const digest = createHmac(TOTP_ALGORITHM.toLowerCase(), decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 15;
  const binaryCode =
    ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255);

  return (binaryCode % 10 ** HOTP_DIGITS).toString().padStart(HOTP_DIGITS, '0');
}
