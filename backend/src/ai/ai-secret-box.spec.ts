import { ConfigService } from '../config.service';
import { AiSecretBox } from './ai-secret-box';

const key = 'ab'.repeat(32);
const box = (value: unknown = key) =>
  new AiSecretBox({
    get: (name: string) => (name === 'ENCRYPTION_KEY' ? value : undefined),
  } as unknown as ConfigService);

describe('AiSecretBox', () => {
  it('recovers a secret in a new instance with the same key and random IVs', () => {
    const first = box().encrypt('owner', 'provider', 'api-key', 'secret-秘密');
    const second = box().encrypt('owner', 'provider', 'api-key', 'secret-秘密');
    expect(first.split('.')[1]).not.toBe(second.split('.')[1]);
    expect(first).not.toContain('secret');
    expect(box().decrypt('owner', 'provider', 'api-key', first)).toBe(
      'secret-秘密',
    );
    expect(box().decrypt('owner', 'provider', 'api-key', second)).toBe(
      'secret-秘密',
    );
  });

  it.each([
    ['other', 'provider', 'api-key'],
    ['owner', 'other', 'api-key'],
    ['owner', 'provider', 'oauth'],
  ])('binds owner/provider/purpose: %s %s %s', (owner, provider, purpose) => {
    const encrypted = box().encrypt('owner', 'provider', 'api-key', 'secret');
    expect(() => box().decrypt(owner, provider, purpose, encrypted)).toThrow(
      'AI_CREDENTIAL_UNAVAILABLE',
    );
  });

  it.each([1, 2, 3])('rejects tampering with envelope segment %i', (index) => {
    const parts = box()
      .encrypt('owner', 'provider', 'purpose', 'secret')
      .split('.');
    const bytes = Buffer.from(parts[index], 'base64url');
    bytes[0] ^= 1;
    parts[index] = bytes.toString('base64url');
    expect(() =>
      box().decrypt('owner', 'provider', 'purpose', parts.join('.')),
    ).toThrow('AI_CREDENTIAL_UNAVAILABLE');
  });

  it.each(['', 'v2.a.b.c', 'v1.a.b.c', 'v1.a.b.c.extra', 'v1.!.b.c'])(
    'rejects malformed envelopes: %s',
    (value) => {
      expect(() =>
        box().decrypt('owner', 'provider', 'purpose', value),
      ).toThrow('AI_CREDENTIAL_UNAVAILABLE');
    },
  );

  it.each([
    undefined,
    null,
    '',
    'ab',
    'g'.repeat(64),
    'a'.repeat(63),
    'a'.repeat(65),
  ])('fails closed for unavailable/malformed key %s', (value) => {
    const unavailable = box(value === undefined ? null : value);
    expect(unavailable.available()).toBe(false);
    expect(() => unavailable.encrypt('u', 'p', 'k', 'secret')).toThrow(
      'AI_ENCRYPTION_UNAVAILABLE',
    );
    expect(() => unavailable.decrypt('u', 'p', 'k', 'invalid')).toThrow(
      'AI_ENCRYPTION_UNAVAILABLE',
    );
  });

  it('rejects a different encryption key', () => {
    const encrypted = box().encrypt('u', 'p', 'k', 'secret');
    expect(() =>
      box('cd'.repeat(32)).decrypt('u', 'p', 'k', encrypted),
    ).toThrow('AI_CREDENTIAL_UNAVAILABLE');
  });
});
