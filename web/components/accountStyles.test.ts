import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readStyle = (name: string) =>
  readFileSync(new URL(`../app/${name}.css`, import.meta.url), 'utf8');
const account = readStyle('account-ui');

// Source assertions only: browser computed-style checks remain a separate gate.
function declarations(selector: string, source = account) {
  const blocks = [
    ...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ].filter((match) =>
    match[1]
      .trim()
      .split(',')
      .some((part) => part.trim() === selector),
  );
  assert.ok(blocks.length > 0, `Missing rule: ${selector}`);
  return Object.fromEntries(
    blocks.flatMap((match) =>
      match[2]
        .split(';')
        .filter((part) => part.trim())
        .map((part) => {
          const colon = part.indexOf(':');
          return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
        }),
    ),
  );
}

function media(query: string) {
  const start = account.indexOf(`@media (${query}) {`);
  assert.notEqual(start, -1, `Missing media query: ${query}`);
  const open = account.indexOf('{', start);
  let depth = 1;
  let end = open + 1;
  for (; depth > 0 && end < account.length; end += 1) {
    if (account[end] === '{') depth += 1;
    if (account[end] === '}') depth -= 1;
  }
  assert.equal(depth, 0);
  return account.slice(open + 1, end - 1);
}

test('Account selectors have one stylesheet owner; shared header and controls stay separate', () => {
  const dedicated =
    /\.(?:account-[\w-]+|kc-account-popover|kc-shell-account|android-qr-login[\w-]*|password-field|password-visibility|change-password[\w-]*)\b/;
  for (const name of [
    'globals',
    'redesign',
    'map-workspace',
    'radix-ui',
    'workspace-theme',
    'workspace-ux',
  ]) {
    assert.doesNotMatch(readStyle(name), dedicated, `${name}.css owns an Account rule`);
  }
  assert.match(readStyle('workspace-theme'), /\.workspace-account-chevron\s*\{/);
  assert.match(readStyle('radix-ui'), /\.rt-TextFieldRoot\s*\{/);
  assert.match(readStyle('globals'), /\.button-link\s*\{/);
});

test('Account panels retain the final workspace geometry instead of earlier overrides', () => {
  assert.deepEqual(declarations('.account-security-shell .account-security-panel'), {
    'border-radius': 'var(--workspace-radius)',
    'box-shadow': 'none',
    padding: '20px',
  });
  const shell = declarations('.account-security-shell');
  assert.equal(shell['min-height'], '0');
  assert.equal(shell.padding, '16px clamp(16px, 4vw, 48px) 64px');
  assert.equal(declarations('.kc-shell-account').background, 'var(--workspace-canvas)');
  assert.equal(declarations('.account-security-list').gap, '0');
  assert.equal(declarations('.account-security-row').padding, '12px 0');
  assert.equal(declarations('.account-security-row')['border-top'], '1px solid var(--border)');
  assert.equal(declarations('.account-security-back')['margin-bottom'], '8px');
  assert.equal(
    declarations('.account-security-grid .account-security-sign-in')['grid-column'],
    'auto',
  );
  assert.equal(
    declarations('.account-security-grid .account-security-android-login')['grid-column'],
    'auto',
  );
});

test('Account popover retains the Radix positioning and surface overrides', () => {
  const popup = declarations('.ui-popover-popup.kc-account-popover');
  assert.equal(popup.background, 'var(--paper-card)');
  assert.equal(popup.border, '1px solid var(--border-strong)');
  assert.equal(popup.position, 'relative');
  assert.equal(popup.right, 'auto');
  assert.equal(popup.top, 'auto');
  assert.equal(popup['z-index'], 'auto');
  assert.equal(popup.width, 'min(320px, calc(100vw - 32px))');
  assert.equal(
    declarations('.kc-account-popover', media('prefers-color-scheme: dark'))['border-color'],
    'var(--border)',
  );
  assert.equal(declarations('.kc-account-popover', media('max-width: 639px')).right, '-10px');
});

test('Account responsive rules retain their breakpoints and final narrow-screen values', () => {
  for (const selector of [
    '.account-security-grid',
    '.account-security-confirm',
    '.android-qr-login-layout',
  ]) {
    assert.equal(declarations(selector, media('max-width: 800px'))['grid-template-columns'], '1fr');
  }
  const section = declarations('.account-security-section-header', media('max-width: 767px'));
  assert.equal(section['align-items'], 'center');
  assert.equal(section['flex-direction'], 'row');
  assert.equal(section['flex-wrap'], 'wrap');
  const narrow = media('max-width: 560px');
  assert.equal(declarations('.account-security-row', narrow)['flex-direction'], 'column');
  assert.equal(declarations('.account-security-row button', narrow).width, '100%');
  assert.doesNotMatch(narrow, /\.account-security-shell\s*\{/);
  assert.equal(
    declarations('.account-settings-layout', media('max-width: 640px'))['grid-template-columns'],
    'minmax(0, 1fr)',
  );
});

test('Password inputs retain their Account-specific control reset', () => {
  assert.deepEqual(declarations('.password-field .password-input input.rt-TextFieldInput'), {
    background: 'transparent',
    border: '0',
    'box-shadow': 'none',
    'min-height': '0',
    padding: '0',
  });
  assert.equal(declarations('.password-field .password-visibility').height, '44px');
  assert.equal(
    declarations('.change-password-form .account-security-actions')['justify-content'],
    'flex-start',
  );
});
