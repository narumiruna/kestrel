## Goal

Redesign Kestrel Cloud’s canonical route editor around the route-building workflow: understand the current path, change it spatially or precisely, choose playback behavior, preview consequential actions, and save without losing data. Success means the editor is less cluttered while preserving route CRUD, exact waypoint management, sharing, Android remote control, responsive behavior, accessibility, compatibility URLs, and existing stored route data. The approved scope includes exact-coordinate insertion, Undo/Redo, Reverse route, Close loop, partial-load recovery, Share/Device draft clarity, and waypoint metadata preservation.

## Context

- The user approved the complete proposal on 2026-08-10 after reviewing the meanings of Reverse route and Close loop.
- `/dashboard/map?kind=routes` is the canonical editor. `/dashboard/library` owns browsing and lifecycle management; compatibility route URLs redirect into this structure.
- The current desktop Map workspace already has an item picker, MapLibre canvas, and right inspector, but the inspector distributes route identity, path, playback, sharing, device control, and persistence across several disclosures and nested surfaces.
- Existing routes hide speed and playback mode in Route settings while showing only waypoint count and distance. New routes can quickly have Route settings, Saved places, and Waypoints open together.
- Map clicks can add waypoints, but there is no exact-coordinate path for adding the first custom waypoint and no Undo/Redo for path mutations.
- Device playback uses the current draft while Share publishes the latest saved revision; the current UI does not make that distinction sufficiently explicit.
- `useDashboardLibraryData` loads Places and Routes with `Promise.all`, so one failed resource prevents useful first-load partial content.
- Route responses include optional waypoint `speedKmh` and `pauseSeconds`, but the Web draft and save input currently project waypoints to coordinates only. Editing a route can therefore discard known metadata.
- Web presentation uses Radix Themes/Colors/primitives and MapLibre. Browser validation must use Chrome DevTools, not Playwright, and screenshots must remain outside the repository.

## Architecture

- Keep Map and Library responsibilities and all compatibility redirects unchanged; do not add a wizard, edit mode, or second route editor.
- Introduce one testable route-draft controller/reducer for editable route fields, stable client-only waypoint identity, baseline comparison, validation, bounded path Undo/Redo, and draft transforms. Client-only IDs must never be serialized.
- Keep `DashboardMapPage` as the owner of selected cloud records and the active route draft. Make `RouteEditor` render the draft and dispatch explicit actions rather than independently owning overlapping route state.
- Preserve waypoint objects through add, drag, reorder, reverse, close-loop, and exact-coordinate edits. Save known optional metadata through the backend JSON revision payload; new waypoints use null metadata.
- Keep one MapLibre waypoint projection as the source for line, markers, selected waypoint, summary, and save payload.
- Restructure the route inspector into identity/status, Path, Playback, More details, and a persistent save/recovery footer. Show one contextual selected-waypoint editor by default and mount the complete waypoint manager only through a labeled disclosure.
- Treat the map as the live draft preview. Show a concise change summary before Save instead of interrupting every save with confirmation.
- Share always describes the saved revision it exposes. Device control builds an explicit command preview from the current draft or saved snapshot and describes replacement of a non-idle device before command submission.
- Load Places and Routes independently so route editing can continue when Saved places are unavailable. A map style failure must not disable exact waypoint editing.

## Non-Goals

- Do not change the Map/Library information architecture, add duplicate editor URLs, or move full route editing into Library.
- Do not add GPX/KML import/export, route recording, analytics, autosaved browser drafts, or revision-restore UI.
- Do not change Android movement semantics, remote-command queue/ACK behavior, share-link authorization, or the meaning of Once/Loop/Ping-pong.
- Do not introduce a second UI, icon, color, or map library.
- Do not perform a general rewrite of the 6,899-line legacy global stylesheet; remove or replace only route/workspace rules whose ownership is proven by the redesign.
- Do not perform production deployment, production database operations, push, merge, release, or device-state changes as part of this plan.

## Assumptions

- `1440×900` light-mode desktop is the primary presentation target; current responsive capability at `1024×768`, `390×844`, 320px width, 200% text, dark mode, pointer, touch, keyboard, and assistive technology must remain usable.
- Backend RouteRevision payload JSON can preserve optional waypoint metadata without a Prisma migration.
- Reverse route reverses waypoint order and associated metadata. Close loop appends a copy of the first waypoint only when the last waypoint is not already at the same coordinates; the appended waypoint is a new draft waypoint with copied known metadata.
- Undo/Redo applies to draft path mutations and is reset after successful save, discard, route selection change, or creation of a different draft. It is not persisted across reloads.
- The existing `isPublic` field and share-link lifecycle remain separate. UI copy must explain that marking a route public does not create a public link.

## Resolved Unknowns

