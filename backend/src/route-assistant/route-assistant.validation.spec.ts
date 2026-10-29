import { pngCrc } from './route-assistant.png';
import { fixtureInput, fixturePng } from './route-assistant.fixture';
import { validateAssistantPng } from './route-assistant.png';
import { validateAssistantInput } from './route-assistant.validation';

describe('assistant snapshot validation', () => {
  it('accepts a bounded PNG and makes an independent snapshot', () => {
    const input = fixtureInput();
    const result = validateAssistantInput(input, 'user', 'session', 1000000);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });
  it.each(['userId', 'sessionId'])('rejects forged %s', (key) => {
    const input = fixtureInput();
    (input.snapshot.binding as unknown as Record<string, unknown>)[key] =
      'other';
    expect(() =>
      validateAssistantInput(input, 'user', 'session', 1000000),
    ).toThrow('RA_OWNER_MISMATCH');
  });
  it.each([-1, 1.5, NaN])('rejects invalid generations %s', (value) => {
    const input = fixtureInput();
    input.snapshot.binding.draftGeneration = value;
    expect(() =>
      validateAssistantInput(input, 'user', 'session', 1000000),
    ).toThrow();
  });
  it.each([879999, 1005001])('rejects capture age %s', (capturedAt) => {
    const input = fixtureInput();
    input.snapshot.capturedAt = capturedAt;
    expect(() =>
      validateAssistantInput(input, 'user', 'session', 1000000),
    ).toThrow();
  });
  it('rejects inconsistent checks and marker anchors', () => {
    const input = fixtureInput();
    input.snapshot.transform.checks[0].x += 0.1;
    expect(() =>
      validateAssistantInput(input, 'user', 'session', 1000000),
    ).toThrow('RA_INVALID_TRANSFORM');
    input.snapshot.transform.checks[0].x -= 0.1;
    input.snapshot.visibleMarkers[0].u = 0;
    expect(() =>
      validateAssistantInput(input, 'user', 'session', 1000000),
    ).toThrow('RA_INVALID_MARKER');
  });
  it('rejects unsupported pitch and metadata fields', () => {
    const input = fixtureInput();
    input.snapshot.view.pitch = 1;
    expect(() =>
      validateAssistantInput(input, 'user', 'session', 1000000),
    ).toThrow('RA_UNSUPPORTED_VIEW');
    expect(() =>
      validateAssistantInput(
        { ...fixtureInput(), secret: 'x' },
        'user',
        'session',
        1000000,
      ),
    ).toThrow();
  });
});
describe('PNG validation', () => {
  it('rejects non-ASCII chunk types even with a matching CRC', () => {
    const png = Buffer.from(fixturePng(), 'base64');
    png[12] |= 128;
    png.writeUInt32BE(pngCrc(png.subarray(12, 29)), 29);
    expect(() => validateAssistantPng(png.toString('base64'), 20, 20)).toThrow(
      'RA_INVALID_PNG',
    );
  });
  it('bounds chunk metadata overhead independently of decoded pixels', () => {
    const png = Buffer.from(fixturePng(), 'base64');
    const data = Buffer.from('tEXtk\0v');
    const chunk = Buffer.alloc(data.length + 8);
    chunk.writeUInt32BE(3, 0);
    data.copy(chunk, 4);
    chunk.writeUInt32BE(pngCrc(data), data.length + 4);
    const many = Buffer.concat([
      png.subarray(0, 33),
      ...Array<Buffer>(1025).fill(chunk),
      png.subarray(33),
    ]);
    expect(() => validateAssistantPng(many.toString('base64'), 20, 20)).toThrow(
      'RA_INVALID_PNG',
    );
  });
  it('rejects signature, CRC and truncation', () => {
    const png = Buffer.from(fixturePng(), 'base64');
    for (const index of [0, 20, png.length - 1]) {
      const bad = Buffer.from(png);
      bad[index] ^= 255;
      expect(() =>
        validateAssistantPng(bad.toString('base64'), 20, 20),
      ).toThrow('RA_INVALID_PNG');
    }
    expect(() =>
      validateAssistantPng(png.subarray(0, 40).toString('base64'), 20, 20),
    ).toThrow();
  });
  it('rejects oversized encoding and dimensions before inflate', () => {
    expect(() => validateAssistantPng('A'.repeat(2800000), 20, 20)).toThrow();
    expect(() => validateAssistantPng(fixturePng(1601, 1), 1601, 1)).toThrow();
    expect(() => validateAssistantPng(fixturePng(), 21, 20)).toThrow();
  });
  it('bounds inflate memory and rejects invalid filters/short output', () => {
    expect(() =>
      validateAssistantPng(fixturePng(1, 1, Buffer.alloc(100000)), 1, 1),
    ).toThrow();
    expect(() =>
      validateAssistantPng(
        fixturePng(1, 1, Buffer.from([5, 0, 0, 0, 0])),
        1,
        1,
      ),
    ).toThrow();
    expect(() =>
      validateAssistantPng(fixturePng(1, 1, Buffer.alloc(1)), 1, 1),
    ).toThrow();
  });
});
