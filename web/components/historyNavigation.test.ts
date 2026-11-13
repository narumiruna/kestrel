import assert from 'node:assert/strict';
import test from 'node:test';
import { createHistoryNavigation } from './historyNavigation.ts';

function fixture() {
  const entries = [{ state: { __NA: true, tree: 'library' }, url: '/dashboard/library' }];
  let index = 0;
  const queue: number[] = [];
  const passed: string[] = [];
  const confirmations: Array<() => void> = [];
  let dirty = false;
  const history = {
    get state() {
      return entries[index].state;
    },
    pushState(state: object, _unused: string, url?: string | URL | null) {
      entries.splice(index + 1);
      entries.push({ state: state as (typeof entries)[number]['state'], url: String(url) });
      index++;
    },
    replaceState(state: object, _unused: string, url?: string | URL | null) {
      entries[index] = {
        state: state as (typeof entries)[number]['state'],
        url: url == null ? entries[index].url : String(url),
      };
    },
    go(delta: number) {
      queue.push(delta);
    },
  };
  const nativePush = history.pushState;
  const navigation = createHistoryNavigation(
    history,
    () => dirty,
    (proceed) => confirmations.push(proceed),
  );
  function flush(afterEvent?: () => void) {
    let attempts = 0;
    while (queue.length) {
      assert.ok(attempts++ < 10, 'history must not loop');
      const destination = index + (queue.shift() ?? 0);
      if (destination < 0 || destination >= entries.length) continue;
      index = destination;
      let stopped = false;
      navigation.handlePopState({
        state: history.state,
        stopImmediatePropagation: () => {
          stopped = true;
        },
      });
      if (!stopped) passed.push(entries[index].url);
      afterEvent?.();
    }
  }
  return {
    history,
    entries,
    passed,
    confirmations,
    navigation,
    flush,
    nativeFragment: (url: string) => {
      nativePush(null as unknown as object, '', url);
      navigation.handlePopState({ state: null, stopImmediatePropagation() {} });
    },
    url: () => entries[index].url,
    dirty: (value: boolean) => {
      dirty = value;
    },
  };
}

test('Back restores the editor before confirmation without adding history entries', () => {
  const f = fixture();
  f.history.pushState({ __NA: true, tree: 'map' }, '', '/dashboard/map?selected=one');
  const draft = { name: 'unsaved', points: [1, 2] };
  f.dirty(true);
  f.history.go(-1);
  f.flush();
  assert.equal(f.url(), '/dashboard/map?selected=one');
  assert.deepEqual(f.passed, [], 'Next.js must not unmount the dirty editor');
  assert.equal(f.confirmations.length, 1);
  assert.equal(f.entries.length, 2, 'no sentinel entries');
  assert.deepEqual(draft, { name: 'unsaved', points: [1, 2] });
  // Cancel: do not invoke proceed. A second Back must remain cancellable.
  f.history.go(-1);
  f.flush();
  assert.equal(f.confirmations.length, 2);
  assert.equal(f.entries.length, 2);
  assert.equal(f.url(), '/dashboard/map?selected=one');
});

test('confirm replays the original Back exactly once while the blocker is still mounted', () => {
  const f = fixture();
  f.history.pushState({ __NA: true, tree: 'map' }, '', '/dashboard/map');
  f.dirty(true);
  f.history.go(-1);
  f.flush();
  f.confirmations[0]();
  f.confirmations[0]();
  f.flush();
  assert.equal(f.url(), '/dashboard/library');
  assert.deepEqual(f.passed, ['/dashboard/library']);
  assert.equal(f.entries.length, 2);
  assert.equal(f.confirmations.length, 1);
});

