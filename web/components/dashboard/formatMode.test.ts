import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslator } from 'next-intl';
import messages from '../../messages/en.json' with { type: 'json' };
import { formatMode } from './formatMode.ts';

test('mode labels use explicit translators while protocol mode values stay unchanged', () => {
  const t = createTranslator({ locale: 'en', messages, namespace: 'routeModes' });
  for (const [mode, key, label] of [
    ['ONCE', 'once', 'One way'],
    ['LOOP', 'loop', 'Repeat'],
    ['PING_PONG', 'pingPong', 'Back and forth'],
  ] as const) {
    assert.equal(formatMode(mode, t), label);
    assert.equal(
      formatMode(mode, (value) => value),
      key,
    );
  }
});