- Optional per-waypoint speed and pause have no playback-editing contract in the current Web or Android UI. Android stores and syncs nullable doubles, while backend stored-payload parsing accepts nullable finite numbers. This redesign will preserve existing finite/null values without exposing metadata controls; submitted non-null metadata must be finite, `speedKmh` must be greater than zero, and `pauseSeconds` must be non-negative.
- MapLibre emits the same broad error event for recoverable tile failures and style failures. The bounded fatal state is therefore a style-ready timeout before the first `load`/`style.load`; individual tile errors remain non-disruptive. Retry remounts the map, while exact waypoint editing remains available.

## Plan

- [x] Capture an implementation baseline for existing/new routes and resolve the two Unknowns by inspecting Android playback models, backend payload mapping, and MapLibre events; accepted rules are recorded above, and Chrome DevTools on the isolated `just webtest-up` stack measured `1440×900`, no document overflow, a 320px picker, and a 440px inspector. Baseline evidence is `/tmp/kestrel-route-cdp-output/baseline-route-1440.{png,json}`.
- [x] Add a Node 22 built-in Web test command and failing tests for the route-draft controller covering stable draft IDs, validation, dirty summaries, add/drag/remove/reorder, Undo/Redo, Reverse, Close loop, endpoint equality, metadata association, and reset boundaries; verify the red tests with `cd web && npm test` before production implementation and avoid adding a browser-test framework.
- [x] Add failing backend tests for route create/update payloads that preserve optional waypoint `speedKmh`/`pauseSeconds`, reject values outside the discovered contract, and continue accepting existing coordinate-only clients; verify the red state with focused Jest commands under `backend/`.
- [x] Extend backend route validation, service payload construction, API models, and Web types to preserve known waypoint metadata without a Prisma migration; verify with the focused backend tests, existing library model/service tests, and a route save/reload assertion that metadata survives coordinate edits and reorder.
- [x] Implement the route-draft controller and make `DashboardMapPage` the single draft owner for route fields, path history, validation, selected waypoint, baseline, and save/discard transitions; verify with `cd web && npm test`, TypeScript, and code inspection showing that `RouteEditor` no longer owns a conflicting editable baseline.
- [x] Update `RouteMapEditor` and waypoint actions to preserve stable draft identity and metadata while keeping markers, route line, selection, hover, focus, and saved sequence synchronized; verify with unit tests plus Chrome interactions for add, marker drag, exact edit, reorder, Reverse, Close loop, repeated Undo/Redo, and route save/reload.
- [x] Rebuild the Route inspector hierarchy as identity/status → Path → Playback → More details → save/recovery footer, with one contextual selected-waypoint editor and a labeled `Manage all n waypoints` disclosure; verify DOM/focus order, a single inspector scroll owner, visible speed/mode, and screenshots for existing, new, empty, and 50-waypoint routes.
- [x] Add flat Path controls for Saved place, exact-coordinate insertion, Undo, and Redo; keep full-list drag and menu alternatives for Move up/down, Insert after, Edit coordinates, and Remove; verify that a keyboard-only user can create a valid route from zero waypoints, reorder it, correct it, and save it without a map gesture.
- [x] Add Reverse route and contextual Close loop actions as immediate draft transforms with map preview and Undo recovery; verify that Reverse changes direction without detaching metadata, Close loop adds exactly one return segment when needed, repeated Close loop is idempotent, Ping-pong does not present an irrelevant Close loop recommendation, and neither action writes before Save.
- [x] Replace the footer with one primary `Save route` action, local validation reasons, concrete dirty-change summary, Discard recovery, and a saved status that remains until the next edit; move Delete to a labeled object-level More menu and retain explicit confirmation/focus return, verified through save success/error, discard cancel/confirm, navigation guard, browser-exit guard, and delete-cancel Chrome smokes.
- [x] Clarify Share and Device consequences: Share identifies the saved revision and excludes dirty changes until saved; Device previews route source, waypoint count, distance, speed, mode, target device, readiness, and active-playback replacement before sending; verify Close/Escape has no mutation, focus returns to the trigger, unavailable reasons remain actionable, and command payload/status behavior is unchanged.
- [x] Change dashboard resource loading to represent Places and Routes independently and add bounded map loading/fatal recovery while keeping exact editing available; verify initial loading, empty library, Routes-only success, Places-only failure with Retry, stale-data refresh failure, map-unavailable fallback, successful retry, and no disruptive alert for ordinary tile errors.
- [x] Apply scoped responsive and visual styles using the established Radix palette, sans-serif hierarchy, restrained boundaries, and a functional Start→End route rail; replace duplicated custom icons with available Radix Icons and verify no second UI/icon package, no MapLibre marker-position override, and no unrelated global cascade changes.
- [x] Complete responsive and accessibility verification at `1440×900`, `1024×768`, `390×844`, 320px width, and 200% text, plus a bounded dark-mode check; verify no document horizontal overflow, no clipped identity/status/Save action, one contextual panel at narrow widths, 44px common touch targets, visible focus, logical keyboard order, screen-reader labels/status, non-color state cues, reduced motion, and usable 50/1000-waypoint behavior through Chrome DevTools and DOM measurements.
- [x] Update `web/README.md` and add or update the user-facing Cloud route-editing documentation to explain path entry methods, draft versus saved state, Undo/Redo, Reverse, Close loop, playback modes, Share/Device snapshot semantics, errors, cancellation, keyboard alternatives, and data limits; verify links and terminology against the implemented UI.
- [x] Run affected quality gates: `just web-check`, `just web-lint`, `cd web && npm test`, `cd web && npm run typecheck`, `cd web && npm run build`, and the full Backend lint/test/e2e/typecheck/build sequence; restore generated `web/tsconfig.tsbuildinfo` if changed unintentionally and verify with `git diff --check`.
- [ ] Audit the final implementation against every acceptance item in this plan, inspect the complete diff for unrelated changes and image binaries, record Chrome screenshot paths outside the repository and any genuinely unverified external/device path, then request final user acceptance before marking the plan complete.

