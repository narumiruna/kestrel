import assert from 'node:assert/strict';
import test from 'node:test';
import type { AiSettings } from '../../lib/ai.ts';
import type {
  AssistantBinding,
  AssistantProposal,
  AssistantSnapshot,
  AssistantWaypoint,
} from '../../lib/route-assistant.ts';
import {
  AssistantEventBuffer,
  AssistantLifecycle,
  applyAssistantProposal,
  assistantSettingsKey,
  sameAssistantBinding,
  validateAssistantProposal,
} from './assistantState.ts';
import {
  createRouteDraftState,
  type RouteDraftState,
  redoRoutePath,
  setRouteDraftField,
  undoRoutePath,
  updateRouteWaypoint,
} from './routeDraftState.ts';

const binding: AssistantBinding = {
  userId: 'user',
  sessionId: 'session',
  editorId: 'editor',
  routeId: 'new:editor',
  draftGeneration: 0,
  settingsGeneration: 1,
  connectionGeneration: 1,
  runId: 'run',
  captureId: 'capture',
};
function point(draftId: string, longitude = 0, latitude = 0): AssistantWaypoint {
  return { draftId, latitude, longitude, speedKmh: null, pauseSeconds: null };
}
function snapshot(): AssistantSnapshot {
  return {
    binding: { ...binding },
    capturedAt: 1,
    png: '',
    view: {
      projection: 'mercator',
      pitch: 0,
      bearing: 0,
      zoom: 10,
      center: [0, 0],
      bounds: [-3.6, -3.6, 3.6, 3.6],
      style: 'plain',
      cssWidth: 800,
      cssHeight: 600,
      canvasWidth: 800,
      canvasHeight: 600,
      width: 800,
      height: 640,
      pixelScale: 1,
      mapRect: { left: 0, top: 0, width: 800, height: 600 },
    },
    transform: { origin: [0.49, 0.49], xAxis: [0.02, 0], yAxis: [0, 0.02], checks: [] },
    waypoints: [
      { ...point('event'), speedKmh: 12, pauseSeconds: 3 },
      point('plain', 0.001),
      point('offscreen', 20),
    ],
    visibleMarkers: [
      { draftId: 'event', label: '1', u: 0.5, v: 0.5 },
      { draftId: 'plain', label: '2', u: 0.51, v: 0.5 },
    ],
  };
}
// Independent unit-vector central-angle measurement for fixture distances.
function meters(points: AssistantWaypoint[]): number {
  const vector = (p: AssistantWaypoint) => {
    const lat = (p.latitude * Math.PI) / 180;
    const lon = (p.longitude * Math.PI) / 180;
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  };
  return points.slice(1).reduce((sum, p, i) => {
    const a = vector(points[i]);
    const b = vector(p);
    const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    return (
      sum +
      6371000 *
        Math.atan2(
          Math.hypot(...cross),
          a.reduce((dot, n, j) => dot + n * b[j], 0),
        )
    );
  }, 0);
}
function proposal(
  waypoints = [point('generated-0'), point('generated-1', 0.001)],
): AssistantProposal {
  return {
    binding: { ...binding },
    waypoints,
    distanceMeters: meters(waypoints),
    removedEventIds: ['event'],
    loopTargetMeters: null,
    source: 'OpenStreetMap',
  };
}
function draft(): RouteDraftState {
  const state = createRouteDraftState(null);
  return {
    ...state,
    draft: {
      ...state.draft,
      name: 'Route',
      description: 'Keep details',
      defaultSpeedKmh: '17',
      mode: 'LOOP',
      isPublic: true,
      waypoints: snapshot().waypoints.slice(0, 2),
    },
  };
}
function running(state = draft()) {
  const lifecycle = new AssistantLifecycle();
  const context = {
    draft: state,
    routeId: binding.routeId,
    owner: 'user:session',
    settings: 'model:connection:1',
    view: 0,
  };
  assert.equal(lifecycle.observe(context), false);
  const epoch = lifecycle.begin({ ...binding });
  return { lifecycle, context, epoch, state };
}

