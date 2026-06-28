## Goal

Make route waypoint editing easier by linking map markers and waypoint rows. Success means selecting or hovering a marker highlights the matching row, and focusing a row highlights and frames the matching marker.

## Context

`RouteMapEditor` already accepts `selectedWaypointIndex` and `onSelectWaypoint`, and `RouteEditor` renders waypoint rows with actions. Selection exists, but row/marker hover and scroll/focus synchronization are limited.

## Non-Goals

- Do not add multi-select or batch waypoint editing.
- Do not change route storage or waypoint payload schema.
- Do not add a drag-and-drop library.

## Plan

- [x] Trace current marker selection and waypoint row rendering in `RouteMapEditor` and `RouteEditor`; verify expected event flow in PR notes with file/function references.
- [x] Add shared `hoveredWaypointIndex` state between `RoutesDashboardPage`, `RouteMapEditor`, and `RouteEditor`; verify TypeScript compile with `cd web && npm run typecheck`.
- [x] Update markers to apply hover and selected classes separately, keeping selected styling dominant; verify with Chrome DevTools screenshots of default, hovered, selected, and hovered-selected markers.
- [x] Update waypoint rows to highlight on marker hover/click and set map marker hover on row hover/focus; verify manually with pointer and keyboard in the dev stack.
- [x] Scroll the waypoint list to the selected row when a marker is clicked only when the row is outside the visible list; verify by clicking markers in a route with enough waypoints to scroll.
- [x] Add `aria-current` or equivalent state on the selected waypoint row and clear labels for marker buttons; verify by DOM inspection.
- [x] Run Web quality gates; verify with `just web-check` and `cd web && npm run typecheck`.

## Risks

- Too many hover effects can create visual noise on dense routes; keep hover styling lighter than selected styling.
- Automatic scroll can feel jumpy; only scroll when the row is not already visible.

## Completion Checklist

- [x] Marker hover highlights the matching waypoint row, verified by manual Chrome smoke on `/dashboard/routes`.
- [x] Waypoint row hover/focus highlights the matching map marker, verified by pointer and keyboard smoke.
- [x] Marker click selects and scrolls to the matching row only when needed, verified on a route with scrollable waypoint rows.
- [x] Selected marker and selected row remain visually distinct from hover-only state, verified by Chrome DevTools screenshots.
- [x] Web checks pass, verified by `just web-check` and `cd web && npm run typecheck`.

## Completion Evidence

- `just web-check` passed.
- `cd web && npm run typecheck` passed.
- Chrome DevTools smoke on `/dashboard/routes` verified marker hover highlights the matching row, waypoint focus highlights the matching marker, and marker click selects the matching row.
