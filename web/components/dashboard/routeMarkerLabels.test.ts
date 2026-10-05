import assert from 'node:assert/strict';
import test from 'node:test';
import { getVisibleRouteLabels } from './routeMarkerLabels.ts';

test('empty and single-point routes have valid labels', () => {
  assert.deepEqual([...getVisibleRouteLabels([], null, null)], []);
  assert.deepEqual([...getVisibleRouteLabels([{ x: 0, y: 0 }], null, null)], [0]);
});

test('dense routes retain endpoints and prioritize the selected and hovered labels', () => {
  const points = Array.from({ length: 94 }, (_, index) => ({ x: index * 2, y: 0 }));
  const visible = getVisibleRouteLabels(points, 46, 47);
  for (const index of [0, 93, 46, 47]) assert.ok(visible.has(index));
  assert.ok(visible.size < 8);
  assert.ok(!visible.has(45));
});

test('compact dots reserve their full 44px hit targets, not their visual size', () => {
  const points = [0, 14, 21, 43, 44, 88, 200].map((x) => ({ x, y: 0 }));
  const dots = getVisibleRouteLabels(points, null, null, 44);
  assert.deepEqual([...dots], [0, 6, 4, 5]);
});

test('diagonal markers cannot overlap the corners of square hit targets', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 32, y: 32 },
    { x: 44, y: 44 },
    { x: 200, y: 200 },
  ];
  const dots = getVisibleRouteLabels(points, null, null, 44);
  assert.ok(!dots.has(1)); // Euclidean distance exceeds 44px, but the squares overlap.
  assert.ok(dots.has(2));
});

test('ordinary dots have disjoint hit targets, including around prioritized points', () => {
  const points = Array.from({ length: 94 }, (_, index) => ({
    x: index * 2,
    y: Math.sin(index) * 30,
  }));
  const prioritized = new Set([0, 46, 47, 93]);
  const dots = getVisibleRouteLabels(points, 46, 47, 44);
  for (const index of prioritized) assert.ok(dots.has(index));
  for (const index of dots) {
    if (prioritized.has(index)) continue;
    for (const other of dots) {
      if (other === index) continue;
      assert.ok(
        Math.max(
          Math.abs(points[index].x - points[other].x),
          Math.abs(points[index].y - points[other].y),
        ) >= 44,
      );
    }
  }
});

test('zoomed-in points recover labels without mutating their coordinates', () => {
  const points = Array.from({ length: 5 }, (_, index) => ({ x: index * 60, y: 0 }));
  const before = structuredClone(points);
  assert.equal(getVisibleRouteLabels(points, null, null).size, 5);
  assert.deepEqual(points, before);
});

test('overlapping endpoints remain visible and collision checks cross grid boundaries', () => {
  assert.deepEqual(
    [
      ...getVisibleRouteLabels(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        null,
        null,
      ),
    ],
    [0, 1],
  );
  const labels = getVisibleRouteLabels(
    [
      { x: -1, y: -1 },
      { x: 1, y: 1 },
      { x: 200, y: 0 },
    ],
    null,
    null,
  );
  assert.ok(!labels.has(1));
});
