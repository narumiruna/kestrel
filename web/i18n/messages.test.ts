import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from '@formatjs/icu-messageformat-parser';
import { createTranslator } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import english from '../messages/en.json' with { type: 'json' };
import { loadMessages, mergeMessages } from './messages.ts';
import { resolveLocaleMessages } from './resolve.ts';

test('nested runtime fallback retains English without keys or empty text', () => {
  const fallback = { Page: { title: 'Title', help: 'Help' }, plain: 'Plain' };
  const translated = JSON.parse(
    '{"Page":{"title":"Titel","help":""},"plain":null,"unknown":"ignored","__proto__":{"polluted":true}}',
  );
  const merged = mergeMessages(fallback, translated);
  assert.deepEqual(merged, { Page: { title: 'Titel', help: 'Help' }, plain: 'Plain' });
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  assert.deepEqual(
    mergeMessages(fallback, { Page: 'bad namespace', plain: { bad: 'shape' } }),
    fallback,
  );
});
test('all English messages are nonempty valid ICU with only safe rich markers', () => {
  let count = 0;
  function walk(value: unknown, path: string) {
    if (typeof value === 'string') {
      assert.ok(value.trim(), path);
      assert.doesNotThrow(() => parse(value), path);
      assert.ok(!/<\/?(?!strong\b)[a-z]/i.test(value), path);
      count++;
    } else {
      assert.ok(value && typeof value === 'object', path);
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
    }
  }
  walk(english, '');
  assert.ok(count > 600, `broad catalog expected, found ${count}`);
});
test('first use ignores browser languages and concurrent requests do not share locale state', async () => {
  const [first, japanese, invalid, polish] = await Promise.all([
    resolveLocaleMessages(undefined),
    resolveLocaleMessages('ja'),
    resolveLocaleMessages('zh-CN'),
    resolveLocaleMessages('pl-PL'),
  ]);
  assert.equal(first.locale, 'en');
  assert.equal(invalid.locale, 'en');
  assert.equal(japanese.locale, 'ja');
  assert.equal(polish.locale, 'pl');
  assert.equal(first.messages.Language.label, english.Language.label);
  assert.deepEqual(await loadMessages('../../secrets'), english);
});
test('server document, metadata and provider use the same request config without locale routes', async () => {
  const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const request = await readFile(new URL('./request.ts', import.meta.url), 'utf8');
  assert.match(layout, /lang=\{locale\}/);
  assert.match(layout, /<I18nProvider locale=\{locale\} messages=\{messages\}/);
  assert.match(layout, /getTranslations\('Metadata'\)/);
  assert.match(request, /cookies\(\)/);
  assert.ok(!request.includes('accept-language'));
  assert.ok(!layout.includes('key={locale}'));
  const selector = await readFile(
    new URL('../components/LanguageSelector.tsx', import.meta.url),
    'utf8',
  );
  assert.match(selector, /router.refresh\(\)/);
  assert.match(selector, /placeholder=\{localeNames\[locale\]\}/);
  assert.ok(!selector.includes('window.location'));
  assert.ok(!selector.includes('logout'));
});
test('missing runtime messages use a human fallback and interpolated user data stays escaped', () => {
  const fallback = createTranslator({
    locale: 'en',
    messages: english,
    onError: () => {},
    getMessageFallback: () => english.Framework.messageUnavailable,
  });
  // @ts-expect-error Deliberate invalid key proves both typed checking and runtime fallback.
  assert.equal(fallback('missingKey'), english.Framework.messageUnavailable);
  const rich = createTranslator({ locale: 'en', messages: english, namespace: 'AndroidLogin' });
  const html = renderToStaticMarkup(
    createElement(
      'p',
      null,
      rich.rich('scanned', {
        device: '<script>secret</script>',
        strong: (children) => createElement('strong', null, children),
      }),
    ),
  );
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
test('plural messages use selected locale plural rules, including Polish', () => {
  const en = createTranslator({ locale: 'en', messages: english, namespace: 'SharedItem' });
  const pl = createTranslator({
    locale: 'pl',
    messages: {
      SharedItem: {
        waypoints:
          '{count, plural, one {# punkt} few {# punkty} many {# punktów} other {# punktu}}',
      },
    },
    namespace: 'SharedItem',
  });
  assert.equal(en('waypoints', { count: 1 }), '1 waypoint');
  assert.equal(en('waypoints', { count: 2 }), '2 waypoints');
  assert.equal(pl('waypoints', { count: 1 }), '1 punkt');
  assert.equal(pl('waypoints', { count: 2 }), '2 punkty');
  assert.equal(pl('waypoints', { count: 5 }), '5 punktów');
  assert.equal(pl('waypoints', { count: 1.5 }), '1,5 punktu');
});
