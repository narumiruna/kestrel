import assert from 'node:assert/strict';
import test from 'node:test';
import { getRouteMarkerLayout, getVisibleRouteLabels } from './routeMarkerLabels.ts';

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

test('overlapping endpoints remain visible with separate hit areas and unchanged coordinates', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  const layout = getRouteMarkerLayout(points, null, null);
  assert.deepEqual([...layout.visiblePoints], [0, 1]);
  assert.deepEqual(layout.offsets, [
    { x: 0, y: 0 },
    { x: 48, y: 0 },
  ]);
  assert.deepEqual(points, [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]);
  assert.deepEqual(getRouteMarkerLayout(points, 1, 1).offsets, layout.offsets);
});

test('all overlapping priority markers have disjoint 44px hit areas', () => {
  const points = Array.from({ length: 5 }, () => ({ x: 0, y: 0 }));
  const layout = getRouteMarkerLayout(points, 1, 2);
  assert.deepEqual([...layout.visiblePoints].sort(), [0, 1, 2, 4]);
  const indices = [...layout.visiblePoints];
  for (const index of indices) {
    for (const other of indices) {
      if (index === other) continue;
      assert.ok(
        Math.max(
          Math.abs(layout.offsets[index].x - layout.offsets[other].x),
          Math.abs(layout.offsets[index].y - layout.offsets[other].y),
        ) >= 44,
      );
    }
  }
});

test('non-overlapping points keep zero offsets and overlap offsets reset after zoom', () => {
  const points = [0, 60, 120].map((x) => ({ x, y: 0 }));
  assert.deepEqual(
    getRouteMarkerLayout(points, 1, null).offsets,
    points.map(() => ({ x: 0, y: 0 })),
  );
  assert.deepEqual(getRouteMarkerLayout([], null, null).offsets, []);
  assert.deepEqual(getRouteMarkerLayout([{ x: 0, y: 0 }], 0, 0).offsets, [{ x: 0, y: 0 }]);
});

test('hover and selection never displace an already visible point at the hit-target boundary', () => {
  for (const separation of [44, 45, 46, 47, 48]) {
    for (const y of [0, separation]) {
      const points = [
        { x: 0, y: 0 },
        { x: separation, y },
        { x: 200, y: 200 },
      ];
      const initial = getRouteMarkerLayout(points, null, null);
      assert.ok(initial.visiblePoints.has(1));
      assert.deepEqual(getRouteMarkerLayout(points, null, 1).offsets, initial.offsets);
      assert.deepEqual(getRouteMarkerLayout(points, 1, 1).offsets, initial.offsets);
      assert.deepEqual(getRouteMarkerLayout(points, null, null).offsets, initial.offsets);
    }
  }
});

test('hover still separates a genuinely overlapping priority point', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 43, y: 43 },
    { x: 200, y: 200 },
  ];
  assert.ok(!getRouteMarkerLayout(points, null, null).visiblePoints.has(1));
  assert.deepEqual(getRouteMarkerLayout(points, null, 1).offsets[1], { x: 48, y: 0 });
});

test('priority targets stay fully inside every edge and corner of the viewport', () => {
  const viewport = { width: 600, height: 400 };
  for (const anchor of [
    { x: 1, y: 200 },
    { x: 599, y: 200 },
    { x: 300, y: 1 },
    { x: 300, y: 399 },
    { x: 1, y: 1 },
    { x: 599, y: 1 },
    { x: 1, y: 399 },
    { x: 599, y: 399 },
    { x: 544, y: 200 }, // Route-fit padding is only 56px.
  ]) {
    const points = Array.from({ length: 4 }, () => ({ ...anchor }));
    const layout = getRouteMarkerLayout(points, 1, 2, viewport);
    assert.equal(layout.visiblePoints.size, 4);
    for (const index of layout.visiblePoints) {
      const x = anchor.x + layout.offsets[index].x;
      const y = anchor.y + layout.offsets[index].y;
      assert.ok(x >= 22 && x <= viewport.width - 22);
      assert.ok(y >= 22 && y <= viewport.height - 22);
      for (const other of layout.visiblePoints) {
        if (other === index) continue;
        assert.ok(
          Math.max(
            Math.abs(layout.offsets[index].x - layout.offsets[other].x),
            Math.abs(layout.offsets[index].y - layout.offsets[other].y),
          ) >= 44,
        );
      }
    }
    assert.deepEqual(
      points,
      Array.from({ length: 4 }, () => anchor),
    );
  }
});

test('viewport placement retains stable hover at the right edge', () => {
  const points = [
    { x: 578, y: 200 },
    { x: 533, y: 200 },
    { x: 100, y: 100 },
  ];
  const viewport = { width: 600, height: 400 };
  const initial = getRouteMarkerLayout(points, null, null, viewport);
  assert.ok(initial.visiblePoints.has(1));
  assert.deepEqual(getRouteMarkerLayout(points, null, 1, viewport).offsets, initial.offsets);
});

test('offscreen anchors stay offscreen and impossible tiny viewports have a bounded fallback', () => {
  const offscreen = getRouteMarkerLayout(
    [
      { x: -100, y: 50 },
      { x: 100, y: 50 },
    ],
    null,
    null,
    { width: 200, height: 100 },
  );
  assert.ok(!offscreen.visiblePoints.has(0));
  assert.deepEqual(offscreen.offsets[0], { x: 0, y: 0 });
  const points = Array.from({ length: 4 }, () => ({ x: 22, y: 22 }));
  const tiny = getRouteMarkerLayout(points, 1, 2, { width: 44, height: 44 });
  assert.equal(tiny.visiblePoints.size, 1);
  assert.equal(getRouteMarkerLayout(points, 1, 2, { width: 0, height: 0 }).visiblePoints.size, 0);
});

test('clipped ordinary points cannot suppress fully visible neighbors at any edge', () => {
  for (const [clipped, neighbor] of [
    [
      { x: 1, y: 50 },
      { x: 30, y: 50 },
    ],
    [
      { x: 399, y: 50 },
      { x: 370, y: 50 },
    ],
    [
      { x: 50, y: 1 },
      { x: 50, y: 30 },
    ],
    [
      { x: 50, y: 199 },
      { x: 50, y: 170 },
    ],
  ]) {
    const points = [{ x: 200, y: 100 }, clipped, neighbor, { x: 300, y: 150 }];
    const layout = getRouteMarkerLayout(points, null, null, { width: 400, height: 200 });
    assert.ok(!layout.visiblePoints.has(1));
    assert.ok(layout.visiblePoints.has(2));
    assert.ok(!layout.visibleLabels.has(1));
    assert.ok(layout.visibleLabels.has(2));
  }
});

test('an offscreen priority point cannot reserve space against an eligible neighbor', () => {
  const points = [
    { x: -1, y: 50 },
    { x: 30, y: 50 },
    { x: 300, y: 150 },
  ];
  const layout = getRouteMarkerLayout(points, null, null, { width: 400, height: 200 });
  assert.ok(!layout.visiblePoints.has(0));
  assert.ok(layout.visiblePoints.has(1));
  assert.ok(!layout.visibleLabels.has(0));
  assert.ok(layout.visibleLabels.has(1));
});

test('collision checks cross grid boundaries', () => {
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