test('interleaved OAuth refresh polls preserve a run, but failed refresh and replacement invalidate it', async () => {
  const settings: AiSettings = {
    generation: 1,
    connectionGenerations: { provider: 1 },
    selection: {
      providerId: 'provider',
      authMethod: 'oauth',
      modelType: 'chat',
      modelId: 'vision',
      thinkingLevel: 'off',
    },
    connections: [
      { providerId: 'provider', authMethod: 'oauth', generation: 1, status: 'connected' },
    ],
  };
  const refreshing: AiSettings = {
    ...settings,
    connections: [{ ...settings.connections[0], status: 'reconnect_required', refreshing: true }],
  };
  const state = draft();
  const lifecycle = new AssistantLifecycle();
  const context = {
    draft: state,
    routeId: binding.routeId,
    owner: 'user:session',
    settings: assistantSettingsKey(settings),
    view: 0,
  };
  lifecycle.observe(context);
  const epoch = lifecycle.begin({ ...binding });
  lifecycle.submit(binding, epoch);
  for (const poll of [refreshing, refreshing, settings]) {
    await Promise.resolve();
    assert.equal(lifecycle.observe({ ...context, settings: assistantSettingsKey(poll) }), false);
    assert.equal(lifecycle.active(binding, epoch), true);
  }
  const failed: AiSettings = {
    ...refreshing,
    connections: [{ ...refreshing.connections[0], refreshing: false }],
  };
  assert.notEqual(assistantSettingsKey(failed), assistantSettingsKey(settings));
  assert.notEqual(
    assistantSettingsKey({
      ...settings,
      connections: [{ ...settings.connections[0], generation: 2 }],
    }),
    assistantSettingsKey(settings),
  );
  assert.equal(lifecycle.observe({ ...context, settings: assistantSettingsKey(failed) }), true);
  assert.equal(lifecycle.active(binding, epoch), false);
});

test('binding equality checks every identity and generation, including missing bindings', () => {
  assert.equal(sameAssistantBinding(binding, { ...binding }), true);
  for (const key of Object.keys(binding) as (keyof AssistantBinding)[]) {
    const changed = { ...binding, [key]: typeof binding[key] === 'number' ? 99 : 'different' };
    assert.equal(sameAssistantBinding(binding, changed), false, key);
  }
  assert.equal(sameAssistantBinding(undefined as unknown as AssistantBinding, binding), false);
});

test('manual field and path edits invalidate and advance generation', () => {
  for (const changed of [
    setRouteDraftField(draft(), 'name', 'Renamed'),
    updateRouteWaypoint(draft(), 'event', { latitude: 0.001 }),
  ]) {
    const { lifecycle, context, epoch } = running();
    assert.equal(lifecycle.observe({ ...context, draft: changed }), true);
    assert.equal(lifecycle.generation, 1);
    assert.equal(lifecycle.active(binding, epoch), false);
    assert.equal(lifecycle.submit(binding, epoch), false);
  }
});

test('edit then Undo restores coordinates but never restores an old run', () => {
  const { lifecycle, context, state, epoch } = running();
  const edited = updateRouteWaypoint(state, 'event', { latitude: 0.001 });
  lifecycle.observe({ ...context, draft: edited });
  const undone = undoRoutePath(edited);
  assert.deepEqual(undone.draft.waypoints, state.draft.waypoints);
  assert.notEqual(undone, state);
  lifecycle.observe({ ...context, draft: undone });
  assert.equal(lifecycle.generation, 2);
  assert.equal(lifecycle.submit(binding, epoch), false);
});

test('route switch and new-route replacement invalidate even with equal coordinates', () => {
  for (const routeId of ['saved:another', 'new:replacement']) {
    const { lifecycle, context, epoch } = running();
    assert.equal(lifecycle.observe({ ...context, routeId }), true);
    assert.equal(lifecycle.generation, 1);
    assert.equal(lifecycle.active(binding, epoch), false);
  }
  const { lifecycle, context, epoch } = running();
  assert.equal(lifecycle.observe({ ...context, draft: structuredClone(context.draft) }), true);
  assert.equal(lifecycle.active(binding, epoch), false);
});

test('successful baseline Save invalidates equal-coordinate captures and delayed completions', () => {
  for (const submitted of [false, true]) {
    const { lifecycle, context, state, epoch } = running();
    if (submitted) assert.equal(lifecycle.submit(binding, epoch), true);
    const saved = {
      ...state,
      baseline: structuredClone(state.draft),
      pastPaths: [],
      futurePaths: [],
    };
    assert.deepEqual(saved.draft.waypoints, state.draft.waypoints);
    assert.equal(lifecycle.observe({ ...context, draft: saved }), true);
    assert.equal(lifecycle.generation, 1);
    assert.equal(lifecycle.consume(binding, epoch, saved, state, false), false);
    assert.equal(lifecycle.submit(binding, epoch), false);
  }
});

