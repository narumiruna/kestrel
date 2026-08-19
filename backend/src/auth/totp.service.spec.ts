import { InternalServerErrorException } from '../http/errors';
import { ConfigService } from '../config.service';
import { TotpService } from './totp.service';

describe('TotpService', () => {
  beforeEach(() => {
    process.env.AUTH_TOTP_ENCRYPTION_KEY =
      'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
    process.env.AUTH_TOTP_ISSUER = 'Kestrel Test';
  });

  afterEach(() => {
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    delete process.env.AUTH_TOTP_ISSUER;
  });

  it('creates a QR-backed setup payload with an encrypted secret', async () => {
    const totpService = new TotpService(new ConfigService());

    const setup = await totpService.createSetup('alice');

    expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.otpauthUrl).toContain('otpauth://totp/');
    expect(setup.otpauthUrl).toContain('issuer=Kestrel+Test');
    expect(setup.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(setup.encryptedSecret).not.toContain(setup.secret);
    expect(totpService.decryptSecret(setup.encryptedSecret)).toBe(setup.secret);
  });

  it('verifies the current TOTP code within the allowed window', () => {
    const totpService = new TotpService(new ConfigService());
    const secret = 'JBSWY3DPEHPK3PXP';
    const now = new Date('2026-05-09T15:30:00.000Z');
    const currentCode = totpService.generateCode(secret, now);

    expect(totpService.verifyCode(secret, currentCode, now)).toBe(true);
    expect(
      totpService.verifyCode(
        secret,
        currentCode,
        new Date('2026-05-09T15:30:29.000Z'),
      ),
    ).toBe(true);
    expect(
      totpService.verifyCode(
        secret,
        currentCode,
        new Date('2026-05-09T15:31:31.000Z'),
      ),
    ).toBe(false);
  });

  it('rejects invalid encryption key configuration', () => {
    process.env.AUTH_TOTP_ENCRYPTION_KEY = 'short';
    const totpService = new TotpService(new ConfigService());

    expect(() => totpService.encryptSecret('secret')).toThrow(
      InternalServerErrorException,
    );
  });
});
