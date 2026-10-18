import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  androidDirectory,
  androidFormatSignature,
  flattenMessages,
  icuSignature,
  parseAndroidCatalog,
  parseJsonCatalog,
  parseXml,
  pluralCategories,
  validateAndroidCatalog,
  validateLocales,
  validateProject,
  validateWebCatalog,
} from './check-i18n.mjs';

// Contract oracle from the approved plan, not a runtime locale registry.
const contract = [
  ['zh-TW', 'values-zh-rTW'],
  ['en', 'values'],
  ['ja', 'values-ja'],
  ['ko', 'values-ko'],
  ['hi', 'values-hi'],
  ['es', 'values-es'],
  ['fr', 'values-fr'],
  ['pt', 'values-pt'],
  ['id', 'values-in'],
  ['de', 'values-de'],
  ['vi', 'values-vi'],
  ['tr', 'values-tr'],
  ['fil', 'values-b+fil'],
  ['th', 'values-th'],
  ['it', 'values-it'],
  ['pl', 'values-pl'],
  ['ms', 'values-ms'],
  ['nl', 'values-nl'],
];

const xml = (content) => `<resources>${content}</resources>`;
const string = (value, attributes = '') =>
  `<string name="greeting" ${attributes}>${value}</string>`;
const android = (value, attributes = '') => parseAndroidCatalog(xml(string(value, attributes)));
const plural = (locale, argument = '%1$d') =>
  parseAndroidCatalog(
    xml(
      `<plurals name="count">${pluralCategories(locale, 'cardinal', 'android')
        .map((category) => `<item quantity="${category}">${argument} ${category}</item>`)
        .join('')}</plurals>`,
    ),
  );
