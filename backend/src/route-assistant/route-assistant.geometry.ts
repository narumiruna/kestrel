import { aiError } from '../ai/ai-errors';
import {
  AssistantRunInput,
  AssistantProposal,
  AssistantWaypoint,
  ROUTE_ASSISTANT_LIMITS as L,
} from './route-assistant.models';
import {
  exactObject,
  finiteNumber,
  transformPosition,
  inversePosition,
  snapshotWorldX,
  mercator,
} from './route-assistant.validation';

export function haversineMeters(
  a: Pick<AssistantWaypoint, 'latitude' | 'longitude'>,
  b: Pick<AssistantWaypoint, 'latitude' | 'longitude'>,
): number {
  const radians = Math.PI / 180;
  const dlat = (b.latitude - a.latitude) * radians,
    dlon = (b.longitude - a.longitude) * radians;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
export function createAssistantProposal(
  input: AssistantRunInput,
  entries: unknown,
): AssistantProposal {
  if (
    !Array.isArray(entries) ||
    entries.length < 2 ||
    entries.length > L.points
  )
    return aiError('RA_POINT_LIMIT');
  const known = new Map(input.snapshot.waypoints.map((p) => [p.draftId, p]));
  const visible = new Set(input.snapshot.visibleMarkers.map((m) => m.draftId));
  const used = new Set<string>();
  const waypoints = entries.map((entry: unknown, index): AssistantWaypoint => {
    const raw = exactObject(entry, ['kind'], ['draftId', 'u', 'v']);
    if (raw.kind !== 'retain' && raw.kind !== 'image')
      return aiError('RA_INVALID_ENTRY');
    exactObject(
      entry,
      raw.kind === 'retain' ? ['kind', 'draftId'] : ['kind', 'u', 'v'],
      raw.kind === 'image' ? ['draftId'] : [],
    );
    let original: AssistantWaypoint | undefined;
    if (raw.draftId !== undefined) {
      if (
        typeof raw.draftId !== 'string' ||
        !(original = known.get(raw.draftId)) ||
        used.has(raw.draftId)
      )
        return aiError('RA_INVALID_REFERENCE');
      used.add(raw.draftId);
    }
    if (raw.kind === 'retain') return { ...original! };
    if (original && !visible.has(original.draftId))
      return aiError('RA_OFFSCREEN_MOVE');
    const [x, y] = transformPosition(
      input.snapshot.transform,
      finiteNumber(raw.u, 0, 1),
      finiteNumber(raw.v, 0, 1),
    );
    const latitude =
      (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
    const longitude = ((((x * 360 - 180) % 360) + 540) % 360) - 180;
    finiteNumber(latitude, -90, 90);
    finiteNumber(longitude, -180, 180);
    const draftId =
      original?.draftId ?? `${input.snapshot.binding.runId}:${index}`;
    if (!original && (known.has(draftId) || used.has(draftId)))
      return aiError('RA_INVALID_REFERENCE');
    used.add(draftId);
    return {
      draftId,
      latitude,
      longitude,
      speedKmh: original?.speedKmh ?? null,
      pauseSeconds: original?.pauseSeconds ?? null,
    };
  });
  const indices = new Map(
    waypoints.map((point, index) => [point.draftId, index]),
  );
  const inside = (point: AssistantWaypoint) => {
    const [x, y] = mercator(point.latitude, point.longitude);
    const [u, v] = inversePosition(
      input.snapshot.transform,
      snapshotWorldX(input.snapshot.transform, x),
      y,
    );
    return u >= -1e-7 && u <= 1 + 1e-7 && v >= -1e-7 && v <= 1 + 1e-7;
  };
  // A retained off-screen point may keep existing legs, not create unseen connections.
  input.snapshot.waypoints.forEach((point, index, originals) => {
    const nextIndex = indices.get(point.draftId);
    if (inside(point) || nextIndex === undefined) return;
    if (
      (index === 0 && nextIndex !== 0) ||
      (index === originals.length - 1 && nextIndex !== waypoints.length - 1)
    )
      return aiError('RA_OFFSCREEN_CONTEXT');
    for (const direction of [-1, 1]) {
      const oldNeighbor = originals[index + direction];
      if (!oldNeighbor) continue;
      const neighbor = waypoints[nextIndex + direction];
      if (
        !neighbor ||
        neighbor.draftId !== oldNeighbor.draftId ||
        neighbor.latitude !== oldNeighbor.latitude ||
        neighbor.longitude !== oldNeighbor.longitude
      )
        return aiError('RA_OFFSCREEN_CONTEXT');
    }
  });
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1],
      b = waypoints[i];
    if (
      inside(a) &&
      inside(b) &&
      Math.abs(
        snapshotWorldX(input.snapshot.transform, (a.longitude + 180) / 360) -
          snapshotWorldX(input.snapshot.transform, (b.longitude + 180) / 360),
      ) >=
        0.5 - 1e-12
    )
      return aiError('RA_OFFSCREEN_CONTEXT');
  }
  let distanceMeters = 0;
  for (let i = 1; i < waypoints.length; i++)
    distanceMeters += haversineMeters(waypoints[i - 1], waypoints[i]);
  const target = input.loopTargetMeters;
  if (
    target !== null &&
    (!Number.isFinite(target) ||
      waypoints.some((point) => !inside(point)) ||
      target < L.loopMinMeters ||
      target > L.loopMaxMeters ||
      haversineMeters(waypoints[0], waypoints[waypoints.length - 1]) >
        L.loopClosureMeters ||
      Math.abs(distanceMeters - target) / target > L.loopError)
  )
    return aiError('RA_LOOP_TOLERANCE');
  return {
    binding: { ...input.snapshot.binding },
    waypoints,
    distanceMeters,
    removedEventIds: input.snapshot.waypoints
      .filter(
        (p) =>
          !used.has(p.draftId) &&
          (p.speedKmh !== null || p.pauseSeconds !== null),
      )
      .map((p) => p.draftId),
    loopTargetMeters: target,
    source: 'OpenStreetMap',
  };
}
