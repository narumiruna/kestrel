import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parseOidcLinkCallback, saveOidcLinkAttempt } from './oidcLinkState.ts';

const CLIENT_NONCE = 'link:1234567890abcdef1234567890abcdef';
const ATTEMPT_HASH = createHash('sha256').update(CLIENT_NONCE).digest('hex');
const TICKET = 'exchange-ticket-value-1234567890123456';

test('contains unavailable session storage when saving a link attempt', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage: {
        removeItem() {},
        setItem() {
          throw new Error('storage unavailable');
        },
      },
    },
  });

  try {
    assert.equal(saveOidcLinkAttempt(CLIENT_NONCE), false);
  } finally {
    if (originalWindow == null) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', originalWindow);
    }
  }
});

test('parses a callback bound to the pending link attempt', async () => {
  await assert.doesNotReject(async () => {
    assert.deepEqual(
      await parseOidcLinkCallback(`#attempt=${ATTEMPT_HASH}&ticket=${TICKET}`, CLIENT_NONCE),
      { exchangeTicket: TICKET, type: 'success' },
    );
  });
});

test('rejects a callback bound to another browser attempt', async () => {
  assert.deepEqual(
    await parseOidcLinkCallback(
      `#attempt=${createHash('sha256').update('another-attempt').digest('hex')}&ticket=${TICKET}`,
      CLIENT_NONCE,
    ),
    { type: 'invalid' },
  );
});

test('parses provider cancellation and rejects extra fragment values', async () => {
  assert.deepEqual(
    await parseOidcLinkCallback(`#attempt=${ATTEMPT_HASH}&error=access_denied`, CLIENT_NONCE),
    { errorCode: 'access_denied', type: 'error' },
  );
  assert.deepEqual(
    await parseOidcLinkCallback(
      `#attempt=${ATTEMPT_HASH}&ticket=${TICKET}&user=user-1`,
      CLIENT_NONCE,
    ),
    { type: 'invalid' },
  );
});
