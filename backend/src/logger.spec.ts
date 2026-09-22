import pino from 'pino';
import { REDACTED_PATHS } from './logger';

describe('logger redaction', () => {
  it('censors Android QR credentials and payloads at top level and one level deep', () => {
    let output = '';
    const destination = {
      write: (chunk: string) => {
        output += chunk;
      },
    };
    const testLogger = pino(
      {
        redact: { censor: '[REDACTED]', paths: REDACTED_PATHS },
      },
      destination,
    );

    testLogger.info({
      nested: {
        qrCodeDataUrl: 'data:image/png;base64,secret-image',
        qrSecret: 'nested-qr-secret',
        verifier: 'nested-verifier',
        verifierChallenge: 'nested-challenge',
      },
      qrCodeDataUrl: 'data:image/png;base64,top-level-image',
      qrSecret: 'top-level-qr-secret',
      verifier: 'top-level-verifier',
      verifierChallenge: 'top-level-challenge',
    });

    expect(output).toContain('[REDACTED]');
    for (const secret of [
      'secret-image',
      'nested-qr-secret',
      'nested-verifier',
      'nested-challenge',
      'top-level-image',
      'top-level-qr-secret',
      'top-level-verifier',
      'top-level-challenge',
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});
