export type PendingOidcLinkExchange = {
  clientNonce: string;
  exchangeTicket: string;
};

export type OidcLinkCallbackResult =
  | { errorCode: string; type: 'error' }
  | { exchangeTicket: string; type: 'success' }
  | { type: 'invalid' }
  | { type: 'none' };

const LINK_ATTEMPT_STORAGE_KEY = 'kestrel.web.oidc-link-attempt';
const LINK_EXCHANGE_STORAGE_KEY = 'kestrel.web.oidc-link-exchange';
const ATTEMPT_HASH_PATTERN = /^[a-f0-9]{64}$/;
const CLIENT_NONCE_PATTERN = /^[A-Za-z0-9:._-]{16,128}$/;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function createOidcLinkNonce(): string {
  const randomValues = new Uint32Array(4);
  crypto.getRandomValues(randomValues);
  return `link:${Array.from(randomValues, (value) => value.toString(16).padStart(8, '0')).join(
    '',
  )}`;
}

export function saveOidcLinkAttempt(clientNonce: string): void {
  window.sessionStorage.setItem(LINK_ATTEMPT_STORAGE_KEY, clientNonce);
  window.sessionStorage.removeItem(LINK_EXCHANGE_STORAGE_KEY);
}

export function readOidcLinkAttempt(): string | null {
  try {
    const clientNonce = window.sessionStorage.getItem(LINK_ATTEMPT_STORAGE_KEY);
    return clientNonce != null && CLIENT_NONCE_PATTERN.test(clientNonce) ? clientNonce : null;
  } catch {
    return null;
  }
}

export function saveOidcLinkExchange(pending: PendingOidcLinkExchange): boolean {
  try {
    window.sessionStorage.setItem(LINK_EXCHANGE_STORAGE_KEY, JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

export function readOidcLinkExchange(): PendingOidcLinkExchange | null {
  try {
    const serialized = window.sessionStorage.getItem(LINK_EXCHANGE_STORAGE_KEY);
    if (serialized == null) {
      return null;
    }
    const value = JSON.parse(serialized) as Partial<PendingOidcLinkExchange>;
    return typeof value.clientNonce === 'string' &&
      CLIENT_NONCE_PATTERN.test(value.clientNonce) &&
      typeof value.exchangeTicket === 'string' &&
      TICKET_PATTERN.test(value.exchangeTicket)
      ? { clientNonce: value.clientNonce, exchangeTicket: value.exchangeTicket }
      : null;
  } catch {
    return null;
  }
}

export function clearOidcLinkState(): void {
  try {
    window.sessionStorage.removeItem(LINK_ATTEMPT_STORAGE_KEY);
    window.sessionStorage.removeItem(LINK_EXCHANGE_STORAGE_KEY);
  } catch {
    // There is no recoverable state to clear when tab storage is unavailable.
  }
}

export async function parseOidcLinkCallback(
  rawFragment: string,
  clientNonce: string | null,
): Promise<OidcLinkCallbackResult> {
  if (rawFragment === '') {
    return { type: 'none' };
  }
  if (clientNonce == null || !CLIENT_NONCE_PATTERN.test(clientNonce)) {
    return { type: 'invalid' };
  }

  const fragment = new URLSearchParams(rawFragment.replace(/^#/, ''));
  const keys = Array.from(fragment.keys());
  const attemptHashes = fragment.getAll('attempt');
  let expectedHash: string;
  try {
    expectedHash = await hashValue(clientNonce);
  } catch {
    return { type: 'invalid' };
  }
  if (
    attemptHashes.length !== 1 ||
    !ATTEMPT_HASH_PATTERN.test(attemptHashes[0]) ||
    expectedHash !== attemptHashes[0]
  ) {
    return { type: 'invalid' };
  }

  const errors = fragment.getAll('error');
  const tickets = fragment.getAll('ticket');
  if (keys.length === 2 && errors.length === 1 && errors[0] !== '' && tickets.length === 0) {
    return { errorCode: errors[0], type: 'error' };
  }
  if (
    keys.length === 2 &&
    errors.length === 0 &&
    tickets.length === 1 &&
    TICKET_PATTERN.test(tickets[0])
  ) {
    return { exchangeTicket: tickets[0], type: 'success' };
  }
  return { type: 'invalid' };
}

async function hashValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
