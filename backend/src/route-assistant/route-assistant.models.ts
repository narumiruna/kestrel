export const ROUTE_ASSISTANT_LIMITS = {
  bodyBytes: 4 * 1024 * 1024,
  pngBytes: 2 * 1024 * 1024,
  imageSide: 1600,
  imagePixels: 2_560_000,
  captureMs: 5_000,
  captureAgeMs: 120_000,
  reviewMs: 600_000,
  runMs: 90_000,
  requestCharacters: 2000,
  points: 1000,
  tools: 8,
  turns: 4,
  outputTokens: 16_384,
  candidates: 3,
  loopMinMeters: 100,
  loopMaxMeters: 20_000,
  loopError: 0.1,
  loopClosureMeters: 10,
  projectionErrorPixels: 0.25,
  concurrentRuns: 4,
  startsPerMinute: 4,
} as const;

export type AssistantBinding = {
  userId: string;
  sessionId: string;
  editorId: string;
  routeId: string;
  draftGeneration: number;
  settingsGeneration: number;
  connectionGeneration: number;
  runId: string;
  captureId: string;
};
export type AssistantWaypoint = {
  draftId: string;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  pauseSeconds: number | null;
};
export type AssistantMarker = {
  draftId: string;
  label: string;
  u: number;
  v: number;
};
export type AssistantView = {
  projection: 'mercator';
  pitch: number;
  bearing: number;
  zoom: number;
  center: [number, number];
  bounds: [number, number, number, number];
  style: 'plain' | 'dark' | 'terrain';
  cssWidth: number;
  cssHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  width: number;
  height: number;
  pixelScale: number;
  mapRect: { left: number; top: number; width: number; height: number };
};
export type AssistantTransform = {
  origin: [number, number];
  xAxis: [number, number];
  yAxis: [number, number];
  checks: { u: number; v: number; x: number; y: number }[];
};
export type AssistantSnapshot = {
  binding: AssistantBinding;
  capturedAt: number;
  view: AssistantView;
  transform: AssistantTransform;
  waypoints: AssistantWaypoint[];
  visibleMarkers: AssistantMarker[];
  png: string;
};
export type AssistantRunInput = {
  request: string;
  snapshot: AssistantSnapshot;
  loopTargetMeters: number | null;
};
export type AssistantPathEntry =
  | { kind: 'retain'; draftId: string }
  | { kind: 'image'; u: number; v: number; draftId?: string };
export type AssistantProposal = {
  binding: AssistantBinding;
  waypoints: AssistantWaypoint[];
  distanceMeters: number;
  removedEventIds: string[];
  loopTargetMeters: number | null;
  source: 'OpenStreetMap';
};
export type AssistantClarification =
  'unclear' | 'ambiguous' | 'offscreen' | 'unsupported';
export type AssistantEvent = { binding: AssistantBinding } & (
  | { type: 'status'; status: 'working' | 'validating' }
  | { type: 'proposal'; proposal: AssistantProposal }
  | { type: 'clarification'; reason: AssistantClarification }
  | { type: 'error'; code: string }
  | { type: 'done' }
);
