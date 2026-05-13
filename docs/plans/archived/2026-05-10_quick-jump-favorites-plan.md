# Quick jump and favorites plan

## Goal

Document the completed Go to/Favorites UX work and keep remaining improvements bounded: manual drag reorder, verification, and optional detail/apply screen polish.

## Context

The original phase added coordinate paste parsing, Google Maps URL parsing, Go to bottom sheet, Favorites tabs, sorting, apply-now, rename/edit/delete, and last-used tracking. Since the later Room migration, these flows use `LibraryRepository` rather than DataStore favorites.

## Non-Goals

- Do not add address/name geocoding in this plan.
- Do not resolve `goo.gl` or other short URLs.
- Do not add full waypoint editing here; route editor work belongs to the web/editor roadmap.

## Plan

- [x] Add coordinate parser for comma-separated, whitespace-separated, and Google Maps URL coordinate formats with range validation tests.
- [x] Add Go to sheet with coordinate field, Points/Routes tabs, shared sort mode, and apply behavior.
- [x] Stop active route/single mock before applying a new point or route from Go to/Favorites.
- [x] Add Favorites tabs, sort menu, overflow actions, rename, edit coordinates, edit route speed/mode, delete, and Apply.
- [x] Update `lastUsedAt` when applying from Go to, Favorites, or startup favorite.
- [x] Persist manual ordering using Move up / Move down controls.
- [x] Accept Move up / Move down as the long-term manual ordering UX for this slice and keep drag-and-drop out of scope; row actions already support stable `libraryItemId` reordering without adding Compose gesture complexity.
- [x] Record current command validation for this cleanup pass with `just check` and `just lint`; a fresh real-device Go to/Favorites smoke is moved to `2026-05-10_engineering-backlog-plan.md` because no Android device is attached in this docs-closing pass.
- [x] Mark `Favorite detail + Apply now` not applicable for this slice because row-level Apply already covers the primary action without introducing another detail screen.

## Risks

- True drag-and-drop in Compose can add gesture complexity and conflict with scrollable lists; Move up / Move down may be the lower-risk permanent UX.
- Manual verification depends on mock-location app settings and cannot be fully replaced by unit tests.

## Validation

- 2026-05-13 command validation in repo workspace:
  - `just check` ✅
  - `just lint` ✅
  - `just devices` showed no attached Android device, so a fresh real-device Go to/Favorites smoke was not rerun during this docs-closing pass.
- Follow-up moved out of this baseline plan:
  - `2026-05-10_engineering-backlog-plan.md` now tracks rerunning a fresh real-device Go to/Favorites apply smoke after the next substantial map/favorites refactor.

## Completion Checklist

- [x] Coordinate paste and Google Maps URL jump are covered by parser tests.
- [x] Go to applies points/routes and closes the sheet without auto-playing routes.
- [x] Applying during active mock stops the previous mock before replacing state.
- [x] Favorites actions work with stable library item ids.
- [x] Recent sorting reflects `lastUsedAt` updates.
- [x] Drag reorder is explicitly marked not applicable because Move up / Move down is accepted for this slice.
- [x] Latest `just check` and `just lint` results are recorded after Java/Gradle environment is available.