## Risks

- Waypoints do not have persisted stable IDs. Client-only identity must follow the waypoint through reorder and metadata edits but be stripped before API submission.
- Existing or future waypoint metadata could be silently lost if any mapper projects to coordinates only. Tests must cover response → draft → transform → request → revision → response.
- A 1000-waypoint route can create expensive DOM and assistive-technology output. Default contextual editing and lazy mounting of the full manager must not make the last row unreachable when deliberately opened.
- Splitting current `RouteEditor` state ownership can create transient resets after save/refresh or route selection. Reducer reset boundaries and response-lost/save-error tests must prove preservation.
- Device commands are consequential and may already be executing once delivered. The UI must describe replacement and ACK/expiry boundaries without claiming remote undo.
- Share links expose saved revisions while Device may use a draft. Copy and tests must keep those sources distinct.
- Legacy CSS source order can create marker or sticky-footer regressions. Use scoped selectors and inspect computed styles rather than adding broad button/position rules.
- Partial loading can accidentally clear stale usable data. Keep each resource’s previous valid state until its own successful replacement.

## Rollback / Recovery

- No Prisma migration or production data rewrite is planned. The metadata change is an additive JSON/API compatibility change and coordinate-only clients remain valid.
- All path transforms remain draft-only until Save; Discard restores the last server baseline and a failed Save preserves the draft and history.
- If metadata passthrough causes compatibility failures, disable the new optional request fields while retaining the route-editor hierarchy and coordinate-only behavior; do not rewrite existing revisions.
- Browser fixtures and screenshots use the isolated local Web test stack and OS temporary storage. Do not deploy or use production accounts/devices during verification.

## Completion Checklist

- [x] The canonical Route editor presents route identity, path, visible playback behavior, details, dirty summary, and one primary Save action in the approved hierarchy, verified by DOM order and Chrome screenshots for new/existing routes.
- [x] Map click, marker drag, Saved place, and exact-coordinate insertion all update one synchronized draft, verified by unit tests and save/reload Chrome smoke.
- [x] Undo/Redo, Reverse route, and Close loop are draft-only, metadata-safe, previewed on the map, and recoverable, verified by automated transform tests and browser interactions.
- [x] Known waypoint `speedKmh`/`pauseSeconds` survive edit, reorder, reverse, close-loop handling, save, and reload without a Prisma migration, verified by Backend/Web tests and API round-trip evidence.
- [x] Share clearly uses the latest saved revision and Device clearly previews the command snapshot/replacement consequence, verified by dialog copy, payload inspection, cancel/no-side-effect behavior, and focus return.
- [x] Loading, empty, partial, success, error, disabled, cancellation, destructive confirmation, and recovery states retain previous valid data and provide actionable next steps, verified by unit tests and Chrome failure fixtures.
- [x] Pointer, touch, keyboard, screen-reader, reduced-motion, and non-map exact-edit paths remain available with visible focus and non-color cues, verified by keyboard-only Chrome smoke and DOM/accessibility inspection.
- [x] `1440×900`, `1024×768`, `390×844`, 320px width, 200% text, dark mode, long labels, and 50/1000-waypoint cases have no clipped primary action or document horizontal overflow, verified by Chrome measurements and screenshots stored outside the repository.
- [x] Existing Route IDs, Library ownership, compatibility redirects, share links, `isPublic`, Android sync, MapLibre ownership, and coordinate-only API clients remain compatible, verified by static inspection, Backend tests, Web typecheck/build, and route save/reload smoke.
- [x] User-facing Cloud route documentation matches implemented labels, limits, draft/saved semantics, and recovery behavior, verified by documentation review against the final UI.
- [x] All required Web and Backend quality gates pass and the final diff contains no unrelated changes or image binaries, verified by recorded command output, `git diff --check`, `git status --short`, and final diff inspection.
- [ ] Final user acceptance is requested through the pull request with the implemented Route workflow and external screenshot evidence.
