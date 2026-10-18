import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslator } from 'next-intl';
import { ApiError } from '../lib/api.ts';
import english from '../messages/en.json' with { type: 'json' };
import { errorMessage, getErrorKey } from './errors.ts';

for (const [status, key] of [
  [400, 'validation'],
  [401, 'unauthorized'],
  [403, 'forbidden'],
  [404, 'notFound'],
  [409, 'conflict'],
  [410, 'expired'],
  [422, 'validation'],
  [429, 'rateLimited'],
  [503, 'server'],
  [418, 'http'],
] as const) {
  test(`safe HTTP ${status} fallback`, () =>
    assert.equal(getErrorKey(new ApiError('secret payload', status)), key));
}
test('known codes override status without comparing prose', () => {
  assert.equal(
    getErrorKey(new ApiError('anything', 400, 'SYNC_CURSOR_EXPIRED')),
    'syncCursorExpired',
  );
  assert.equal(
    getErrorKey(new ApiError('anything', 409, 'CLIENT_MUTATION_ID_REUSED')),
    'mutationReused',
  );
  assert.equal(
    getErrorKey(new ApiError('anything', 403, 'reauthentication_required')),
    'reauthenticationRequired',
  );
  assert.equal(
    getErrorKey(new ApiError('anything', 409, 'AUTHENTICATION_SUPERSEDED')),
    'authenticationSuperseded',
  );
  assert.equal(getErrorKey(new ApiError('anything', 400, 'UNKNOWN_CODE')), 'validation');
});
test('uncoded, network and unknown errors never expose exception prose', () => {
  assert.equal(getErrorKey(new TypeError('secret URL')), 'network');
  assert.equal(getErrorKey(new Error('secret body')), 'unexpected');
  const t = createTranslator({ locale: 'en', messages: english, namespace: 'Errors' });
  for (const failure of [
    new Error('<script>secret</script>'),
    { message: 'secret' },
    'secret',
    new ApiError('secret', 418, 'unknown'),
  ]) {
    const display = errorMessage(failure, t);
    assert.ok(display.length > 0);
    assert.ok(!display.includes('secret'));
    assert.ok(!display.includes('Errors.'));
  }
});
test('a retained failure translates late after a language change', () => {
  const failure = new ApiError('do not show', 429);
  const en = createTranslator({ locale: 'en', messages: english, namespace: 'Errors' });
  const pl = createTranslator({
    locale: 'pl',
    messages: { Errors: { ...english.Errors, rateLimited: 'Za dużo prób.' } },
    namespace: 'Errors',
  });
  assert.equal(errorMessage(failure, en), english.Errors.rateLimited);
  assert.equal(errorMessage(failure, pl), 'Za dużo prób.');
});
