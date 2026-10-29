import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundedCapture,
  captureDimensions,
  freezeTransform,
  hasImageContent,
  markerPosition,
  mercator,
} from './capture.ts';

function projection(angle: number, scale: number, origin: [number, number]) {
  return ([px, py]: [number, number]) => {
    const x = origin[0] + scale * (px * Math.cos(angle) - py * Math.sin(angle));
    const y = origin[1] + scale * (px * Math.sin(angle) + py * Math.cos(angle));
    return {
      lng: x * 360 - 180,
      lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
    };
  };
}

test('frozen affine samples match independent center and edges with rotation and date-line', () => {
  for (const angle of [0, 0.7, -1.8]) {
    for (const scale of [1e-6, 1e-4]) {
      for (const origin of [
        [0.99, 0.5],
        [0.3, 0.25],
      ] as [number, number][]) {
        const unproject = projection(angle, scale, origin);
        const t = freezeTransform(unproject, 1200, 800, 600, 400);
        for (const [u, v] of [
          [0, 0],
          [1, 1],
          [0.15, 0.8],
          [0.5, 0.5],
        ]) {
          const expected = mercator(unproject([1200 * u, 800 * v]));
          assert.ok(Math.abs(t.origin[0] + u * t.xAxis[0] + v * t.yAxis[0] - expected[0]) < 1e-12);
          assert.ok(Math.abs(t.origin[1] + u * t.xAxis[1] + v * t.yAxis[1] - expected[1]) < 1e-12);
        }
      }
    }
  }
});

test('wide affine samples preserve their continuous world across the date line', () => {
  for (const angle of [0, 0.25, -0.25]) {
    const unproject = projection(angle, 0.0006, [0.8, 0.4]);
    const frozen = freezeTransform(unproject, 1200, 400, 1200, 400);
    const expected = mercator(unproject([1140, 80]));
    assert.ok(
      Math.abs(frozen.origin[0] + 0.95 * frozen.xAxis[0] + 0.2 * frozen.yAxis[0] - expected[0]) <
        1e-12,
    );
  }
});

test('nonlinear, singular and repeated-world views are rejected', () => {
  assert.throws(
    () => freezeTransform(() => ({ lng: 0, lat: 0 }), 100, 100, 100, 100),
    /invertible/,
  );
  assert.throws(
    () => freezeTransform(projection(0, 0.01, [0, 0.3]), 100, 10, 100, 10),
    /Repeated worlds/,
  );
  assert.throws(
    () => freezeTransform(([x, y]) => ({ lng: x / 100, lat: (y * y) / 10000 }), 100, 100, 100, 100),
    /projection/,
  );
});

test('output dimensions include attribution outside normalized map area', () => {
  for (const [width, height] of [
    [3000, 2000],
    [1200, 800],
    [1000, 4000],
  ]) {
    const d = captureDimensions(width, height);
    assert.ok(d.width <= 1600 && d.height <= 1600);
    assert.ok(d.width * d.height <= 2_560_000);
    assert.equal(d.height - d.mapRect.height, 40);
    assert.equal(d.pixelScale, d.width / width);
  }
  assert.throws(() => captureDimensions(0, 200));
});

test('marker reference identifies geographic anchor, not offset label', () => {
  assert.deepEqual(markerPosition({ x: 300, y: 200 }, { x: 40, y: -30 }, 600, 400), {
    u: 0.5,
    v: 0.5,
    x: 340,
    y: 170,
  });
});

test('blank and transparent image samples fail before marker composition', () => {
  assert.equal(
    hasImageContent(new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255])),
    false,
  );
  assert.equal(hasImageContent(new Uint8ClampedArray([255, 255, 255, 0, 0, 0, 0, 255])), false);
  assert.equal(hasImageContent(new Uint8ClampedArray([255, 255, 255, 255, 20, 30, 40, 255])), true);
});

test('abort releases resources and late encoding results cannot complete capture', async () => {
  const controller = new AbortController();
  let cleaned = 0;
  let late = (_value: number) => {};
  const result = boundedCapture<number>(controller.signal, (resolve) => {
    late = resolve;
    return () => {
      cleaned++;
    };
  });
  controller.abort();
  late(42);
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(cleaned, 1);
});

test('deadline releases resources; pre-abort never starts capture', async () => {
  const controller = new AbortController();
  let cleaned = 0;
  await assert.rejects(
    boundedCapture(
      controller.signal,
      () => () => {
        cleaned++;
      },
      1,
    ),
    /timed out/,
  );
  assert.equal(cleaned, 1);
  controller.abort();
  await assert.rejects(
    boundedCapture(controller.signal, () => {
      throw new Error('must not start');
    }),
    { name: 'AbortError' },
  );
});

test('synchronous completion still cleans up once', async () => {
  let cleaned = 0;
  const result = await boundedCapture(new AbortController().signal, (resolve) => {
    resolve(42);
    return () => {
      cleaned++;
    };
  });
  assert.equal(result, 42);
  assert.equal(cleaned, 1);
});