test('failed Save keeps same-reference run but cannot revive an invalidated run', () => {
  const { lifecycle, context, state, epoch } = running();
  lifecycle.submit(binding, epoch);
  assert.equal(lifecycle.observe(context), false);
  assert.equal(lifecycle.active(binding, epoch), true);
  assert.equal(lifecycle.consume(binding, epoch, state, state, true), false);
  assert.equal(lifecycle.consumed, false);
  assert.equal(lifecycle.consume(binding, epoch, state, state, false), true);
  lifecycle.invalidate();
  lifecycle.observe(context);
  assert.equal(lifecycle.active(binding, epoch), false);
});

test('settings, connection, owner, session and logout changes invalidate without draft generation changes', () => {
  for (const change of [
    { settings: 'other-model' },
    { settings: 'model:connection:2' },
    { owner: 'other:session' },
    { owner: 'user:other-session' },
    { owner: '' },
  ]) {
    const { lifecycle, context, epoch } = running();
    lifecycle.submit(binding, epoch);
    assert.equal(lifecycle.observe({ ...context, ...change }), true);
    assert.equal(lifecycle.generation, 0);
    assert.equal(lifecycle.active(binding, epoch), false);
  }
});

test('camera, resize and style generations invalidate before submission but preserve frozen submitted runs', () => {
  const before = running();
  assert.equal(before.lifecycle.observe({ ...before.context, view: 1 }), true);
  assert.equal(before.lifecycle.active(binding, before.epoch), false);
  const after = running();
  after.lifecycle.submit(binding, after.epoch);
  for (const view of [1, 2, 3]) {
    assert.equal(after.lifecycle.observe({ ...after.context, view }), false);
    assert.equal(after.lifecycle.active(binding, after.epoch), true);
  }
  assert.equal(after.lifecycle.generation, 0);
});

test('interleaved runs reject late capture, late binding, duplicate submit and duplicate consume', () => {
  const { lifecycle, state, epoch } = running();
  assert.equal(lifecycle.consume(binding, epoch, state, state, false), false);
  const next = { ...binding, runId: 'next', captureId: 'next-capture' };
  const nextEpoch = lifecycle.begin(next);
  assert.equal(lifecycle.submit(binding, epoch), false);
  assert.equal(lifecycle.submit(next, epoch), false);
  assert.equal(lifecycle.submit(binding, nextEpoch), false);
  assert.equal(lifecycle.submit(next, nextEpoch), true);
  assert.equal(lifecycle.submit(next, nextEpoch), false);
  assert.equal(lifecycle.consume(binding, epoch, state, state, false), false);
  assert.equal(lifecycle.consume(next, nextEpoch, state, state, false), true);
  assert.equal(lifecycle.consume(next, nextEpoch, state, state, false), false);
  const reusedEpoch = lifecycle.begin(next);
  assert.equal(lifecycle.active(next, nextEpoch), false);
  assert.equal(lifecycle.active(next, reusedEpoch), true);
});

test('cancel, timeout and discard invalidation reject all late work', () => {
  for (const submitted of [false, true]) {
    const { lifecycle, state, epoch } = running();
    if (submitted) lifecycle.submit(binding, epoch);
    lifecycle.invalidate();
    assert.equal(lifecycle.binding, null);
    assert.equal(lifecycle.submitted, false);
    assert.equal(lifecycle.consume(binding, epoch, state, state, false), false);
  }
});

