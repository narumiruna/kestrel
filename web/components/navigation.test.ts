import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentTabNavigation } from './navigation.ts';

const click = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  currentTarget: { target: '', hasAttribute: () => false },
};

test('only normal current-tab navigation uses the guard', () => {
  assert.equal(isCurrentTabNavigation(click), true);
  for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey', 'defaultPrevented']) {
    assert.equal(isCurrentTabNavigation({ ...click, [key]: true }), false);
  }
  for (const button of [1, 2]) {
    assert.equal(isCurrentTabNavigation({ ...click, button }), false);
  }
  assert.equal(
    isCurrentTabNavigation({
      ...click,
      currentTarget: { target: '_blank', hasAttribute: () => false },
    }),
    false,
  );
  assert.equal(
    isCurrentTabNavigation({
      ...click,
      currentTarget: { target: '', hasAttribute: () => true },
    }),
    false,
  );
});