test('Forward and multi-entry traversals retain their exact destination', () => {
  const f = fixture();
  f.history.pushState({ __NA: true, tree: 'map' }, '', '/dashboard/map?kind=routes');
  f.history.pushState({ __NA: true, tree: 'account' }, '', '/dashboard/account');
  f.history.go(-1);
  f.flush();
  f.dirty(true);
  f.history.go(1);
  f.flush();
  assert.equal(f.url(), '/dashboard/map?kind=routes');
  f.confirmations[0]();
  f.flush();
  assert.equal(f.url(), '/dashboard/account');
  f.history.go(-2);
  f.flush();
  assert.equal(f.url(), '/dashboard/account');
  f.confirmations[1]();
  f.flush();
  assert.equal(f.url(), '/dashboard/library');
});

test('query history preserves Next.js state on push, replace, cancel, and confirm', () => {
  const f = fixture();
  f.history.pushState({ __NA: true, tree: 'one' }, '', '/dashboard/map?selected=one');
  f.history.replaceState({ __NA: true, tree: 'replacement' }, '', '/dashboard/map?selected=two');
  f.history.pushState({ __NA: true, tree: 'three' }, '', '/dashboard/map?selected=three');
  f.dirty(true);
  f.history.go(-1);
  f.flush();
  assert.equal(f.url(), '/dashboard/map?selected=three');
  f.confirmations[0]();
  f.flush();
  assert.equal(f.url(), '/dashboard/map?selected=two');
  assert.equal(f.history.state.__NA, true);
  assert.equal(f.history.state.tree, 'replacement');
  assert.equal(f.entries.length, 3);
});

test('clean navigation and disposal do not prompt or change history length', () => {
  const f = fixture();
  f.history.pushState({ __NA: true, tree: 'map' }, '', '/dashboard/map');
  f.history.go(-1);
  f.flush();
  f.history.go(1);
  f.flush();
  assert.deepEqual(f.passed, ['/dashboard/library', '/dashboard/map']);
  assert.equal(f.confirmations.length, 0);
  f.navigation.dispose();
  f.dirty(true);
  f.history.go(-1);
  f.flush();
  assert.equal(f.url(), '/dashboard/library');
  assert.equal(f.confirmations.length, 0);
  assert.equal(f.entries.length, 2);
});

test('native fragment entries retain Next metadata and correct traversal distance', () => {
  const f = fixture();
  f.history.pushState({ __NA: true, tree: 'account' }, '', '/dashboard/account');
  f.nativeFragment('/dashboard/account#security');
  assert.equal(f.history.state.__NA, true);
  assert.equal(f.history.state.tree, 'account');
  f.history.pushState({ __NA: true, tree: 'map' }, '', '/dashboard/map');
  f.dirty(true);
  f.history.go(-1);
  f.flush();
  assert.equal(f.url(), '/dashboard/map');
  f.confirmations[0]();
  f.flush();
  assert.equal(f.url(), '/dashboard/account#security');
  assert.equal(f.entries.length, 4);
});

test('rapid Back requests restore the original entry without loops or extra entries', () => {
  const f = fixture();
  f.history.pushState({ __NA: true, tree: 'one' }, '', '/dashboard/map?selected=one');
  f.history.pushState({ __NA: true, tree: 'account' }, '', '/dashboard/account');
  f.history.pushState({ __NA: true, tree: 'two' }, '', '/dashboard/map?selected=two');
  f.dirty(true);
  f.history.go(-1);
  f.history.go(-1);
  f.flush();
  assert.equal(f.url(), '/dashboard/map?selected=two');
  assert.deepEqual(f.passed, []);
  assert.equal(f.entries.length, 4);
  assert.equal(f.confirmations.length, 1);
  f.confirmations[0]();
  f.flush();
  assert.equal(f.url(), '/dashboard/account');
});

test('a draft becoming clean during restoration does not remain blocked', () => {
  const f = fixture();
  f.history.pushState({ __NA: true, tree: 'map' }, '', '/dashboard/map');
  f.dirty(true);
  f.history.go(-1);
  f.flush(() => f.dirty(false));
  assert.equal(f.url(), '/dashboard/library');
  assert.equal(f.confirmations.length, 0);
});
