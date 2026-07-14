## Goal

Split the Web UI into clearer top-level work modes: `Map` for spatial preview/control and `Library` for managing Places and Routes. Success means users can understand where to browse/edit saved items versus where to inspect them on the map, while existing `/dashboard/places` and `/dashboard/routes` links keep working.

## Context

The current dashboard has top tabs for Places and Routes, and each page combines map, notebook, editor, sharing, and remote-control actions. The next IA should avoid adding many speculative tabs; start with the smallest useful split: `Map` and `Library`.

## Architecture

- Add top-level routes under the existing authenticated dashboard shell, likely:
  - `/dashboard/map`
  - `/dashboard/library`
- Keep redirects or compatibility routes from existing `/dashboard/places` and `/dashboard/routes` until bookmarks and docs are updated.
- Prefer extracting shared library data loading/hooks instead of duplicating Places/Routes fetch logic across Map and Library pages.

## Non-Goals

- Do not add Devices, Shares, Activity, or Settings top-level tabs in this phase.
- Do not redesign backend APIs.
- Do not remove existing Places/Routes functionality until replacement flows are verified.

## Plan

- [x] Define the `Map` and `Library` information architecture in a short design note inside this plan or the implementation PR: what each tab owns, what stays shared, and which old URLs redirect; verify with explicit user acceptance before large code movement.
- [x] Extract shared dashboard data loading for places/routes into a small hook or helper that returns items, selected IDs, loading/error state, and refresh; verify with `cd web && npm run typecheck` and unchanged API calls in browser network logs.
- [x] Add a `Map` tab that focuses on the map, selected item preview, and quick actions like send-to-device/share/open-in-library; verify by selecting an existing place and route and seeing the map frame the item.
- [x] Add a `Library` tab with internal Places/Routes switching, search, create/edit/delete, and existing editor flows; verify all current Place and Route CRUD actions still work in `just webtest-up`.
- [x] Update dashboard navigation copy/icons so top-level tabs are `Map` and `Library`, not separate Places and Routes; verify `just --list` is unaffected and Chrome screenshots show the new navigation.
- [x] Preserve or redirect `/dashboard`, `/dashboard/places`, and `/dashboard/routes` to the new IA; verify with direct URL navigation in Chrome and expected final paths.
- [x] Update keyboard shortcuts so existing Places/Routes shortcuts still work inside Library, and add a shortcut for Map if useful; verify with manual keyboard smoke and the cheatsheet copy.
- [x] Run Web quality gates and visual smoke; verify with `just web-check`, `cd web && npm run typecheck`, and Chrome screenshots for Map and Library at desktop and phone widths.

## Design Note

- `Map` owns spatial preview: browse saved Places/Routes, frame them on MapLibre, and jump to Library for editing.
- `Library` owns management: Places/Routes search, create, edit, delete, share, and remote-control actions.
- Shared loading for the Map view lives in `useDashboardLibraryData`; existing Library CRUD pages keep their current focused loaders.
- `/dashboard` redirects to `/dashboard/map`; `/dashboard/library` redirects to `/dashboard/library/routes`; old `/dashboard/places` and `/dashboard/routes` remain compatibility routes that render the Library experience.

## Risks

- Moving too much UI at once can create regressions in CRUD and route editing; keep old pages or redirects until Map and Library smoke tests pass.
- A Map tab without enough actions can feel like a read-only duplicate; include only quick actions that reuse existing components.

## Completion Checklist

- [x] The top-level dashboard navigation shows `Map` and `Library`, verified by Chrome screenshot and route paths.
- [x] Existing `/dashboard/places` and `/dashboard/routes` URLs do not 404 and land on the intended new experience, verified by direct URL navigation.
- [x] Library supports existing Place and Route CRUD flows, verified by manual browser smoke against the dev seed account.
- [x] Map can display and frame selected Places and Routes and expose at least one useful quick action, verified by manual browser smoke.
- [x] Keyboard shortcuts and cheatsheet copy match the new IA, verified by keyboard smoke.
- [x] Web checks pass, verified by `just web-check` and `cd web && npm run typecheck`.

## Completion Evidence

- `just web-check` passed.
- `cd web && npm run typecheck` passed.
- `just --list` completed; recipe list remains available.
- Chrome DevTools smoke verified `/dashboard/map`, `/dashboard/library/routes`, `/dashboard/places`, and `/dashboard/routes`; screenshots saved to `/tmp/kestrel-map-library-map-desktop.png`, `/tmp/kestrel-map-library-library-desktop.png`, `/tmp/kestrel-map-library-map-phone.png`, and `/tmp/kestrel-map-library-library-phone.png`.
- Chrome DevTools keyboard smoke verified `g l` navigates Map → Library and `g m` navigates Library → Map.
- Chrome DevTools Map smoke verified selected route and selected place previews render with map markers.
- Chrome DevTools Library CRUD smoke created and deleted one Place and one Route through the UI against the dev seed account.

## 2026-07-14 Implementation Audit

- Restored the top-level `Map` / `Library` tabs above the full-width status strip after a later CSS pass had covered them; browser measurements show both tabs visible with the correct `aria-current` state at `1200×792` and `390×844`.
- Removed the redundant Map notebook `Open Library` card. A later direct-editing follow-up also removed the intermediate `Edit route` action so selected routes can be changed in place.
- Reverified `/dashboard` → `/dashboard/map`, `/dashboard/library` → `/dashboard/library/routes`, and the compatibility `/dashboard/places` and `/dashboard/routes` experiences in Chrome.
- Reverified Place and Route create, update, and delete flows against the seeded Web test stack; temporary smoke records were deleted afterward.
- Reverified `g m`, `g l`, `g p`, and `g r`, including that shortcuts do not navigate while a search input is focused.
- Reverified responsive UI in Chrome at `1200×792` and headless Chrome at `390×844`; mobile `Map` / `Library` navigation does not overlap the account control. Screenshots: `/tmp/kestrel-map-library-map-desktop.png`, `/tmp/kestrel-map-library-library-desktop.png`, `/tmp/kestrel-map-library-map-mobile.png`, and `/tmp/kestrel-map-library-library-mobile.png`.
- Current quality gates pass: `just web-check`, `just web-lint`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.
