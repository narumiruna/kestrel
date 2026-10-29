# Route assistant API

The assistant returns an approximate visual path for explicit review and Apply. It does not save a route, issue a device command, verify roads, geocode, or provide navigation. See the [user guide](web-cloud-guide.md#suggest-a-path-from-a-screenshot), [source terms](route-assistant-source-terms.md), and [operations requirements](operations.md#route-assistant-operations).

## Authentication and transport

- `POST /ai/route-assistant/runs` accepts `application/json` and returns `application/x-ndjson; charset=utf-8`.
- `DELETE /ai/route-assistant/runs/:id` cancels an active run and returns JSON `{ "ok": true }`.
- Both require `Authorization: Bearer <access-token>` bound to the authenticated owner and session. Browser clients use `/api/backend` before these paths. Never put credentials in a URL.
- Client `userId` and `sessionId` are binding assertions, not authentication. Backend compares them to authentication. Existing routes must belong to that user and not be deleted. New drafts use `new:<UUID>`.
- Provider, model, thinking, connection, and credentials come from that user's saved personal AI settings. They are not request-selectable. The selected operation must be image-capable chat. No shared credentials, approval gate, silent substitution, or text-only fallback is available.
- Responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The stream additionally uses `no-transform` and `X-Accel-Buffering: no`. No automatic retry or run replay is supported.

## Typed JSON request

The following TypeScript describes JSON fields, not executable input. All fields are required unless marked `?`. Objects reject unknown properties. Numbers must be finite.

```typescript
type Binding = {
  userId: string;
  sessionId: string;
  editorId: string;
  routeId: string; // owned saved UUID or new:<UUID>
  draftGeneration: number;
  settingsGeneration: number;
  connectionGeneration: number;
  runId: string;
  captureId: string;
};
type Waypoint = {
  draftId: string;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  pauseSeconds: number | null;
};
type Marker = { draftId: string; label: string; u: number; v: number };
type View = {
  projection: 'mercator';
  pitch: 0;
  bearing: number;
  zoom: number;
  center: [number, number]; // longitude, latitude
  bounds: [number, number, number, number]; // west, south, east, north
  style: 'plain' | 'dark' | 'terrain';
  cssWidth: number;
  cssHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  width: number; // output PNG pixels
  height: number;
  pixelScale: number; // canvas backing pixels / CSS pixels
  mapRect: { left: number; top: number; width: number; height: number };
};
type Transform = {
  origin: [number, number]; // normalized Mercator coordinates
  xAxis: [number, number];
  yAxis: [number, number];
  checks: { u: number; v: number; x: number; y: number }[];
};
type Snapshot = {
  binding: Binding;
  capturedAt: number; // Unix milliseconds
  view: View;
  transform: Transform;
  waypoints: Waypoint[]; // ordered full captured draft, including events
  visibleMarkers: Marker[];
  png: string; // base64 PNG, optionally data:image/png;base64, prefix
};
type RunInput = {
  request: string;
  snapshot: Snapshot;
  loopTargetMeters: number | null;
};
```

Bindings include owner/session, editor, route, monotonically increasing draft generation, settings/connection generations, run, and capture IDs. Settings generations must match the server's saved selection and connection. IDs are nonempty strings up to 128 characters; generations are integers from 0 to 2,147,483,646. Do not reuse run IDs. Client draft generations prevent stale UI application; they do not add server-side cross-tab route-write compare-and-swap protection.

The request is nonempty, at most 2000 characters. A loop target is null or 100–20,000 meters. Captured drafts can contain 0–1000 points; final proposals require 2–1000. Waypoint IDs are unique. Latitude is −90…90, longitude −180…180, non-null speed is positive, and non-null pause is nonnegative. Visible marker IDs must resolve to unique captured waypoints; labels are bounded to 128 characters.

### PNG and upload limits

The complete JSON body is at most **4 MiB**. The Next.js proxy and Backend count actual incoming chunks before parsing/buffering the complete body; `Content-Length` alone is not trusted. Exactly one PNG is required, at most **2 MiB encoded bytes**, **2,796,204 base64 characters**, **1600 pixels per side**, and **2,560,000 pixels**. Only RGB/RGBA, 8-bit, non-interlaced PNG is accepted. Signature, headers, dimensions, PNG structure, and decoded scanlines are validated. PNG chunks are limited to **1024** to bound parser metadata overhead. The decoded scanline allocation cap is **10,241,600 bytes**. Body readers allocate incrementally after authentication and account for buffer growth and exact-size copies; they do not preallocate the maximum or retain an unbounded chunk list. Route POST/PATCH bodies have a separate **256 KiB** cap to preserve full-precision 1000-point saves; the existing route JSON schema is unchanged. Invalid or oversized input fails before inference.

At each hop, large uploads have an absolute **15-second authentication-and-reception deadline**, **16 admitted requests**, and a shared **32 MiB retained raw-buffer budget** per process. Pending authentication uses a slot but no body buffer. Bytes remain charged while the handler consumes the upload. Growth and final-copy allocations are charged before allocation. Timeout returns `UPLOAD_TIMEOUT` (408); capacity exhaustion returns `UPLOAD_BUSY` (429). Failure, abort, timeout, and completion release capacity. These controls do not shorten the existing inference deadline or promise a limit on all native allocations.

The Web proxy first verifies the bearer token with bodyless `GET /auth/session` (204). Backend validates the session before accepting the large body and again through the existing route authentication after reception. No credentials or session data are returned by this probe. Authentication failure never forwards an assistant upload or calls a provider.

Capture wait is at most **5 seconds**; submission age is at most **120 seconds** (server permits at most 5 seconds of future clock skew). The UI releases the submitted review image **10 minutes after capture**. Camera, dimensions, style, or draft changes before submission require explicit recapture. Later camera-only changes cannot replace a submitted snapshot.

### Frozen conversion and provider boundary

Only flat zero-pitch Mercator is supported. `mapRect` excludes the 40-pixel attribution footer. Strict normalized positions `u,v` are inclusive 0…1, with output positions `x = left + u * width`, `y = top + v * height`. The frozen affine conversion is `origin + u*xAxis + v*yAxis`. Keep coordinate precision; do not simplify geometry.

Independent checks contain normalized positions and their Mercator `x,y`. Supply 4–32 checks covering all four quadrants. Inverse round-trip error must be at most **0.25 output pixels**. Visible marker positions must meet the same tolerance. Reject singular transforms, unsupported pitch/projection, out-of-range positions, and repeated-world ambiguity. Date-line wrapping resolves against the frozen view center, including non-repeated views wider than 180°. A visible leg spanning half a longitude world requires intermediate visible points; otherwise stored short-arc playback could leave the captured area. Conversion accuracy is not road accuracy; never convert against a later live camera.

Full snapshot coordinates, events, bindings, and conversion metadata stay inside the authenticated application. Provider input contains only the confirmed PNG, bounded request, output dimensions, map rectangle, visible marker references/labels/positions, and optional loop target. It excludes full draft coordinates, off-screen draft content, Places, devices, and previous images. The provider can still infer precise positions from the image. Image charges and provider retention are governed by the user's provider/account terms; transient local storage and `cacheRetention: none` do not guarantee upstream deletion or no training.

The model can call only `submit_path` or `ask_for_clarification`. A submitted path is strictly typed:

```typescript
type PathEntry =
  | { kind: 'retain'; draftId: string }
  | { kind: 'image'; u: number; v: number; draftId?: string };
type SubmitPath = { points: PathEntry[] };
type Clarify = { reason: 'unclear' | 'ambiguous' | 'offscreen' | 'unsupported' };
```

Arbitrary model latitude/longitude, endpoints, tool names, or extra fields are not permitted. Retain entries preserve exact captured coordinates, identity, and events, including unchanged off-screen points. An image entry with a `draftId` moves only a visible captured point and preserves its events. New points receive null speed/pause. Duplicate or unsafe references fail. A retained off-screen point must keep its original neighbors and boundary position; it cannot create an unseen connection. No external search, routing, geocoding, geographic-memory lookup, shell, filesystem, or arbitrary HTTP tools are exposed.

## NDJSON response

Each UTF-8 line is one complete JSON event. Transport chunks need not align with lines. Partial lines or partial proposals must never alter a draft. Require the matching binding, terminal `done`, and clean stream end before enabling Apply. The client caps the complete event stream at **512 KiB**.

```typescript
type Proposal = {
  binding: Binding;
  waypoints: Waypoint[];
  distanceMeters: number;
  removedEventIds: string[];
  loopTargetMeters: number | null;
  source: 'OpenStreetMap';
};
type Event = { binding: Binding } & (
  | { type: 'status'; status: 'working' | 'validating' }
  | { type: 'proposal'; proposal: Proposal }
  | { type: 'clarification'; reason: Clarify['reason'] }
  | { type: 'error'; code: string }
  | { type: 'done' }
);
```

The stream exposes safe status labels, a complete validated proposal or clarification, generic error codes, and completion. It never exposes raw provider responses, thinking, tool arguments, credentials, images, or logs. An error after stream start is an NDJSON event, not a new HTTP status.

These examples contain only non-sensitive placeholders; no image binary or base64 is included:

```http
POST /ai/route-assistant/runs
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{"request":"Trace the visible path between the marked points.","snapshot":"<Snapshot object from explicit capture; not a literal string>","loopTargetMeters":null}
```

The example body is schematic, not a valid submission. Replace the snapshot placeholder with the typed capture object. Example stream line (also schematic):

```json
{"binding":"<same complete Binding object>","type":"status","status":"working"}
```

## Budgets, failure, and cancellation

| Limit | Value |
| --- | --- |
| Run duration | 90 seconds |
| Model turns | 4 |
| Total output tokens | 16,384 |
| Tool calls | 8 |
| Candidate attempts | 3 |
| Final points | 2–1000 |
| Loop distance error | ±10% of target |
| Loop endpoint separation | At most 10 m |
| Starts per user | 4 per minute |
| Active runs per user | 1 |
| Active runs per Backend process | 4 |
| Recent run IDs per Backend process | 256, retained up to 10 minutes |

Concurrency, rate limits, and recent IDs are **single-Backend-process limits**, not distributed coordination. No automatic SDK retry (`maxRetries: 0`) or application replay occurs. Final-payload guards include legacy thinking-token expansion; Bedrock endpoint/retry/profile controls and explicit Vertex-key checks prevent ambient authentication. Distance is computed from the final stored direct segments, not a road service or model estimate. Invalid/excessive candidates fail instead of truncation or silent simplification.

Before streaming, errors return generic JSON `{ "code": "RA_INVALID_INPUT", "message": "RA_INVALID_INPUT" }`. Common codes include:

| Codes | Meaning |
| --- | --- |
| `RA_INVALID_INPUT`, `RA_INVALID_GENERATION` | Invalid schema, values, age, or generation |
| `RA_INVALID_PNG`, `RA_INVALID_IMAGE_SIZE`, `RA_INVALID_TRANSFORM`, `RA_INVALID_MARKER`, `RA_UNSUPPORTED_VIEW` | Invalid capture or conversion |
| `RA_OWNER_MISMATCH` | Authenticated owner/session mismatch (403) |
| `RA_ROUTE_NOT_FOUND`, `RA_RUN_NOT_FOUND` | No owned route or active owner/session run (404) |
| `RA_MODEL_REQUIRED`, `RA_CONNECTION_REQUIRED`, `RA_CONFIGURATION_CHANGED` | Saved AI selection/connection cannot serve the run (409) |
| `RA_DUPLICATE_RUN` | Recently used run ID (409) |
| `RA_BUSY` | Rate, concurrency, or recent-ID capacity reached (429) |
| `RA_INVALID_REFERENCE`, `RA_DUPLICATE_REFERENCE`, `RA_INVALID_PROPOSAL`, `RA_OFFSCREEN_CONTEXT` | Unsafe geometry, references, or unseen connections |
| `RA_LIMIT`, `RA_PROVIDER_FAILED`, `RA_TIMEOUT`, `RA_CANCELLED` | Budget, inference, timeout, or cancellation failure |

Safe `AI_*` settings/authentication codes can also occur. Authentication and body/proxy rejection can precede assistant error handling; do not assume every non-2xx response has this JSON shape. Never display raw upstream error text.

DELETE resolves the run under the authenticated **user and session**, not merely the supplied ID. Stop, request abort, and downstream stream cancellation request local cancellation and worker termination. Disconnect is not proof that provider processing stopped. There is no exactly-once billing, provider cancellation, or refund guarantee.

The client invalidates captures/results on manual edits, edit → Undo, route replacement/switch, discard, successful Save/baseline changes, settings/credential changes, logout, timeout, and cancellation. Ignore late events and require a new explicit capture/run; do not rebase automatically. Submit and Apply recheck saved AI settings with a bounded wait. An active OAuth refresh does not replace the credential generation or cancel a run; terminal failure, replacement, and disconnect still invalidate it. Apply is single-use, path-only, and disabled during Save or an active credential refresh. Assistant inputs do not participate in the manual Save form. Event-bearing waypoint removal requires confirmation. Existing manual Save remains the only route persistence action. Chat, images, and proposals are transient and do not resume after restart.

## Persistent attribution and licensing

OSM-derived capture is enabled only for `plain`, `dark`, and `terrain`; Esri satellite capture is disabled pending owner permission. See [official source evidence and obligations](route-assistant-source-terms.md). Keep `© OpenStreetMap contributors` and `https://www.openstreetmap.org/copyright` in the image and retain application-level route credit after Apply/Save and across base-style changes. Android already retains native OSM attribution.

Public/API route consumers must retain applicable OSM credit and ODbL obligations when displaying or redistributing derived data. The assistant does not grant a different source license. No image or provenance schema is added: route JSON, revision, Share, sync, and Android waypoint contracts stay unchanged. A future source needs its own permission and output-attribution review before capture is enabled.
