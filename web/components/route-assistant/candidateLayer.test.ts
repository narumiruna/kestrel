import assert from 'node:assert/strict';
import test from 'node:test';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { RouteWaypoint } from '../../lib/api.ts';
import { syncAssistantCandidate } from './candidateLayer.ts';

const SOURCE = 'route-assistant-candidate';
const LAYER = 'route-assistant-candidate-line';
function mapFixture() {
  const existing = { data: { route: 'unchanged' } };
  const sources = new Map<string, { data: unknown; setData: (data: unknown) => void }>();
  const layers = new Map<string, unknown>([['route-line', { id: 'route-line', source: 'route' }]]);
  const calls: { method: string; id: string; value?: unknown }[] = [];
  const route = { ...existing, setData: () => assert.fail('current route must not change') };
  sources.set('route', route);
  const camera = Object.freeze({ center: [121, 25], zoom: 12, bearing: 30 });
  const stub = {
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.get(id),
    addSource: (id: string, value: { data: unknown }) => {
      assert.equal(sources.has(id), false);
      calls.push({ method: 'addSource', id, value });
      sources.set(id, {
        data: value.data,
        setData(data: unknown) {
          this.data = data;
          calls.push({ method: 'setData', id, value: data });
        },
      });
    },
    addLayer: (value: { id: string; source: string }) => {
      assert.ok(sources.has(value.source));
      assert.equal(layers.has(value.id), false);
      layers.set(value.id, value);
      calls.push({ method: 'addLayer', id: value.id, value });
    },
    removeLayer: (id: string) => {
      assert.ok(layers.delete(id));
      calls.push({ method: 'removeLayer', id });
    },
    removeSource: (id: string) => {
      assert.equal(layers.has(LAYER), false);
      assert.ok(sources.delete(id));
      calls.push({ method: 'removeSource', id });
    },
    fitBounds: () => assert.fail('candidate sync must not fit camera'),
    flyTo: () => assert.fail('candidate sync must not move camera'),
    easeTo: () => assert.fail('candidate sync must not move camera'),
    jumpTo: () => assert.fail('candidate sync must not move camera'),
    setCenter: () => assert.fail('candidate sync must not move camera'),
    setZoom: () => assert.fail('candidate sync must not move camera'),
  };
  return { map: stub as unknown as MapLibreMap, sources, layers, calls, route, camera };
}
function points(count: number): RouteWaypoint[] {
  return Array.from({ length: count }, (_, i) => ({
    longitude: 121 + i / 100000,
    latitude: 25 + (i % 2) / 100000,
    speedKmh: i === 0 ? 12 : null,
    pauseSeconds: i === 0 ? 3 : null,
  }));
}
function geometry(path: RouteWaypoint[]) {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: path.map((p) => [p.longitude, p.latitude]) },
  };
}

test('separate candidate source preserves every ordered longitude/latitude vertex at 2/50/1000 points', () => {
  for (const count of [2, 50, 1000]) {
    const f = mapFixture();
    const path = points(count);
    const before = structuredClone(path);
    syncAssistantCandidate(f.map, path);
    assert.deepEqual(
      f.calls.map((call) => call.method),
      ['addSource', 'addLayer'],
    );
    assert.deepEqual(f.sources.get(SOURCE)?.data, geometry(path));
    assert.deepEqual(f.layers.get(LAYER), {
      id: LAYER,
      source: SOURCE,
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#0090ff', 'line-width': 5, 'line-dasharray': [2, 1] },
    });
    assert.strictEqual(f.sources.get('route'), f.route);
    assert.deepEqual(f.route.data, { route: 'unchanged' });
    assert.deepEqual(f.camera, { center: [121, 25], zoom: 12, bearing: 30 });
    assert.deepEqual(path, before);
  }
});

test('candidate GeoJSON disables MapLibre simplification', () => {
  const f = mapFixture();
  syncAssistantCandidate(f.map, points(1000));
  const source = f.calls.find((call) => call.method === 'addSource')?.value as {
    tolerance?: number;
  };
  assert.equal(source.tolerance, 0);
});

test('candidate updates source data without recreating layers or truncating bends', () => {
  const f = mapFixture();
  syncAssistantCandidate(f.map, points(2));
  const source = f.sources.get(SOURCE);
  const layer = f.layers.get(LAYER);
  for (const count of [50, 1000, 2]) {
    const path = points(count).reverse();
    syncAssistantCandidate(f.map, path);
    assert.strictEqual(f.sources.get(SOURCE), source);
    assert.strictEqual(f.layers.get(LAYER), layer);
    assert.deepEqual(source?.data, geometry(path));
  }
  assert.deepEqual(
    f.calls.map((call) => call.method),
    ['addSource', 'addLayer', 'setData', 'setData', 'setData'],
  );
});

test('clear removes layer before source, is idempotent, and permits remount', () => {
  const f = mapFixture();
  syncAssistantCandidate(f.map, null);
  assert.equal(f.calls.length, 0);
  syncAssistantCandidate(f.map, points(50));
  syncAssistantCandidate(f.map, null);
  assert.deepEqual(
    f.calls.slice(-2).map((call) => call.method),
    ['removeLayer', 'removeSource'],
  );
  const calls = f.calls.length;
  syncAssistantCandidate(f.map, null);
  assert.equal(f.calls.length, calls);
  syncAssistantCandidate(f.map, points(1000));
  assert.deepEqual(f.sources.get(SOURCE)?.data, geometry(points(1000)));
  assert.strictEqual(f.sources.get('route'), f.route);
});

test('style reset recreates missing candidate resources and clear handles partial resources', () => {
  const f = mapFixture();
  syncAssistantCandidate(f.map, points(2));
  f.layers.delete(LAYER);
  f.sources.delete(SOURCE);
  syncAssistantCandidate(f.map, points(50));
  assert.deepEqual(
    f.calls.slice(-2).map((call) => call.method),
    ['addSource', 'addLayer'],
  );
  f.layers.delete(LAYER);
  syncAssistantCandidate(f.map, points(1000));
  assert.deepEqual(
    f.calls.slice(-2).map((call) => call.method),
    ['setData', 'addLayer'],
  );
  f.layers.delete(LAYER);
  syncAssistantCandidate(f.map, null);
  assert.equal(f.sources.has(SOURCE), false);
  f.layers.set(LAYER, { id: LAYER });
  syncAssistantCandidate(f.map, null);
  assert.equal(f.layers.has(LAYER), false);
  assert.strictEqual(f.sources.get('route'), f.route);
});
