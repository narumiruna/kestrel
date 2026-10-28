import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../../app/map-workspace.css', import.meta.url), 'utf8');
const source = readFileSync(new URL('./PlaceEditor.tsx', import.meta.url), 'utf8');

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'g'))];
  assert.ok(matches.length > 0, `Missing rule: ${selector}`);
  return matches.map((match) => match[1]).join('\n');
}

test('Place completion uses a bounded grid and one full-width primary action', () => {
  assert.match(
    rule('.cartographer-stage-map .index-card-place .place-save-footer'),
    /display: grid/,
  );
  assert.match(rule('.place-save-state'), /grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(rule('.place-save-primary'), /inline-size: 100%/);
  assert.match(rule('.place-save-primary'), /white-space: normal/);
  assert.doesNotMatch(source, /place-editor-(?:footer-actions|save-actions|danger-actions)/);
});

test('New item stays secondary and readable on hover', () => {
  const hover = rule('.cartographer-stage-map button.map-picker-new:hover:not(:disabled)');
  assert.match(hover, /background: var\(--accent-soft\)/);
  assert.match(hover, /color: var\(--kestrel-on-primary-soft\)/);
});

test('Device preview wraps long saved names inside the dialog', () => {
  assert.match(rule('.remote-command-preview'), /min-inline-size: 0/);
  assert.match(rule('.remote-command-preview'), /overflow-wrap: anywhere/);
});

test('Saved actions stay in their own section, outside the completion footer', () => {
  const saved = source.indexOf('className="place-saved-section"');
  const device = source.indexOf('<PlaceRemoteControlAction');
  const share = source.indexOf('<PlaceSharePanel');
  const footer = source.indexOf('<footer className="place-editor-footer place-save-footer">');
  assert.ok(saved < device && device < share && share < footer);
  assert.match(rule('.place-saved-action-buttons'), /repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(source, /savedPlace == null/);
  assert.match(source, /t\('saveToUse'\)/);
});
