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

test('dense routes use a smaller spacing for sparse dots while retaining selected points', () => {
  const points = Array.from({ length: 94 }, (_, index) => ({ x: index * 2, y: 0 }));
  const labels = getVisibleRouteLabels(points, 46, null);
  const dots = getVisibleRouteLabels(points, 46, null, 14);
  assert.ok(dots.size > labels.size);
  assert.ok(dots.size < 20);
  for (const index of [0, 46, 93]) assert.ok(dots.has(index));
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