const icuPlural = (locale, type = 'cardinal') =>
  `{count, ${type === 'ordinal' ? 'selectordinal' : 'plural'}, ${pluralCategories(locale, type)
    .map((category) => `${category} {# ${category}}`)
    .join(' ')}}`;

test('client metadata and Android qualifiers match the exact ordered 18-language contract', async () => {
  const { locales, defaultLocale, localeNames } = await import('../web/i18n/config.ts');
  assert.equal(defaultLocale, 'en');
  assert.deepEqual(Object.keys(localeNames).sort(), contract.map(([locale]) => locale).sort());
  assert.ok(
    Object.values(localeNames).every((name) => typeof name === 'string' && name.trim().length > 0),
  );
  assert.deepEqual(
    [...locales],
    contract.map(([locale]) => locale),
  );
  validateLocales(locales);
  assert.deepEqual(
    locales.map((locale) => [locale, androidDirectory(locale)]),
    contract,
  );
});

test('invalid, duplicate, aliased and noncanonical locale identifiers fail', () => {
  for (const locales of [
    [],
    ['ja'],
    ['en', 'en'],
    ['en', 'xx'],
    ['en', 'zh-tw'],
    ['en', 'in'],
    ['en', 'pt_BR'],
  ]) {
    assert.throws(() => validateLocales(locales));
  }
});

test('JSON grammar, duplicate keys and invalid/empty namespace or message keys fail', () => {
  for (const text of [
    '{"a":"x",}',
    '{"a":"x","a":"y"}',
    '{"a":{"b":"x","b":"y"}}',
    '{"\\u0061":"x","a":"y"}',
  ]) {
    assert.throws(() => parseJsonCatalog(text));
  }
  for (const catalog of [
    { '': 'x' },
    { 'a.b': 'x' },
    { ' a': 'x' },
    { '1a': 'x' },
    {},
    { a: {} },
    { a: [] },
    { a: null },
    { a: '  ' },
    { a: 42 },
  ]) {
    assert.throws(() => flattenMessages(catalog));
  }
  assert.throws(() => flattenMessages(JSON.parse('{"__proto__":"x"}')));
  assert.deepEqual(
    [...flattenMessages(parseJsonCatalog('{"a":{"b":"Hello {name}"}}')).keys()],
    ['a.b'],
  );
});

test('Web complete keys and argument names/types are required without runtime fallback', () => {
  const source = { greeting: 'Hello {name}', count: 'Total: {count, number}' };
  assert.deepEqual(
    validateWebCatalog(
      source,
      { greeting: 'Bonjour {name}', count: 'Total : {count, number}' },
      'fr',
    ),
    [],
  );
  for (const target of [
    { greeting: 'Bonjour {name}' },
    { ...source, extra: 'Supplément' },
    { greeting: 'Bonjour {person}', count: '{count, number}' },
    { greeting: 'Bonjour {name}', count: '{count}' },
    { greeting: 'Bonjour', count: '{count, number}' },
    { greeting: ' ', count: '{count, number}' },
    source,
  ])
    assert.throws(() => validateWebCatalog(source, target, 'fr'));
});

test('shared English terms are reported, not exempted or automatically rejected', () => {
  const source = { brand: 'Kestrel', greeting: 'Hello' };
  assert.deepEqual(validateWebCatalog(source, { brand: 'Kestrel', greeting: 'Bonjour' }, 'fr'), [
    'brand',
  ]);
  const english = parseAndroidCatalog(
    xml(`<string name="brand">Kestrel</string>${string('Hello')}`),
  );
  const target = parseAndroidCatalog(
    xml(`<string name="brand">Kestrel</string>${string('Bonjour')}`),
  );
  assert.deepEqual(validateAndroidCatalog(english, target, 'fr'), ['string/brand']);
});

test('real ICU parsing rejects malformed messages, skeletons, tags and duplicate selectors', () => {
  for (const message of [
    'Hello {name',
    '{count, broken}',
    '{count, plural, one {one}}',
    '{count, plural, one {x} one {y} other {z}}',
    '{count, number, ::invalid-skeleton}',
    '{count, number, ::percent invalid-skeleton}',
    '{count, number, ::currency/INVALID}',
    '{count, number, nonsense}',
    '{date, date, nonsense}',
    '<strong class="unsafe">Hello</strong>',
    '<script>Hello</script>',
    '<b>Hello</i>',
    '{count, plural, one {} other {#}}',
    '{count, plural, one {  } other {#}}',
  ])
    assert.throws(() => icuSignature(message, 'en'), message);
  assert.doesNotThrow(() => icuSignature("Don't expose '{name}' — {name}", 'en'));
  for (const message of [
    '{n, number, integer}',
    '{n, number, ::currency/USD}',
    '{date, date, short}',
    '{date, date, ::yyyyMMdd}',
  ]) {
    assert.doesNotThrow(() => icuSignature(message, 'en'));
  }
});

test('controlled React rich placeholders preserve source tags and nested arguments', () => {
  const source = { scanned: 'Scanned by <strong>{device}</strong>.' };
  assert.deepEqual(
    validateWebCatalog(source, { scanned: 'Scanné par <strong>{device}</strong>.' }, 'fr'),
    [],
  );
  for (const scanned of [
    'Scanné par {device}.',
    'Scanné par <strong>{person}</strong>.',
    'Scanné par <script>{device}</script>.',
    'Scanné par <strong onclick="unsafe">{device}</strong>.',
  ])
    assert.throws(() => validateWebCatalog(source, { scanned }, 'fr'));
  assert.throws(() =>
    validateWebCatalog({ label: 'Device' }, { label: '<strong>Appareil</strong>' }, 'fr'),
  );
});

test('ICU cardinal/ordinal categories, nested arguments, exact branches and offsets are validated', () => {
  const source = { count: icuPlural('en') };
  assert.doesNotThrow(() => validateWebCatalog(source, { count: icuPlural('pl') }, 'pl'));
  assert.throws(
    () => validateWebCatalog(source, { count: icuPlural('en') }, 'pl'),
    /missing pl cardinal plural category/,
  );
  assert.throws(
    () => icuSignature('{count, plural, one {one} few {few} other {#}}', 'en'),
    /invalid en plural category few/,
  );
  assert.throws(
    () => validateWebCatalog(source, { count: icuPlural('en', 'ordinal') }, 'en'),
    /arguments\/types/,
  );
  assert.throws(
    () =>
      validateWebCatalog(
        source,
        { count: icuPlural('en').replace('plural,', 'plural, offset:1') },
        'en',
      ),
    /arguments\/types/,
  );
  assert.throws(
    () =>
      validateWebCatalog(
        source,
        { count: icuPlural('en').replace('plural,', 'plural, =0 {none}') },
        'en',
      ),
    /arguments\/types/,
  );
  assert.throws(
    () =>
      validateWebCatalog(
        { a: '{kind, select, home {Home {name}} other {Other {name}}}' },
        { a: '{kind, select, work {Work {user}} other {Other {user}}}' },
        'en',
      ),
    /arguments\/types/,
  );
  for (const [locale] of contract) {
    assert.doesNotThrow(() => icuSignature(icuPlural(locale), locale));
    assert.doesNotThrow(() => icuSignature(icuPlural(locale, 'ordinal'), locale));
  }
  assert.deepEqual(pluralCategories('pl', 'cardinal', 'android'), ['few', 'many', 'one', 'other']);
});

test('XML grammar, entities, duplicate keys, bad quantities and empty messages fail', () => {
  for (const text of [
    '<resources><string name="a">x</resources>',
    '<resources><string name="a">&unknown;</string></resources>',
    '<resources><string name="a" name="b">x</string></resources>',
    '<!DOCTYPE resources [<!ENTITY x "bad">]><resources/>',
    xml(string('x') + string('y')),
    xml(string(' ')),
    xml('<string name="Bad key">x</string>'),
    xml('<plurals name="count"><item quantity="singular">one</item></plurals>'),
    xml(
      '<plurals name="count"><item quantity="other">x</item><item quantity="other">y</item></plurals>',
    ),
    xml('<string-array name="names"/>'),
  ])
    assert.throws(() => parseAndroidCatalog(text), text);
  assert.doesNotThrow(() =>
    parseXml(
      '<resources><string name="a">Rock &amp; roll <![CDATA[<literal>]]></string></resources>',
    ),
  );
  assert.equal(android('Hi <b>%1$s</b>').get('string/greeting').items.get('value'), 'Hi %1$s');
});

test('Android nontranslatable source exclusions cannot hide missing translations', () => {
  const source = parseAndroidCatalog(
    xml(`${string('Hello %1$s')}<string name="brand" translatable="false">Kestrel</string>`),
  );
  assert.deepEqual(validateAndroidCatalog(source, android('Bonjour %1$s'), 'fr'), []);
  assert.throws(() => validateAndroidCatalog(source, android('Hello %1$s'), 'fr'), /English copy/);
  assert.throws(
    () => validateAndroidCatalog(source, android('Bonjour %1$s', 'translatable="false"'), 'fr'),
    /translatable=false/,
  );
  assert.throws(
    () => validateAndroidCatalog(source, parseAndroidCatalog('<resources/>'), 'fr'),
    /missing/,
  );
  assert.throws(
    () => validateAndroidCatalog(source, android('@string/english_greeting'), 'fr'),
    /aliases/,
  );
  assert.throws(
    () => validateAndroidCatalog(source, android('Bonjour %1$s', 'formatted="false"'), 'fr'),
    /formatted/,
  );
  assert.throws(
    () =>
      validateAndroidCatalog(
        source,
        parseAndroidCatalog(
          xml(`${string('Bonjour %1$s')}<string name="extra" translatable="false">extra</string>`),
        ),
        'fr',
      ),
    /unexpected/,
  );
});

test('Android format signatures preserve positional names/types, escapes and relative indexes', () => {
  assert.deepEqual([...androidFormatSignature('%2$d — %1$s (%<s) %% %n')].sort(), [
    '1:string',
    '2:integer',
  ]);
  assert.deepEqual([...androidFormatSignature('%1$.2f %2$tF')], ['1:float', '2:date']);
  assert.deepEqual(
    [...androidFormatSignature('%1$05d %2$-8.2S %3$#x %4$E')],
    ['1:integer', '2:string', '3:integer', '4:float'],
  );
  assert.deepEqual([...androidFormatSignature('100% literal', false)], []);
  for (const message of [
    '%0$s',
    '%<s',
    '%1$<s',
    '%q',
    '%1$tq',
    '%1$',
    '%1$d %2$',
    '%1$D',
    '%1$O',
    '%1$F',
    '%1$+s',
    '%1$0s',
    '%1$--10s',
    '%1$-s',
    '%1$.2d',
    '%1$#d',
    '%5n',
    '%1$-05d',
    '%1$+ d',
  ]) {
    assert.throws(() => androidFormatSignature(message), message);
  }
  for (const message of ['Bonjour %2$s', 'Bonjour %1$d', 'Bonjour', 'Bonjour %1$s %2$d']) {
    assert.throws(
      () => validateAndroidCatalog(android('Hello %1$s'), android(message), 'fr'),
      /format arguments\/types/,
    );
  }
});

test('Android plurals use integer categories and string arrays preserve item completeness', () => {
  assert.doesNotThrow(() => validateAndroidCatalog(plural('en'), plural('pl'), 'pl'));
  assert.throws(
    () => validateAndroidCatalog(plural('en'), plural('en'), 'pl'),
    /plural categories/,
  );
  assert.throws(
    () => validateAndroidCatalog(plural('en'), plural('pl', '%1$s'), 'pl'),
    /arguments\/types/,
  );
  const array = (items) =>
    parseAndroidCatalog(
      xml(
        `<string-array name="names">${items.map((item) => `<item>${item}</item>`).join('')}</string-array>`,
      ),
    );
  assert.doesNotThrow(() =>
    validateAndroidCatalog(array(['First', 'Second']), array(['Premier', 'Second']), 'fr'),
  );
  assert.throws(
    () => validateAndroidCatalog(array(['First', 'Second']), array(['Premier']), 'fr'),
    /items/,
  );
});

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'kestrel-i18n-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  async function put(path, content) {
    await mkdir(join(directory, path, '..'), { recursive: true });
    await writeFile(join(directory, path), content);
  }
  await put(
    'web/messages/en.json',
    JSON.stringify({ greeting: 'Hello {name}', count: 'Total {count, number}' }),
  );
  await put(
    'web/messages/fr.json',
    JSON.stringify({ greeting: 'Bonjour {name}', count: 'Total : {count, number}' }),
  );
  await put('app/src/main/res/values/strings.xml', xml(string('Hello %1$s')));
  // Keep source and target messages in multiple files to test merged-resource coverage.
  await put(
    'app/src/main/res/values/errors.xml',
    xml(
      '<string name="failure">Failed %1$d</string><string name="brand" translatable="false">Kestrel</string>',
    ),
  );
  await put('app/src/main/res/values-fr/strings.xml', xml(string('Bonjour %1$s')));
  await put(
    'app/src/main/res/values-fr/errors.xml',
    xml('<string name="failure">Échec %1$d</string>'),
  );
  await put(
    'app/src/main/AndroidManifest.xml',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:localeConfig="@xml/locales_config"/></manifest>',
  );
  await put(
    'app/src/main/res/xml/locales_config.xml',
    '<locale-config xmlns:android="http://schemas.android.com/apk/res/android"><locale android:name="en"/><locale android:name="fr"/></locale-config>',
  );
  return { directory, put, run: () => validateProject(directory, ['en', 'fr']) };
}

test('complete fixture passes without fallback or undeclared files', async (t) => {
  const { run } = await fixture(t);
  assert.deepEqual(await run(), { errors: [], identical: [] });
});

test('missing locale catalogs and missing resource fragments fail the project gate', async (t) => {
  const { directory, run } = await fixture(t);
  await rm(join(directory, 'app/src/main/res/values-fr/errors.xml'));
  assert.match((await run()).errors.join('\n'), /missing \[string\/failure\]/);
  await rm(join(directory, 'web/messages/fr.json'));
  assert.match((await run()).errors.join('\n'), /missing \[fr.json\]/);
  await rm(join(directory, 'app/src/main/res/values-fr'), { recursive: true });
  assert.match((await run()).errors.join('\n'), /fr Android: ENOENT/);
});

test('extra locale catalogs, duplicate resource files and wrong Android mappings fail', async (t) => {
  const { put, run } = await fixture(t);
  await put('web/messages/pt-BR.json', '{"greeting":"Olá"}');
  await put('app/src/main/res/values-fr/duplicate.xml', xml(string('Dupliqué %1$s')));
  await put('app/src/main/res/values-en/strings.xml', xml(string('Fallback %1$s')));
  const errors = (await run()).errors.join('\n');
  assert.match(errors, /unexpected \[pt-BR.json\]/);
  assert.match(errors, /unexpected Android catalog directory: values-en/);
});

test('duplicate Android resources across files and invalid locale metadata fail', async (t) => {
  const { put, run } = await fixture(t);
  await put('app/src/main/res/values-fr/duplicate.xml', xml(string('Dupliqué %1$s')));
  await put(
    'app/src/main/res/xml/locales_config.xml',
    '<locale-config xmlns:android="http://schemas.android.com/apk/res/android"><locale android:name="en"/><locale android:name="pt-BR"/></locale-config>',
  );
  const errors = (await run()).errors.join('\n');
  assert.match(errors, /duplicate Android resource/);
  assert.match(errors, /Android supported locale metadata.*missing \[fr\].*unexpected \[pt-BR\]/);
});
