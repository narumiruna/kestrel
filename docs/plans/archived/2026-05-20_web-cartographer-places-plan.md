## Goal

Rebuild the Places dashboard into a cartographer workspace: full-viewport map canvas with a floating field notebook for the place list and an index card for the selected place. Success means Places keeps existing create/edit/delete/share behavior while presenting the map as the main canvas.

## Context

The current Places page is `web/app/dashboard/places/page.tsx` and uses `PlaceEditor`, `PlaceMapEditor`, `PlaceMapPreview`, and `DashboardShell`. The prompt references `web/src/...`; implementation should use the repo’s existing `web/app`, `web/components`, and `web/lib` paths unless a deliberate migration is planned.

## Non-Goals

- Do not rebuild Routes in this step.
- Do not change backend APIs, auth/session behavior, or place schema.
- Do not introduce keyed map-provider dependencies or map-provider environment variables.
- Do not remove existing save/delete/share functionality; restyle and relocate it only.

## Architecture

Add a `web/components/cartographer/` component group for stage-level UI, but keep data fetching and mutation ownership in `web/app/dashboard/places/page.tsx`. Map state should be lifted only as needed for marker selection, map panning, and custom zoom controls.

## Plan

- [x] Create `web/components/cartographer/Stage.tsx`, `EdgeTape.tsx`, `CornerMark.tsx`, `FieldNotebook.tsx`, `IndexCard.tsx`, `StatusStrip.tsx`, `ScaleBar.tsx`, and `ZoomStack.tsx` with typed props and no API calls; verify exports with `rg -n "export .*Stage|FieldNotebook|IndexCard|ZoomStack" web/components/cartographer`.
- [x] Refactor `web/app/dashboard/places/page.tsx` return JSX into `kestrel-stage` with full-viewport map plus floating panels while keeping existing `loadPlaces`, `savePlace`, `deletePlace`, and `createNewPlace` logic; verify with `git diff web/app/dashboard/places/page.tsx`.
- [x] Adapt `PlaceMapEditor` or create a cartographer map canvas component that accepts places, selected place id, marker click callbacks, and imperative zoom/pan hooks without breaking the current map editor behavior; verify marker click selects a place in browser smoke.
- [x] Implement `FieldNotebook` Places mode: rust spine, serif title, mono count, Places/Routes text nav, active row rust bar, `+ New entry`, and page counter; verify with browser screenshot of `/dashboard/places`.
- [x] Implement `IndexCard` for selected places with push-pin, stamp, title, latitude/longitude fields, tags, share section, and Save/Delete actions wired to existing handlers; verify create/edit/delete/share flows manually.
- [x] Add custom place markers as DOM elements with active/hover styling and no default popup chrome; verify with browser smoke that marker clicks select the place and map pan/zoom still work.
- [x] Add responsive guardrails for this first pass: desktop cartographer layout only, and preserve a usable fallback for narrower screens if not fully responsive yet; verify at 1280px and 780px with Chrome/CDP screenshots or notes.
- [x] Run web quality gates; verify with `cd web && npm exec -- biome ci .`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.

## Risks

- Replacing the page shell can accidentally bypass `DashboardShell` auth/logout/theme affordances; ensure account controls still exist or are intentionally moved in a later plan.
- Full-viewport absolute layout can trap content or create inaccessible panels if overflow is not planned.
- Custom markers can drift from data state if MapLibre marker cleanup is incomplete.

## Rollback / Recovery

- Keep the old Places page diff isolated in one commit so it can be reverted without affecting map-style or token foundations.
- If the cartographer map component destabilizes editing, temporarily keep `PlaceEditor` embedded inside `IndexCard` until smaller components are extracted.

## Completion Checklist

- [x] `/dashboard/places` uses a full-viewport map stage with floating notebook and selected-place index card, verified by browser screenshot.
- [x] Existing place workflows are intact, verified by manual create, edit, delete confirmation, and share-link smoke tests.
- [x] Marker selection works both from notebook rows and map markers, verified by manual click tests.
- [x] No keyed map-provider dependency is introduced, verified by `rg -n "NEXT_PUBLIC_.*MAP|api_key=" web`.
- [x] Web checks pass, verified by `cd web && npm exec -- biome ci .`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.