test('Apply preserves all non-path metadata and creates exactly one Undo/Redo entry', () => {
  const { lifecycle, state, epoch } = running();
  lifecycle.submit(binding, epoch);
  const candidate = proposal();
  const original = structuredClone(state);
  const applied = applyAssistantProposal(state, state, lifecycle, binding, epoch, candidate, false);
  const { waypoints: _old, ...oldFields } = state.draft;
  const { waypoints: _new, ...newFields } = applied.draft;
  assert.deepEqual(newFields, oldFields);
  assert.strictEqual(applied.baseline, state.baseline);
  assert.equal(applied.nextWaypointId, state.nextWaypointId);
  assert.deepEqual(applied.draft.waypoints, candidate.waypoints);
  assert.deepEqual(applied.pastPaths, [state.draft.waypoints]);
  assert.deepEqual(applied.futurePaths, []);
  assert.strictEqual(
    applyAssistantProposal(applied, state, lifecycle, binding, epoch, candidate, false),
    applied,
  );
  assert.strictEqual(
    applyAssistantProposal(state, state, lifecycle, binding, epoch, candidate, false),
    state,
  );
  const undone = undoRoutePath(applied);
  assert.deepEqual(undone.draft, state.draft);
  assert.deepEqual(undone.pastPaths, []);
  assert.deepEqual(redoRoutePath(undone).draft, applied.draft);
  assert.deepEqual(state, original);
});

test('validation accepts complete generated paths at 2/50/1000 points without decoding PNG', () => {
  const image = snapshot();
  for (const count of [2, 50, 1000]) {
    const path = Array.from({ length: count }, (_, i) =>
      point(`new-${i}`, i / 100000, (i % 2) / 100000),
    );
    assert.equal(validateAssistantProposal(proposal(path), image, null), true);
  }
  for (const count of [0, 1, 1001]) {
    assert.equal(
      validateAssistantProposal(
        proposal(Array.from({ length: count }, (_, i) => point(`new-${i}`))),
        image,
        null,
      ),
      false,
    );
  }
});

test('validation rejects malformed payloads, bindings, sources and waypoint identities', () => {
  const image = snapshot();
  for (const value of [
    null,
    undefined,
    [],
    'proposal',
    42,
    {},
    { ...proposal(), binding: null },
    { ...proposal(), source: 'verified-road' },
    { ...proposal(), waypoints: null },
    { ...proposal(), removedEventIds: null },
  ]) {
    assert.equal(validateAssistantProposal(value, image, null), false);
  }
  for (const key of Object.keys(binding) as (keyof AssistantBinding)[]) {
    assert.equal(
      validateAssistantProposal(
        { ...proposal(), binding: { ...binding, [key]: 'forged' } },
        image,
        null,
      ),
      false,
      key,
    );
  }
  for (const id of ['', 'x'.repeat(129), null, 123]) {
    const p = proposal();
    (p.waypoints[0] as unknown as Record<string, unknown>).draftId = id;
    assert.equal(validateAssistantProposal(p, image, null), false);
  }
  const duplicate = proposal([point('same'), point('same', 0.001)]);
  assert.equal(validateAssistantProposal(duplicate, image, null), false);
  const unknownWithEvent = proposal([
    { ...point('unknown-reference'), speedKmh: 10 },
    point('new'),
  ]);
  assert.equal(validateAssistantProposal(unknownWithEvent, image, null), false);
});

test('validation rejects invalid numbers, geographic ranges and generated points outside the image', () => {
  const image = snapshot();
  for (const field of ['latitude', 'longitude'] as const) {
    for (const value of [
      NaN,
      Infinity,
      -Infinity,
      field === 'latitude' ? 90.01 : 180.01,
      field === 'latitude' ? -90.01 : -180.01,
      '0',
      null,
    ]) {
      const p = proposal();
      (p.waypoints[0] as unknown as Record<string, unknown>)[field] = value;
      assert.equal(validateAssistantProposal(p, image, null), false, `${field}:${value}`);
    }
  }
  for (const p of [
    point('outside', 4),
    point('outside', -4),
    point('outside', 0, 4),
    point('outside', 0, -4),
  ]) {
    assert.equal(validateAssistantProposal(proposal([p, point('other')]), image, null), false);
  }
  for (const transform of [
    { ...image.transform, xAxis: [0, 0] },
    { ...image.transform, origin: [NaN, 0] },
  ]) {
    assert.equal(
      validateAssistantProposal(proposal(), { ...image, transform } as AssistantSnapshot, null),
      false,
    );
  }
});

