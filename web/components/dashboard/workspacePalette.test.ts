import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../../app/workspace-ux.css', import.meta.url), 'utf8');
const androidColors = readFileSync(
  new URL('../../../app/src/main/java/dev/narumi/kestrel/ui/theme/Color.kt', import.meta.url),
  'utf8',
);
const light = css.slice(0, css.indexOf('@media'));
const dark = css.slice(
  css.indexOf(':root[data-theme="dark"]'),
  css.indexOf(':root,\n:root[data-theme]'),
);
const token = (source: string, name: string) => {
  const value = source.match(new RegExp(`--kestrel-${name}: (#[0-9a-f]{6});`))?.[1];
  assert.ok(value, `Missing ${name}`);
  return value;
};
function luminance(hex: string) {
  const rgb = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('web primary colors match the default Android light and dark palettes', () => {
  for (const [theme, androidName] of [
    [light, 'KestrelBlue40'],
    [dark, 'KestrelBlue80'],
  ]) {
    const android = androidColors.match(
      new RegExp(`${androidName} = Color\\(0xFF([0-9A-F]{6})\\)`),
    )?.[1];
    assert.equal(token(theme, 'primary'), `#${android?.toLowerCase()}`);
  }
});

test('light and dark text, primary actions and selected surfaces meet 4.5:1', () => {
  for (const theme of [light, dark]) {
    for (const [foreground, background] of [
      ['text', 'surface'],
      ['secondary', 'surface'],
      ['muted', 'canvas'],
      ['on-primary', 'primary'],
      ['on-primary-soft', 'primary-soft'],
      ['secondary', 'primary-soft'],
      ['danger', 'surface'],
      ['success', 'surface'],
      ['warning', 'surface'],
    ]) {
      assert.ok(
        contrast(token(theme, foreground), token(theme, background)) >= 4.5,
        `${foreground} on ${background}`,
      );
    }
    assert.ok(contrast(token(theme, 'outline'), token(theme, 'surface')) >= 3);
  }
});

test('route accent and its white route casing meet 3:1', () => {
  const accent = css.match(/--route-accent: (#[0-9a-f]{6});/)?.[1];
  assert.ok(accent);
  assert.ok(contrast(accent, '#ffffff') >= 3);
});
