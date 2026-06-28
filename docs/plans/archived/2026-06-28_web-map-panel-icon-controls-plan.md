## Goal

Replace the bulky route map panel toolbar with panel-edge mini controls that are compact, legible, and discoverable. Success means expanded Library/Editor panels have small `−` collapse controls attached to their panel chrome, collapsed panels restore through edge tabs labeled `L` / `E`, Focus map uses a standalone `F` map control, and all controls show their meaning on hover/focus without covering the route status pill.

## Context

The current `map-panel-controls` group avoids overlap but still reads as a heavy floating toolbar. The better UI should make panel controls feel physically attached to the panels, while keeping map focus as a separate map-level action.

## Non-Goals

- Do not change route editing behavior, waypoint state, saving, or MapLibre route interactions.
- Do not add a tooltip dependency; use existing CSS plus `aria-label`/`data-label`/`title` as needed.
- Do not redesign mobile navigation beyond keeping controls usable and non-overlapping.

## Plan

- [x] Update `web/components/cartographer/Stage.tsx` to split controls by role: Library collapse/restore, Editor collapse/restore, and Focus map; verified by DOM inspection that buttons have stable classes, `aria-label`, `title`, and correct `aria-expanded` on Library/Editor.
- [x] Define explicit control behavior in `Stage`: expanded Library shows a `−` button that only collapses Library; collapsed Library shows an `L` edge tab that only restores Library; expanded Editor shows `−`; collapsed Editor shows `E`; `F` collapses both panels and, when both are collapsed, restores both; verified by browser clicks in Chrome.
- [x] Replace the bulky toolbar CSS in `web/app/globals.css` with panel-edge positioning: Library `−` attaches to the left panel top-right, Editor `−` attaches to the right panel top-right, `L` sits on the left hidden-panel edge, `E` sits on the right hidden-panel edge, and `F` stays as a small map-level button near the top overlay area; verified with Chrome screenshots at `1024x900`, `1265x900`, `1440x900`, and `1600x900`.
- [x] Style controls with a small visual footprint but a usable hit target (`36–40px` minimum): circular or pill buttons, visible focus ring, no text overflow, and no overlap with route status; verified with DOM bounding boxes and browser screenshots.
- [x] Add lightweight CSS tooltips for `L`, `E`, and `F` (and optionally the `−` controls) on hover and keyboard focus; verified hover/focus reveals `Library`, `Editor`, and `Focus map` text without relying only on native `title`.
- [x] Smoke-test interactions in the browser on `http://localhost:3401/dashboard/library/routes`: collapse/restore Library, collapse/restore Editor, focus/restore map, then edit/select a waypoint to confirm route state remains intact.
- [x] Run web checks; verified with `just web-check` and `cd web && npm run typecheck`.

## Risks

- Absolute/fixed positioning can drift from panel corners if desktop panel dimensions change; mitigated with scoped selectors and browser verification at multiple widths.
- Icon-only controls can be unclear; mitigated with visible single-letter tabs, hover/focus tooltips, `title`, and `aria-label`.
- Tiny visual buttons can be hard to click; mitigated by keeping the hit target at `38px`.

## Completion Checklist

- [x] Route status and panel controls do not overlap, verified in Chrome at `1024x900`, `1265x900`, `1440x900`, and `1600x900` with DOM bounding boxes and screenshots.
- [x] Library `−` / `L` controls collapse and restore only Library while preserving route draft state, verified by browser clicks on `/dashboard/library/routes`.
- [x] Editor `−` / `E` controls collapse and restore only Editor while preserving route draft state, verified by browser clicks on `/dashboard/library/routes`.
- [x] Focus `F` collapses both panels and restores both when already focused, verified by browser clicks on `/dashboard/library/routes`.
- [x] Hover and keyboard focus reveal meanings for `Library`, `Editor`, and `Focus map`, verified by browser inspection.
- [x] Accessibility labels exist for Library, Editor, and Focus map controls, verified by DOM inspection.
- [x] Web quality gates pass, verified by `just web-check` and `cd web && npm run typecheck`.

## Completion Evidence

- Chrome URL: `http://localhost:3401/dashboard/library/routes`.
- Chrome screenshots: `/tmp/kestrel-panel-icon-controls-1024.png`, `/tmp/kestrel-panel-icon-controls-1265.png`, `/tmp/kestrel-panel-icon-controls-1440.png`, `/tmp/kestrel-panel-icon-controls-1600.png`, `/tmp/kestrel-panel-icon-controls-tooltip.png`.
- DOM interaction smoke verified initial, Library collapse/restore, Editor collapse/restore, Focus map collapse/restore, labels, tooltip content, waypoint selection, and panel visibility.
- `just web-check` passed.
- `cd web && npm run typecheck` passed.
