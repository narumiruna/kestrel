import { aiError } from '../ai/ai-errors';
import {
  AssistantRunInput,
  AssistantTransform,
  ROUTE_ASSISTANT_LIMITS as L,
} from './route-assistant.models';
import { validateAssistantPng } from './route-assistant.png';

export function exactObject(
  value: unknown,
  keys: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return aiError('RA_INVALID_INPUT');
  const obj = value as Record<string, unknown>;
  if (
    keys.some((key) => !Object.hasOwn(obj, key)) ||
    Object.keys(obj).some(
      (key) => !keys.includes(key) && !optional.includes(key),
    )
  )
    return aiError('RA_INVALID_INPUT');
  return obj;
}
export function finiteNumber(
  value: unknown,
  min = -Infinity,
  max = Infinity,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    return aiError('RA_INVALID_INPUT');
  return value;
}
function text(value: unknown, max = 128): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && code !== 9 && code !== 10) || code === 127;
    })
  )
    return aiError('RA_INVALID_INPUT');
  return value;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    return aiError('RA_INVALID_INPUT');
  return value as unknown[];
}
function pair(value: unknown): number[] {
  const items = array(value, 2);
  if (items.length !== 2) return aiError('RA_INVALID_INPUT');
  return items.map((item) => finiteNumber(item));
}
export function mercator(
  latitude: number,
  longitude: number,
): [number, number] {
  return [
    (longitude + 180) / 360,
    (1 - Math.asinh(Math.tan((latitude * Math.PI) / 180)) / Math.PI) / 2,
  ];
}
export function transformPosition(
  t: AssistantTransform,
  u: number,
  v: number,
): [number, number] {
  return [
    t.origin[0] + u * t.xAxis[0] + v * t.yAxis[0],
    t.origin[1] + u * t.xAxis[1] + v * t.yAxis[1],
  ];
}
/** Choose the single visible world around the frozen view center, not a corner. */
export function snapshotWorldX(t: AssistantTransform, x: number): number {
  return x + Math.round(t.origin[0] + (t.xAxis[0] + t.yAxis[0]) / 2 - x);
}
export function inversePosition(
  t: AssistantTransform,
  x: number,
  y: number,
): [number, number] {
  const dx = x - t.origin[0],
    dy = y - t.origin[1];
  const det = t.xAxis[0] * t.yAxis[1] - t.yAxis[0] * t.xAxis[1];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-24)
    return aiError('RA_INVALID_TRANSFORM');
  return [
    (dx * t.yAxis[1] - dy * t.yAxis[0]) / det,
    (dy * t.xAxis[0] - dx * t.xAxis[1]) / det,
  ];
}
export function validateAssistantInput(
  input: unknown,
  userId: string,
  sessionId: string,
  now = Date.now(),
): AssistantRunInput {
  const root = exactObject(input, ['request', 'snapshot', 'loopTargetMeters']);
  text(root.request, L.requestCharacters);
  if (root.loopTargetMeters !== null)
    finiteNumber(root.loopTargetMeters, L.loopMinMeters, L.loopMaxMeters);
  const s = exactObject(root.snapshot, [
    'binding',
    'capturedAt',
    'view',
    'transform',
    'waypoints',
    'visibleMarkers',
    'png',
  ]);
  const b = exactObject(s.binding, [
    'userId',
    'sessionId',
    'editorId',
    'routeId',
    'draftGeneration',
    'settingsGeneration',
    'connectionGeneration',
    'runId',
    'captureId',
  ]);
  for (const key of [
    'userId',
    'sessionId',
    'editorId',
    'routeId',
    'runId',
    'captureId',
  ])
    text(b[key]);
  if (b.userId !== userId || b.sessionId !== sessionId)
    return aiError('RA_OWNER_MISMATCH', 403);
  for (const key of [
    'draftGeneration',
    'settingsGeneration',
    'connectionGeneration',
  ]) {
    const n = finiteNumber(b[key], 0, 2147483646);
    if (!Number.isInteger(n)) return aiError('RA_INVALID_GENERATION');
  }
  finiteNumber(now);
  finiteNumber(s.capturedAt, now - L.captureAgeMs, now + 5000);
  const v = exactObject(s.view, [
    'projection',
    'pitch',
    'bearing',
    'zoom',
    'center',
    'bounds',
    'style',
    'cssWidth',
    'cssHeight',
    'canvasWidth',
    'canvasHeight',
    'width',
    'height',
    'pixelScale',
    'mapRect',
  ]);
  if (
    v.projection !== 'mercator' ||
    v.pitch !== 0 ||
    !['plain', 'dark', 'terrain'].includes(String(v.style))
  )
    return aiError('RA_UNSUPPORTED_VIEW');
  finiteNumber(v.bearing, -360, 360);
  finiteNumber(v.zoom, 0, 24);
  const center = pair(v.center);
  finiteNumber(center[0], -180, 180);
  finiteNumber(center[1], -85.051129, 85.051129);
  const bounds = array(v.bounds, 4);
  if (bounds.length !== 4) return aiError('RA_INVALID_INPUT');
  bounds.forEach((n) => finiteNumber(n));
  finiteNumber(bounds[0], -180, 180);
  finiteNumber(bounds[2], -180, 180);
  finiteNumber(bounds[1], -85.051129, 85.051129);
  finiteNumber(bounds[3], Number(bounds[1]), 85.051129);
  for (const key of [
    'cssWidth',
    'cssHeight',
    'canvasWidth',
    'canvasHeight',
    'width',
    'height',
  ])
    finiteNumber(v[key], 1, 16384);
  const width = finiteNumber(v.width, 1, L.imageSide),
    height = finiteNumber(v.height, 1, L.imageSide);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width * height > L.imagePixels
  )
    return aiError('RA_INVALID_IMAGE_SIZE');
  const scale = finiteNumber(v.pixelScale, 0.01, 16);
  if (
    Math.abs(Number(v.canvasWidth) / Number(v.cssWidth) - scale) > 0.01 ||
    Math.abs(Number(v.canvasHeight) / Number(v.cssHeight) - scale) > 0.01
  )
    return aiError('RA_INVALID_INPUT');
  const rect = exactObject(v.mapRect, ['left', 'top', 'width', 'height']);
  const left = finiteNumber(rect.left, 0, width),
    top = finiteNumber(rect.top, 0, height);
  const rw = finiteNumber(rect.width, 1, width - left),
    rh = finiteNumber(rect.height, 1, height - top);
  const tr = exactObject(s.transform, ['origin', 'xAxis', 'yAxis', 'checks']);
  pair(tr.origin);
  pair(tr.xAxis);
  pair(tr.yAxis);
  const t = tr as unknown as AssistantTransform;
  inversePosition(t, t.origin[0], t.origin[1]);
  const checks = array(tr.checks, 32);
  if (checks.length < 4) return aiError('RA_INVALID_TRANSFORM');
  const coverage = new Set<string>();
  for (const item of checks) {
    const c = exactObject(item, ['u', 'v', 'x', 'y']);
    const u = finiteNumber(c.u, 0, 1),
      vv = finiteNumber(c.v, 0, 1);
    const [a, bb] = inversePosition(t, finiteNumber(c.x), finiteNumber(c.y));
    if (Math.hypot((a - u) * rw, (bb - vv) * rh) > L.projectionErrorPixels)
      return aiError('RA_INVALID_TRANSFORM');
    coverage.add(`${u < 0.5}:${vv < 0.5}`);
  }
  if (coverage.size !== 4) return aiError('RA_INVALID_TRANSFORM');
  const corners = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([u, vv]) => transformPosition(t, u, vv));
  if (
    corners.some((p) => p[1] < 0 || p[1] > 1) ||
    Math.max(...corners.map((p) => p[0])) -
      Math.min(...corners.map((p) => p[0])) >=
      1
  )
    return aiError('RA_UNSUPPORTED_VIEW');
  const points = array(s.waypoints, L.points);
  const ids = new Map<string, Record<string, unknown>>();
  for (const item of points) {
    const p = exactObject(item, [
      'draftId',
      'latitude',
      'longitude',
      'speedKmh',
      'pauseSeconds',
    ]);
    const id = text(p.draftId);
    if (ids.has(id)) return aiError('RA_DUPLICATE_REFERENCE');
    finiteNumber(p.latitude, -90, 90);
    finiteNumber(p.longitude, -180, 180);
    if (p.speedKmh !== null && finiteNumber(p.speedKmh) <= 0)
      return aiError('RA_INVALID_INPUT');
    if (p.pauseSeconds !== null) finiteNumber(p.pauseSeconds, 0);
    ids.set(id, p);
  }
  const markerIds = new Set<string>();
  for (const item of array(s.visibleMarkers, L.points)) {
    const m = exactObject(item, ['draftId', 'label', 'u', 'v']);
    const id = text(m.draftId),
      p = ids.get(id);
    if (!p || markerIds.has(id)) return aiError('RA_INVALID_REFERENCE');
    text(m.label, 128);
    const u = finiteNumber(m.u, 0, 1),
      vv = finiteNumber(m.v, 0, 1);
    const xy = mercator(Number(p.latitude), Number(p.longitude));
    xy[0] = snapshotWorldX(t, xy[0]);
    const [a, bb] = inversePosition(t, ...xy);
    if (Math.hypot((a - u) * rw, (bb - vv) * rh) > L.projectionErrorPixels)
      return aiError('RA_INVALID_MARKER');
    markerIds.add(id);
  }
  validateAssistantPng(s.png, width, height);
  return structuredClone(input) as AssistantRunInput;
}
