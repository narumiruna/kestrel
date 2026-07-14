## Goal

Make the selected route immediately editable from the Map workspace, without an `Edit route` mode-switch button. Success means route fields and waypoints can be changed and saved in place while Map / Library remain clear top-level workspaces.

## Context

The restored Map / Library navigation exposed a redundant `Edit route` action in the Map selection card. Requiring that action adds a mode transition before the primary route task. The existing `RouteEditor` and `RouteMapEditor` already provide direct editing and should be reused rather than duplicated.

## Non-Goals

- Do not redesign direct Place editing in this change.
- Do not remove Library CRUD or compatibility routes.
- Do not add a second map implementation or backend API.

## Plan

- [x] Replace the Map route preview with the existing controlled `RouteMapEditor`, preserving selected, hovered, focus, fit, and draft waypoint state; verified map-click changed the draft from 7 to 8 waypoints and Refresh restored 7 in Chrome.
- [x] Render the existing `RouteEditor` directly in the Map route card and save changes through the current route API followed by shared-data refresh; verified temporary route-name and waypoint edits persisted after refresh and were restored afterward without an intermediate Edit button.
- [x] Guard route selection and browser exit when the Map route draft is dirty; verified selecting another route displayed the discard prompt and kept the current draft when rejected.
- [x] Remove the redundant Map route action and selected-item query plumbing, while keeping Places preview-only and top-level Map / Library navigation visible; verified at `1200×792` and `390×844`.
- [x] Run Web and repository quality gates; verified with `just check`, `just lint`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.

## Risks

- Reusing the full route editor can make the Map card dense; keep existing settings and waypoint sections collapsible and avoid adding another action layer.
- Controlled draft state can become stale when selection changes; reset it from the selected route and protect unsaved changes before switching.

## Completion Checklist

- [x] A selected route is immediately editable in Map with no `Edit route` button, verified at `http://localhost:3401/dashboard/map` in Chrome.
- [x] Route settings and waypoint changes work in place; temporary name and eighth-waypoint edits persisted after save/refresh and were restored against the Web test stack.
- [x] Unsaved route changes are not silently discarded when selecting another route, verified by rejecting the discard prompt in Chrome.
- [x] Places preview, Library navigation, and route selection remain usable, verified by switching Places/Routes and Map/Library in Chrome.
- [x] Desktop and mobile Map layouts are visually reviewed at `1200×792` and `390×844`; evidence is `/tmp/kestrel-map-direct-route-desktop.png` and `/tmp/kestrel-map-library-map-mobile.png`.
- [x] Required quality gates pass with no generated cache files left in the diff, verified by command output and `git status --short`.
