import type { AiSettings } from '../../lib/ai.ts';
import type {
  AssistantBinding,
  AssistantProposal,
  AssistantSnapshot,
  AssistantWaypoint,
} from '../../lib/route-assistant.ts';
import { type RouteDraftState, replaceRoutePath } from './routeDraftState.ts';

/** Lease-only OAuth refresh does not replace the selected credential. */
export function assistantSettingsKey(settings: AiSettings | null) {
  const selection = settings?.selection;
  const connection = settings?.connections.find(
    (c) => c.providerId === selection?.providerId && c.authMethod === selection?.authMethod,
  );
  const status =
    connection?.authMethod === 'oauth' && connection.refreshing === true
      ? 'connected'
      : connection?.status;
  return JSON.stringify([
    settings?.generation,
    selection,
    connection && {
      providerId: connection.providerId,
      authMethod: connection.authMethod,
      generation: connection.generation,
      status,
    },
  ]);
}

const bindingKeys = [
  'userId',
  'sessionId',
  'editorId',
  'routeId',
  'draftGeneration',
  'settingsGeneration',
  'connectionGeneration',
  'runId',
  'captureId',
] as const;
export function sameAssistantBinding(a: AssistantBinding, b: AssistantBinding): boolean {
  return bindingKeys.every((key) => a?.[key] === b?.[key]);
}

export type AssistantContext = {
  draft: RouteDraftState;
  routeId: string;
  owner: string;
  settings: string;
  view: number;
};

/** Reference changes are generations: coordinate equality must never revive a run. */
export class AssistantLifecycle {
  generation = 0;
  epoch = 0;
  submitted = false;
  consumed = false;
  binding: AssistantBinding | null = null;
  context: AssistantContext | null = null;
  observe(next: AssistantContext): boolean {
    const old = this.context;
    this.context = next;
    const draftChanged = old !== null && (old.draft !== next.draft || old.routeId !== next.routeId);
    if (draftChanged) this.generation++;
    const changed =
      old !== null &&
      (draftChanged ||
        old.owner !== next.owner ||
        old.settings !== next.settings ||
        (!this.submitted && old.view !== next.view));
    if (changed) this.invalidate();
    return changed;
  }
  invalidate() {
    this.epoch++;
    this.binding = null;
    this.submitted = false;
    this.consumed = false;
  }
  begin(binding: AssistantBinding): number {
    this.invalidate();
    this.binding = binding;
    return this.epoch;
  }
  active(binding: AssistantBinding, epoch: number): boolean {
    return (
      this.epoch === epoch && this.binding !== null && sameAssistantBinding(this.binding, binding)
    );
  }
  submit(binding: AssistantBinding, epoch: number): boolean {
    if (!this.active(binding, epoch) || this.submitted) return false;
    this.submitted = true;
    return true;
  }
  consume(
    binding: AssistantBinding,
    epoch: number,
    current: RouteDraftState,
    captured: RouteDraftState,
    saving: boolean,
  ): boolean {
    if (
      saving ||
      this.consumed ||
      current !== captured ||
      !this.submitted ||
      !this.active(binding, epoch)
    )
      return false;
    this.consumed = true;
    return true;
  }
}

