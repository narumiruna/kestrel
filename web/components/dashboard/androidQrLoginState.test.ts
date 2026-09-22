import assert from 'node:assert/strict';
import test from 'node:test';
import {
  effectiveAndroidLoginStatus,
  formatAndroidLoginTimeRemaining,
  secondsUntilAndroidLoginExpiry,
  shouldPollAndroidLogin,
} from './androidQrLoginState.ts';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');

test('expires active attempts at their local deadline', () => {
  assert.equal(effectiveAndroidLoginStatus('claimed', '2026-09-23T11:59:59.000Z', NOW), 'expired');
  assert.equal(
    effectiveAndroidLoginStatus('approved', '2026-09-23T12:00:01.000Z', NOW),
    'approved',
  );
});

test('keeps terminal server states terminal regardless of the deadline', () => {
  assert.equal(
    effectiveAndroidLoginStatus('consumed', '2026-09-23T11:59:59.000Z', NOW),
    'consumed',
  );
  assert.equal(effectiveAndroidLoginStatus('denied', '2026-09-23T12:01:00.000Z', NOW), 'denied');
});

test('polls only non-terminal attempt states', () => {
  assert.equal(shouldPollAndroidLogin('pending'), true);
  assert.equal(shouldPollAndroidLogin('claimed'), true);
  assert.equal(shouldPollAndroidLogin('approved'), true);
  assert.equal(shouldPollAndroidLogin('consumed'), false);
  assert.equal(shouldPollAndroidLogin('denied'), false);
  assert.equal(shouldPollAndroidLogin('expired'), false);
});

test('formats a bounded countdown', () => {
  assert.equal(secondsUntilAndroidLoginExpiry('2026-09-23T12:01:01.000Z', NOW), 61);
  assert.equal(secondsUntilAndroidLoginExpiry('2026-09-23T11:59:00.000Z', NOW), 0);
  assert.equal(formatAndroidLoginTimeRemaining(61), '1:01');
});