test('wide, rotated and date-line candidate points use the frozen center world', () => {
  for (const transform of [
    { origin: [0, 0.4], xAxis: [0.75, 0], yAxis: [0, 0.2], checks: [] },
    { origin: [0.8, 0.4], xAxis: [0.75, 0], yAxis: [0, 0.2], checks: [] },
    { origin: [0.95, 0.35], xAxis: [0.6, 0.15], yAxis: [-0.15, 0.2], checks: [] },
  ] satisfies AssistantSnapshot['transform'][]) {
    const image = { ...snapshot(), transform, waypoints: [] };
    const points = [
      [0.95, 0.2],
      [0.6, 0.4],
    ].map(([u, v], index) => {
      const x = transform.origin[0] + u * transform.xAxis[0] + v * transform.yAxis[0];
      const y = transform.origin[1] + u * transform.xAxis[1] + v * transform.yAxis[1];
      return point(
        `new-${index}`,
        ((((x * 360) % 360) + 360) % 360) - 180,
        (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
      );
    });
    const p = proposal(points);
    p.removedEventIds = [];
    assert.equal(validateAssistantProposal(p, image, null), true);
  }
});

test('wide legs cannot silently choose an unseen short arc', () => {
  const image = {
    ...snapshot(),
    waypoints: [],
    transform: {
      origin: [0, 0.4],
      xAxis: [0.75, 0],
      yAxis: [0, 0.2],
      checks: [],
    } satisfies AssistantSnapshot['transform'],
  };
  const p = proposal([point('a', -153), point('b', 63)]);
  p.removedEventIds = [];
  assert.equal(validateAssistantProposal(p, image, null), false);
  p.waypoints.splice(1, 0, point('middle', -45));
  p.distanceMeters = meters(p.waypoints);
  assert.equal(validateAssistantProposal(p, image, null), true);
});

test('retained and visible moved waypoints preserve exact identities and events; offscreen moves fail', () => {
  const image = snapshot();
  const retained = proposal(structuredClone(image.waypoints));
  retained.removedEventIds = [];
  assert.equal(validateAssistantProposal(retained, image, null), true);
  const moved = proposal([{ ...image.waypoints[0], longitude: 0.002 }, image.waypoints[1]]);
  moved.removedEventIds = [];
  assert.equal(validateAssistantProposal(moved, image, null), true);
  for (const changed of [{ longitude: 4 }, { speedKmh: null }, { pauseSeconds: 0 }]) {
    const p = proposal([{ ...image.waypoints[0], ...changed }, image.waypoints[1]]);
    p.removedEventIds = [];
    assert.equal(validateAssistantProposal(p, image, null), false);
  }
  const offscreen = proposal([image.waypoints[0], { ...image.waypoints[2], longitude: 0.001 }]);
  offscreen.removedEventIds = [];
  assert.equal(validateAssistantProposal(offscreen, image, null), false);
  for (const changed of [
    { speedKmh: 12 },
    { pauseSeconds: 0 },
    { speedKmh: undefined },
    { pauseSeconds: NaN },
  ]) {
    const malformed = proposal([point('new'), point('new-2')]);
    Object.assign(malformed.waypoints[0], changed);
    assert.equal(validateAssistantProposal(malformed, image, null), false);
  }
});

test('removed-event declarations must be complete, exact and unique', () => {
  const image = snapshot();
  for (const removedEventIds of [[], ['unknown'], ['event', 'event'], ['event', 'plain'], [null]]) {
    assert.equal(validateAssistantProposal({ ...proposal(), removedEventIds }, image, null), false);
  }
  assert.equal(validateAssistantProposal(proposal(), image, null), true);
});

test('distance validation uses stored segments with absolute and relative tolerance', () => {
  const image = snapshot();
  for (const distanceMeters of [NaN, Infinity, -1, '111', null]) {
    assert.equal(validateAssistantProposal({ ...proposal(), distanceMeters }, image, null), false);
  }
  for (const delta of [-0.99, 0.99, 1.01]) {
    const p = proposal();
    p.distanceMeters += delta;
    assert.equal(validateAssistantProposal(p, image, null), delta !== 1.01);
  }
  const long = proposal([point('a', -1), point('b', 1)]);
  for (const ratio of [0.00099, 0.00101]) {
    assert.equal(
      validateAssistantProposal(
        { ...long, distanceMeters: long.distanceMeters * (1 + ratio) },
        image,
        null,
      ),
      ratio < 0.001,
    );
  }
  assert.equal(validateAssistantProposal(proposal([point('a'), point('b')]), image, null), true);
});

test('loop validation enforces target range, ten-percent distance and ten-meter closure', () => {
  const image = snapshot();
  const loop = proposal([point('a'), point('b', 0.001), point('c')]);
  for (const factor of [1, 1 / 1.099, 1 / 1.101, 1 / 0.901, 1 / 0.899]) {
    const target = loop.distanceMeters * factor;
    const expected = Math.abs(loop.distanceMeters - target) <= target * 0.1;
    assert.equal(
      validateAssistantProposal({ ...loop, loopTargetMeters: target }, image, target),
      expected,
    );
  }
  for (const target of [99, 20001, NaN, Infinity]) {
    assert.equal(
      validateAssistantProposal({ ...loop, loopTargetMeters: target }, image, target),
      false,
    );
  }
  assert.equal(validateAssistantProposal(loop, image, loop.distanceMeters), false);
  for (const closureMeters of [9.9, 10.1]) {
    const p = proposal([
      point('a'),
      point('b', 0.001),
      point('c', ((closureMeters / 6371000) * 180) / Math.PI),
    ]);
    p.loopTargetMeters = p.distanceMeters;
    assert.equal(validateAssistantProposal(p, image, p.distanceMeters), closureMeters < 10);
  }
  for (const target of [100, 20000]) {
    const longitude = ((target / 2 / 6371000) * 180) / Math.PI;
    const p = proposal([point('a'), point('b', longitude), point('c')]);
    p.loopTargetMeters = target;
    assert.equal(validateAssistantProposal(p, image, target), true);
  }
});

test('event buffer emits only complete lines across arbitrary partial chunks', () => {
  const events = [
    { type: 'status', status: 'working', binding },
    { type: 'proposal', proposal: proposal(), binding },
    { type: 'done', binding },
  ];
  const text = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
  for (const width of [1, 7, 4096]) {
    const buffer = new AssistantEventBuffer();
    const result: unknown[] = [];
    for (let i = 0; i < text.length; i += width)
      result.push(...buffer.push(text.slice(i, i + width)));
    buffer.finish();
    assert.deepEqual(result, events);
  }
  const buffer = new AssistantEventBuffer();
  assert.deepEqual(buffer.push(' \r\n\n'), []);
  assert.deepEqual(buffer.push('{"type":'), []);
  assert.deepEqual(buffer.push('"done"}\r\n'), [{ type: 'done' }]);
  buffer.finish();
});

test('event buffer rejects malformed JSON and incomplete final events', () => {
  for (const text of ['not-json\n', '{"type":}\n', '{} trailing\n']) {
    assert.throws(() => new AssistantEventBuffer().push(text), SyntaxError);
  }
  for (const text of ['{', '{"type":"done"}', '{"type":']) {
    const buffer = new AssistantEventBuffer();
    assert.deepEqual(buffer.push(text), []);
    assert.throws(() => buffer.finish(), /incomplete/);
  }
  const whitespace = new AssistantEventBuffer();
  whitespace.push(' \t\r');
  assert.doesNotThrow(() => whitespace.finish());
});

test('event buffer enforces cumulative byte and 32-event limits across chunks', () => {
  const exact = new AssistantEventBuffer();
  assert.equal(exact.push('{}\n'.repeat(32)).length, 32);
  exact.finish();
  assert.throws(() => exact.push('{}\n'), /limit/);
  assert.throws(() => new AssistantEventBuffer().push('{}\n'.repeat(33)), /limit/);
  const bytes = new AssistantEventBuffer();
  bytes.push(' '.repeat(256 * 1024));
  bytes.push(' '.repeat(256 * 1024));
  assert.throws(() => bytes.push(' '), /limit/);
  assert.throws(() => new AssistantEventBuffer().push('é'.repeat(256 * 1024 + 1)), /limit/);
  const cumulative = new AssistantEventBuffer();
  cumulative.push(`${' '.repeat(300 * 1024)}\n`);
  assert.throws(() => cumulative.push(`${' '.repeat(220 * 1024)}\n`), /limit/);
});

test('Save blocks Apply and functional updates reject current !== captured even before observe', () => {
  for (const saving of [true, false]) {
    const { lifecycle, state, epoch } = running();
    lifecycle.submit(binding, epoch);
    const current = saving ? state : structuredClone(state);
    assert.strictEqual(
      applyAssistantProposal(current, state, lifecycle, binding, epoch, proposal(), saving),
      current,
    );
    assert.equal(lifecycle.consumed, false);
  }
});
