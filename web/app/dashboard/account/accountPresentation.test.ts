import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from '@formatjs/icu-messageformat-parser';
import { createTranslator } from 'next-intl';
import type { AuthSessionSummary } from '../../../lib/api.ts';
import { describeSession, formatDate } from './accountPresentation.ts';

const messages = JSON.parse(
  await readFile(new URL('../../../messages/en.json', import.meta.url), 'utf8'),
);

function allMessages(value: Record<string, unknown>): string[] {
  return Object.values(value).flatMap((message) =>
    typeof message === 'string' ? [message] : allMessages(message as Record<string, unknown>),
  );
}

test('Account and Remote source messages are valid ICU', () => {
  const sourceMessages = allMessages({ Account: messages.Account, Remote: messages.Remote });
  assert.ok(sourceMessages.length > 100);
  for (const message of sourceMessages) {
    assert.doesNotThrow(() => parse(message));
  }
});

test('session counts and remote previews use ICU plurals', () => {
  const account = createTranslator({ locale: 'en', messages, namespace: 'Account' });
  const remote = createTranslator({ locale: 'en', messages, namespace: 'Remote' });
  assert.equal(account('showMore', { count: 1 }), 'Show 1 more session');
  assert.equal(account('showMore', { count: 2 }), 'Show 2 more sessions');
  assert.equal(
    remote('preview', { count: 1, distance: '2 km', speed: '5 km/h', mode: 'Once' }),
    '1 waypoint · 2 km · 5 km/h · Once',
  );
  assert.equal(
    remote('preview', { count: 2, distance: '2 km', speed: '5 km/h', mode: 'Once' }),
    '2 waypoints · 2 km · 5 km/h · Once',
  );
});

test('Polish count categories and decimal-comma speed display are locale-dependent', () => {
  const polish = createTranslator({
    locale: 'pl',
    messages: {
      showMore: '{count, plural, one {one #} few {few #} many {many #} other {other #}}',
    },
  });
  assert.equal(polish('showMore', { count: 1 }), 'one 1');
  assert.equal(polish('showMore', { count: 2 }), 'few 2');
  assert.equal(polish('showMore', { count: 5 }), 'many 5');
  const remote = createTranslator({ locale: 'de', messages, namespace: 'Remote' });
  const speedKmh = 12.5;
  assert.equal(remote('speed', { speed: speedKmh }), '12,5 km/h');
  assert.equal(JSON.stringify({ speedKmh }), '{"speedKmh":12.5}');
});

test('date display uses the selected locale and the existing host time zone', () => {
  const value = '2026-10-18T23:30:00.000Z';
  for (const locale of ['en', 'de', 'ja']) {
    assert.equal(
      formatDate(value, locale),
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      ),
    );
  }
  assert.notEqual(formatDate(value, 'en'), formatDate(value, 'de'));
});

test('session descriptions retain stable identifiers for late translation', () => {
  const session = { isCurrent: false, userAgent: 'Kestrel Android' } as AuthSessionSummary;
  assert.equal(describeSession(session), 'android');
  assert.equal(describeSession({ ...session, isCurrent: true }), 'browser');
  assert.equal(describeSession({ ...session, userAgent: null }), 'web');
});

test('device option and failure messages do not use raw remote error details', () => {
  const remote = createTranslator({ locale: 'en', messages, namespace: 'Remote' });
  assert.equal(
    remote('deviceOption', { name: '<device>', status: 'offline', enabled: 'yes' }),
    '<device> — offline, enabled',
  );
  const source = messages.Remote.result.FAILED;
  assert.deepEqual(
    parse(source).filter((element) => element.type !== 0),
    [],
  );
});
