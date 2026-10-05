import { createHash } from 'node:crypto';
import { recoverExchangeSessionCredential } from './exchange-session-recovery';

const now = new Date('2026-09-23T10:00:00Z');
const original = 'derived-original';
const successor = 'rotated-successor';
const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const session = {
  createdAt: now,
  expiresAt: new Date(now.getTime() + 60_000),
  id: 'session-1',
  lastUsedAt: now,
  refreshTokenHash: hash(original),
  revokedAt: null,
  rotatedRefreshTokenEncrypted: null,
  user: { id: 'user-1', username: 'alice' },
};

type SessionRecord = Omit<
  typeof session,
  'revokedAt' | 'rotatedRefreshTokenEncrypted'
> & {
  revokedAt: Date | null;
  rotatedRefreshTokenEncrypted: string | null;
};

function fixture(record: SessionRecord | null = session) {
  const findUnique = jest.fn().mockResolvedValue(record);
  const decryptSecret = jest.fn().mockReturnValue(successor);
  const derive = jest.fn().mockReturnValue(original);
  const recover = () =>
    recoverExchangeSessionCredential(
      { session: { findUnique } } as never,
      { decryptSecret } as never,
      'session-1',
      now,
      derive,
    );
  return { decryptSecret, derive, findUnique, recover };
}

describe('exchange-session credential recovery', () => {
  it('returns original token and full session without creating a new one', async () => {
    const { decryptSecret, derive, findUnique, recover } = fixture();
    await expect(recover()).resolves.toEqual({
      session,
      refreshToken: original,
    });
    expect(findUnique).toHaveBeenCalledWith({
      select: {
        createdAt: true,
        expiresAt: true,
        id: true,
        lastUsedAt: true,
        refreshTokenHash: true,
        revokedAt: true,
        rotatedRefreshTokenEncrypted: true,
        user: { select: { id: true, username: true } },
      },
      where: { id: 'session-1' },
    });
    expect(derive).toHaveBeenCalledTimes(1);
    expect(decryptSecret).not.toHaveBeenCalled();
  });

  it('verifies the current successor when the original has rotated', async () => {
    const { decryptSecret, recover } = fixture({
      ...session,
      refreshTokenHash: hash(successor),
      rotatedRefreshTokenEncrypted: 'encrypted',
    });
    await expect(recover()).resolves.toMatchObject({ refreshToken: successor });
    expect(decryptSecret).toHaveBeenCalledWith('encrypted');
  });

  it.each([
    ['missing', null],
    ['revoked', { ...session, revokedAt: now }],
    ['expired at boundary', { ...session, expiresAt: now }],
  ])('rejects %s sessions before derivation', async (_, record) => {
    const { derive, recover } = fixture(record);
    await expect(recover()).resolves.toBeNull();
    expect(derive).not.toHaveBeenCalled();
  });

  it('rejects rotation without ciphertext, decryption errors and wrong successor hash', async () => {
    const noCipher = fixture({ ...session, refreshTokenHash: hash(successor) });
    await expect(noCipher.recover()).resolves.toBeNull();
    expect(noCipher.decryptSecret).not.toHaveBeenCalled();

    const rejected = {
      ...session,
      refreshTokenHash: hash(successor),
      rotatedRefreshTokenEncrypted: 'encrypted',
    };
    const failedDecrypt = fixture(rejected);
    failedDecrypt.decryptSecret.mockImplementation(() => {
      throw new Error('decrypt failed');
    });
    await expect(failedDecrypt.recover()).resolves.toBeNull();

    const wrongHash = fixture({
      ...rejected,
      refreshTokenHash: hash('another-token'),
    });
    await expect(wrongHash.recover()).resolves.toBeNull();
    expect(wrongHash.decryptSecret).toHaveBeenCalledTimes(1);
  });
});
