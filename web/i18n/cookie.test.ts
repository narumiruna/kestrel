import assert from 'node:assert/strict';
import test from 'node:test';
import { localeCookie } from './config.ts';
import { localeCookieMaxAge, persistLocale, validateLocaleWrite } from './cookie.ts';

test('same-origin HTTPS writes a persistent HttpOnly root cookie', () => {
  const writes: unknown[] = [];
  assert.deepEqual(
    persistLocale('pl', 'https://kestrel.test', 'kestrel.test', 'https', (...args) =>
      writes.push(args),
    ),
    { ok: true },
  );
  assert.deepEqual(writes, [
    [
      localeCookie,
      'pl',
      { httpOnly: true, maxAge: localeCookieMaxAge, path: '/', sameSite: 'lax', secure: true },
    ],
  ]);
  assert.ok(localeCookieMaxAge >= 60 * 60 * 24 * 30);
});
test('HTTP development is supported without a Secure cookie', () => {
  assert.equal(
    validateLocaleWrite('en', 'http://localhost:3301', 'localhost:3301', 'http')?.options.secure,
    false,
  );
});
for (const [origin, host, protocol] of [
  [null, 'kestrel.test', 'https'],
  ['https://evil.test', 'kestrel.test', 'https'],
  ['https://kestrel.test:443', 'kestrel.test', 'https'],
  ['https://kestrel.test/path', 'kestrel.test', 'https'],
  ['https://user:password@kestrel.test', 'kestrel.test', 'https'],
  ['https://kestrel.test', null, 'https'],
  ['https://kestrel.test', 'kestrel.test', 'http'],
  ['null', 'kestrel.test', 'https'],
  ['file://kestrel.test', 'kestrel.test', null],
] as const)
  test(`reject unsafe origin ${origin} / ${host} / ${protocol}`, () => {
    let writes = 0;
    assert.deepEqual(
      persistLocale('ja', origin, host, protocol, () => {
        writes++;
      }),
      { ok: false },
    );
    assert.equal(writes, 0);
  });
test('invalid language and failed cookie writes cannot report success', () => {
  let writes = 0;
  assert.deepEqual(
    persistLocale('../ja', 'https://kestrel.test', 'kestrel.test', 'https', () => {
      writes++;
    }),
    { ok: false },
  );
  assert.equal(writes, 0);
  assert.deepEqual(
    persistLocale('ja', 'https://kestrel.test', 'kestrel.test', 'https', () => {
      throw new Error('read only cookies');
    }),
    { ok: false },
  );
});
