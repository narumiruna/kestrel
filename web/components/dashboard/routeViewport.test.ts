import assert from 'node:assert/strict';
import test from 'node:test';
import { getRouteBounds, getRouteCoordinates, getRouteViewportPadding } from './routeViewport.ts';

test('empty routes do not request a camera change; a single point has finite bounds', () => {
  assert.equal(getRouteBounds([]), null);
  assert.deepEqual(getRouteBounds([{ longitude: 121, latitude: 25 }]), [
    [121, 25],
    [121, 25],
  ]);
});

test('route bounds contain all waypoints without changing their order or coordinates', () => {
  const points = [
    { longitude: 121, latitude: 25 },
    { longitude: 120, latitude: 26 },
    { longitude: 122, latitude: 24 },
  ];
  const before = structuredClone(points);
  assert.deepEqual(getRouteBounds(points), [
    [120, 24],
    [122, 26],
  ]);
  assert.deepEqual(points, before);
});

test('date-line bounds and rendering use the short arc without changing stored geometry', () => {
  const points = [
    { longitude: 179, latitude: 10 },
    { longitude: -179, latitude: 11 },
  ];
  const before = structuredClone(points);
  assert.deepEqual(getRouteBounds(points), [
    [179, 10],
    [181, 11],
  ]);
  assert.deepEqual(getRouteCoordinates(points), [
    [179, 10],
    [181, 11],
  ]);
  assert.deepEqual(getRouteCoordinates([...points].reverse()), [
    [-179, 11],
    [-181, 10],
  ]);
  assert.deepEqual(points, before);
});

test('desktop panels outside the actual map reserve no extra camera space', () => {
  const map = { left: 292, top: 64, right: 1058, bottom: 900 };
  const panels = [
    { left: 16, top: 80, right: 276, bottom: 884 },
    { left: 1074, top: 80, right: 1424, bottom: 884 },
  ];
  assert.deepEqual(getRouteViewportPadding(map, panels), {
    top: 48,
    bottom: 48,
    left: 48,
    right: 48,
  });
});

test('overlapping panels and map tools reserve their occupied edges', () => {
  const padding = getRouteViewportPadding({ left: 0, top: 0, right: 1440, bottom: 900 }, [
    { left: 16, top: 80, right: 276, bottom: 884 },
    { left: 1074, top: 80, right: 1424, bottom: 884 },
    { left: 600, top: 820, right: 860, bottom: 880 },
    { left: 0, top: 0, right: 1440, bottom: 64 },
  ]);
  assert.deepEqual(padding, { left: 324, right: 414, top: 112, bottom: 128 });
});

test('collapsed panels and a larger map yield a larger usable camera viewport', () => {
  const expanded = getRouteViewportPadding({ left: 292, top: 64, right: 1058, bottom: 900 }, []);
  const collapsed = getRouteViewportPadding({ left: 0, top: 64, right: 1440, bottom: 900 }, []);
  assert.ok(1440 - collapsed.left - collapsed.right > 766 - expanded.left - expanded.right);
});

test('tiny previews retain positive drawable space even with overlapping tools', () => {
  const padding = getRouteViewportPadding({ left: 0, top: 0, right: 120, bottom: 80 }, [
    { left: 0, top: 0, right: 120, bottom: 44 },
    { left: 0, top: 44, right: 120, bottom: 80 },
  ]);
  assert.ok(padding.left + padding.right < 120);
  assert.ok(padding.top + padding.bottom < 80);
});
