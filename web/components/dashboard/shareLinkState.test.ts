import assert from 'node:assert/strict';
import test from 'node:test';
import { errorMessage } from '../../i18n/errors.ts';
import { ApiError, type ShareLink } from '../../lib/api.ts';
import { createShareLinkState } from './shareLinkState.ts';

const link: ShareLink = {
  id: 'link',
  publicUrl: '/share/test',
  disabledAt: null,
  createdAt: '2026-10-28',
  updatedAt: '2026-10-28',
  expiresAt: null,
  permission: 'PUBLIC_READ',
  placeId: 'item',
  routeId: null,
  routeRevisionId: null,
  token: 'synthetic',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const requests: { options?: RequestInit; result: ReturnType<typeof deferred<ShareLink>> }[] = [];
  const state = createShareLinkState('/places/item/share-link', async (_path, options) => {
    const result = deferred<ShareLink>();
    requests.push({ options, result });
    return result.promise;
  });
  return { state, requests };
}
async function missing(fixture: ReturnType<typeof setup>) {
  const read = fixture.state.loadShareLink();
  const latest = fixture.requests.at(-1);
  assert.ok(latest);
  latest.result.reject(new ApiError('missing', 404));
  await read;
}

test('unknown, loading, and failed reads cannot create or patch; Retry is GET only', async () => {
  const { state, requests } = setup();
  assert.equal(state.getSnapshot().readState, 'idle');
  await state.createShareLink();
  await state.setDisabled(true);
  assert.equal(requests.length, 0);
  const read = state.loadShareLink();
  assert.equal(state.getSnapshot().readState, 'loading');
  await state.createShareLink();
  requests[0].result.reject(new ApiError('secret response', 503));
  await read;
  assert.equal(state.getSnapshot().readState, 'error');
  assert.equal(state.getSnapshot().canMutate, false);
  state.setError(null);
  await state.createShareLink();
  await state.setDisabled(true);
  assert.equal(requests.length, 1);
  const retry = state.loadShareLink();
  assert.equal(requests[1].options?.method ?? 'GET', 'GET');
  requests[1].result.reject(new ApiError('missing', 404));
  await retry;
  assert.equal(state.getSnapshot().readState, 'ready');
  assert.equal(state.getSnapshot().shareLink, null);
  assert.equal(state.getSnapshot().canMutate, true);
});

for (const outcome of ['success', 'missing', 'error'] as const) {
  test(`older GET ${outcome} cannot erase a successful mutation`, async () => {
    const fixture = setup();
    const { state, requests } = fixture;
    const old = state.loadShareLink();
    await missing(fixture);
    const create = state.createShareLink();
    assert.equal(requests[2].options?.method, 'POST');
    requests[2].result.resolve(link);
    await create;
    if (outcome === 'success') requests[0].result.resolve({ ...link, disabledAt: '2026-10-28' });
    else requests[0].result.reject(new ApiError('late', outcome === 'missing' ? 404 : 503));
    await old;
    assert.equal(state.getSnapshot().shareLink, link);
    assert.equal(state.getSnapshot().failure, null);
    assert.equal(state.getSnapshot().readState, 'ready');
  });
}

test('mutation lock is synchronous, rejects duplicate create/patch and ignores refresh while busy', async () => {
  const fixture = setup();
  const { state, requests } = fixture;
  await missing(fixture);
  const first = state.createShareLink();
  await state.createShareLink();
  await state.setDisabled(true);
  await state.loadShareLink();
  assert.equal(requests.length, 2);
  assert.equal(state.getSnapshot().canMutate, false);
  requests[1].result.resolve(link);
  await first;
  await state.createShareLink();
  assert.equal(requests.length, 2);
  const patch = state.setDisabled(true);
  await state.setDisabled(false);
  assert.equal(requests.length, 3);
  assert.equal(requests[2].options?.method, 'PATCH');
  requests[2].result.resolve({ ...link, disabledAt: '2026-10-28' });
  await patch;
  assert.equal(state.getSnapshot().shareLink?.disabledAt, '2026-10-28');
});

for (const operation of ['read', 'mutation'] as const) {
  test(`cleanup invalidates ${operation} completions, including after reactivation`, async () => {
    const fixture = setup();
    const { state, requests } = fixture;
    if (operation === 'mutation') await missing(fixture);
    const pending = operation === 'read' ? state.loadShareLink() : state.createShareLink();
    state.dispose();
    state.activate();
    const latest = requests.at(-1);
    assert.ok(latest);
    latest.result.resolve(link);
    await pending;
    assert.equal(state.getSnapshot().readState, 'idle');
    assert.equal(state.getSnapshot().shareLink, null);
    assert.equal(state.getSnapshot().isMutating, false);
  });
}

test('external Library setters invalidate reads without treating a cleared link as confirmed missing', async () => {
  const { state, requests } = setup();
  const read = state.loadShareLink();
  state.setIsMutating(true);
  requests[0].result.resolve(link);
  await read;
  state.setIsMutating(false);
  state.setShareLink(null);
  assert.equal(state.getSnapshot().readState, 'idle');
  assert.equal(state.getSnapshot().canMutate, false);
});

test('item/session replacement isolates pending reads and writes from the new owner', async () => {
  const old = setup();
  await missing(old);
  const pending = old.state.createShareLink();
  old.state.dispose();
  const replacement = setup();
  await missing(replacement);
  old.requests[1].result.resolve(link);
  await pending;
  assert.equal(replacement.state.getSnapshot().shareLink, null);
  assert.equal(replacement.state.getSnapshot().readState, 'ready');
  const read = replacement.state.loadShareLink();
  replacement.state.dispose();
  const nextSession = setup();
  replacement.requests[1].result.reject(new ApiError('old session', 503));
  await read;
  assert.equal(nextSession.state.getSnapshot().failure, null);
  assert.equal(nextSession.state.getSnapshot().readState, 'idle');
});

test('failed mutation unlocks busy state but requires read recovery before another write', async () => {
  const fixture = setup();
  await missing(fixture);
  const mutation = fixture.state.createShareLink();
  fixture.requests[1].result.reject(new TypeError('network'));
  await mutation;
  assert.equal(fixture.state.getSnapshot().isMutating, false);
  assert.equal(fixture.state.getSnapshot().readState, 'error');
  await fixture.state.createShareLink();
  assert.equal(fixture.requests.length, 2);
  await missing(fixture);
  assert.equal(fixture.state.getSnapshot().canMutate, true);
});

test('missing scope cannot load or mutate, and errors use safe translation', async () => {
  const state = createShareLinkState(null, async () => {
    throw Error('must not request');
  });
  await state.loadShareLink();
  await state.createShareLink();
  assert.equal(state.getSnapshot().readState, 'idle');
  assert.equal(state.getSnapshot().canMutate, false);
  assert.equal(
    errorMessage(new ApiError('private payload', 503), (key) => key),
    'server',
  );
});