function distance(a: AssistantWaypoint, b: AssistantWaypoint) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * r) / 2) ** 2 +
    Math.cos(a.latitude * r) *
      Math.cos(b.latitude * r) *
      Math.sin(((b.longitude - a.longitude) * r) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function visibleWorldX(point: AssistantWaypoint, snapshot: AssistantSnapshot) {
  const { origin, xAxis, yAxis } = snapshot.transform;
  const x = (point.longitude + 180) / 360;
  return x + Math.round(origin[0] + (xAxis[0] + yAxis[0]) / 2 - x);
}
function insideImage(point: AssistantWaypoint, snapshot: AssistantSnapshot) {
  const { origin, xAxis, yAxis } = snapshot.transform;
  const x = visibleWorldX(point, snapshot);
  const lat = (point.latitude * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2;
  const determinant = xAxis[0] * yAxis[1] - xAxis[1] * yAxis[0];
  if (!Number.isFinite(determinant) || determinant === 0) return false;
  const dx = x - origin[0];
  const dy = y - origin[1];
  const u = (dx * yAxis[1] - dy * yAxis[0]) / determinant;
  const v = (dy * xAxis[0] - dx * xAxis[1]) / determinant;
  return (
    Number.isFinite(u) &&
    Number.isFinite(v) &&
    u >= -1e-7 &&
    u <= 1 + 1e-7 &&
    v >= -1e-7 &&
    v <= 1 + 1e-7
  );
}

/** Defensive client validation, in addition to authoritative server validation. */
export function validateAssistantProposal(
  value: unknown,
  snapshot: AssistantSnapshot,
  loopTarget: number | null,
): value is AssistantProposal {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as AssistantProposal;
  if (
    !sameAssistantBinding(p.binding, snapshot.binding) ||
    p.source !== 'OpenStreetMap' ||
    p.loopTargetMeters !== loopTarget ||
    !Array.isArray(p.waypoints) ||
    p.waypoints.length < 2 ||
    p.waypoints.length > 1000 ||
    !Array.isArray(p.removedEventIds)
  )
    return false;
  const originals = new Map(snapshot.waypoints.map((point) => [point.draftId, point]));
  const visible = new Set(snapshot.visibleMarkers.map((point) => point.draftId));
  const ids = new Set<string>();
  for (const point of p.waypoints) {
    if (
      !point ||
      typeof point.draftId !== 'string' ||
      point.draftId.length === 0 ||
      point.draftId.length > 128 ||
      ids.has(point.draftId) ||
      !Number.isFinite(point.latitude) ||
      Math.abs(point.latitude) > 90 ||
      !Number.isFinite(point.longitude) ||
      Math.abs(point.longitude) > 180
    )
      return false;
    ids.add(point.draftId);
    const old = originals.get(point.draftId);
    if (old) {
      if (point.speedKmh !== old.speedKmh || point.pauseSeconds !== old.pauseSeconds) return false;
      if (
        (point.latitude !== old.latitude || point.longitude !== old.longitude) &&
        (!visible.has(point.draftId) || !insideImage(point, snapshot))
      )
        return false;
    } else if (
      point.speedKmh !== null ||
      point.pauseSeconds !== null ||
      !insideImage(point, snapshot)
    )
      return false;
  }
  for (let index = 0; index < snapshot.waypoints.length; index++) {
    const original = snapshot.waypoints[index];
    const position = p.waypoints.findIndex((point) => point.draftId === original.draftId);
    if (position < 0 || insideImage(original, snapshot)) continue;
    if (
      (index === 0 && position !== 0) ||
      (index === snapshot.waypoints.length - 1 && position !== p.waypoints.length - 1)
    )
      return false;
    for (const direction of [-1, 1]) {
      const oldNeighbor = snapshot.waypoints[index + direction];
      if (!oldNeighbor) continue;
      const neighbor = p.waypoints[position + direction];
      if (
        !neighbor ||
        neighbor.draftId !== oldNeighbor.draftId ||
        neighbor.latitude !== oldNeighbor.latitude ||
        neighbor.longitude !== oldNeighbor.longitude
      )
        return false;
    }
  }
  for (let i = 1; i < p.waypoints.length; i++) {
    const a = p.waypoints[i - 1],
      b = p.waypoints[i];
    if (
      insideImage(a, snapshot) &&
      insideImage(b, snapshot) &&
      Math.abs(visibleWorldX(a, snapshot) - visibleWorldX(b, snapshot)) >= 0.5 - 1e-12
    )
      return false;
  }
  const removed = snapshot.waypoints
    .filter(
      (point) =>
        !ids.has(point.draftId) && (point.speedKmh !== null || point.pauseSeconds !== null),
    )
    .map((point) => point.draftId);
  if (
    p.removedEventIds.length !== removed.length ||
    new Set(p.removedEventIds).size !== removed.length ||
    !removed.every((id) => p.removedEventIds.includes(id))
  )
    return false;
  const meters = p.waypoints
    .slice(1)
    .reduce((total, point, i) => total + distance(p.waypoints[i], point), 0);
  if (
    !Number.isFinite(p.distanceMeters) ||
    p.distanceMeters < 0 ||
    Math.abs(meters - p.distanceMeters) > Math.max(1, meters * 0.001)
  )
    return false;
  if (
    loopTarget !== null &&
    (p.waypoints.some((point) => !insideImage(point, snapshot)) ||
      loopTarget < 100 ||
      loopTarget > 20000 ||
      Math.abs(meters - loopTarget) > loopTarget * 0.1 ||
      distance(p.waypoints[0], p.waypoints[p.waypoints.length - 1]) > 10)
  )
    return false;
  return true;
}

export function applyAssistantProposal(
  current: RouteDraftState,
  captured: RouteDraftState,
  lifecycle: AssistantLifecycle,
  binding: AssistantBinding,
  epoch: number,
  proposal: AssistantProposal,
  saving: boolean,
): RouteDraftState {
  return lifecycle.consume(binding, epoch, current, captured, saving)
    ? replaceRoutePath(current, proposal.waypoints)
    : current;
}

/** Finite NDJSON carry and event count; never expose raw provider text. */
export class AssistantEventBuffer {
  private carry = '';
  private bytes = 0;
  private count = 0;
  push(text: string): unknown[] {
    this.bytes += new TextEncoder().encode(text).byteLength;
    this.carry += text;
    if (this.bytes > 512 * 1024 || this.carry.length > 512 * 1024) throw new Error('limit');
    const lines = this.carry.split('\n');
    this.carry = lines.pop() ?? '';
    return lines
      .filter((line) => line.trim())
      .map((line) => {
        if (++this.count > 32) throw new Error('limit');
        return JSON.parse(line);
      });
  }
  finish() {
    if (this.carry.trim()) throw new Error('incomplete');
  }
}
