import assert from 'node:assert/strict';
import test from 'node:test';
import { isSupportedLocale, localeNames, locales, normalizeLocale } from './config.ts';

test('the exact 18 canonical languages have stable native and English labels', () => {
  assert.deepEqual(locales, [
    'zh-TW',
    'en',
    'ja',
    'ko',
    'hi',
    'es',
    'fr',
    'pt',
    'id',
    'de',
    'vi',
    'tr',
    'fil',
    'th',
    'it',
    'pl',
    'ms',
    'nl',
  ]);
  assert.deepEqual(Object.keys(localeNames), [...locales]);
  for (const locale of locales) {
    assert.equal(normalizeLocale(locale), locale);
    assert.equal(isSupportedLocale(locale), true);
    assert.ok(localeNames[locale].length > 0);
  }
});
for (const [input, expected] of [
  ['PT-br', 'pt'],
  ['es-MX', 'es'],
  ['EN-us', 'en'],
  ['in-ID', 'id'],
  ['iw', 'en'],
  ['zh-TW', 'zh-TW'],
  ['zh-Hant', 'zh-TW'],
  ['zh-hant-HK', 'zh-TW'],
  ['zh-TW-u-nu-latn', 'zh-TW'],
  ['zh', 'en'],
  ['zh-CN', 'en'],
  ['zh-Hans-TW', 'en'],
  ['tr-TR', 'tr'],
  ['pl-PL', 'pl'],
  ['fr-CA', 'fr'],
  ['de-DE', 'de'],
  ['ja-JP', 'ja'],
  ['../../ja', 'en'],
  ['invalid_locale', 'en'],
  ['', 'en'],
  ['  vi-VN  ', 'vi'],
  [null, 'en'],
  [undefined, 'en'],
  [42, 'en'],
] as const)
  test(`normalize ${String(input)}`, () => assert.equal(normalizeLocale(input), expected));

test('only canonical choices are accepted by the cookie writer', () => {
  for (const value of ['en-US', 'pt-BR', 'EN', 'zh-Hant', '', 'ar', null, {}])
    assert.equal(isSupportedLocale(value), false);
});
