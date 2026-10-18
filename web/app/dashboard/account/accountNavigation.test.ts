import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAccountNavigation } from './accountNavigation.ts';

const base = 'https://kestrel.test/dashboard/account';

test('account settings defaults to Preferences and accepts category targets', () => {
  for (const hash of ['', '#preferences', '#unknown', '#%E0%A4%A']) {
    const navigation = resolveAccountNavigation(new URL(`${base}${hash}`));
    assert.equal(navigation.section, 'preferences');
    assert.equal(navigation.target, 'preferences');
    assert.equal(navigation.linked, false);
  }
  assert.equal(resolveAccountNavigation(new URL(`${base}#security`)).section, 'security');
});

test('legacy security links resolve to Security before scrolling to the heading', () => {
  for (const target of ['sign-in-heading', 'sessions-heading', 'devices-heading']) {
    const navigation = resolveAccountNavigation(new URL(`${base}#${target}`));
    assert.equal(navigation.section, 'security');
    assert.equal(navigation.target, target);
    assert.equal(navigation.href, `/dashboard/account#${target}`);
  }
});

test('OIDC success selects Security and consumes only the OIDC query parameter', () => {
  const url = new URL(`${base}?oidc=linked&keep=one&keep=two#preferences`);
  const navigation = resolveAccountNavigation(url);
  assert.equal(navigation.section, 'security');
  assert.equal(navigation.target, 'security');
  assert.equal(navigation.linked, true);
  assert.equal(navigation.href, '/dashboard/account?keep=one&keep=two#security');
  assert.equal(url.searchParams.get('oidc'), 'linked', 'resolution must not mutate its input');
  const reloaded = resolveAccountNavigation(new URL(navigation.href, base));
  assert.equal(reloaded.section, 'security');
  assert.equal(reloaded.linked, false);
});

test('non-success OIDC parameters and selected category survive navigation and refresh', () => {
  for (const hash of ['#preferences', '#security', '#sessions-heading']) {
    const url = new URL(`${base}?oidc=cancelled&keep=one${hash}`);
    const initial = resolveAccountNavigation(url);
    assert.equal(initial.linked, false);
    assert.equal(initial.href, `${url.pathname}${url.search}${url.hash}`);
    assert.deepEqual(resolveAccountNavigation(new URL(initial.href, base)), initial);
  }
});
