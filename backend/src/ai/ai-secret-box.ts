import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ConfigService } from '../config.service';
import { aiError } from './ai-errors';

/** Recoverable secrets are bound to their owner, provider, and storage purpose. */
export class AiSecretBox {
  constructor(private readonly config: ConfigService) {}

  available(): boolean {
    const key = this.config.get('ENCRYPTION_KEY');
    return typeof key === 'string' && /^[a-fA-F0-9]{64}$/.test(key);
  }

  private key(): Buffer {
    if (!this.available()) return aiError('AI_ENCRYPTION_UNAVAILABLE', 503);
    return Buffer.from(this.config.get('ENCRYPTION_KEY')!, 'hex');
  }

  encrypt(
    userId: string,
    providerId: string,
    purpose: string,
    value: string,
  ): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(
      Buffer.from(
        JSON.stringify(['kestrel-ai-v1', userId, providerId, purpose]),
      ),
    );
    const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      bytes.toString('base64url'),
    ].join('.');
  }

  decrypt(
    userId: string,
    providerId: string,
    purpose: string,
    value: string,
  ): string {
    const key = this.key();
    try {
      const [version, iv, tag, data, ...extra] = value.split('.');
      if (
        version !== 'v1' ||
        !iv ||
        !tag ||
        !data ||
        extra.length ||
        ![iv, tag, data].every((part) => /^[A-Za-z0-9_-]+$/.test(part))
      )
        throw new Error();
      if (
        Buffer.from(iv, 'base64url').length !== 12 ||
        Buffer.from(tag, 'base64url').length !== 16
      )
        throw new Error();
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAAD(
        Buffer.from(
          JSON.stringify(['kestrel-ai-v1', userId, providerId, purpose]),
        ),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return aiError('AI_CREDENTIAL_UNAVAILABLE', 503);
    }
  }
}
