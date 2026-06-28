## Goal

Give users more usable map space without losing editor context. Success means the left notebook and right editor can be collapsed or temporarily minimized, and route editing has an obvious focus-map mode for map-heavy work.

## Context

The current Web UI uses the cartographer `Stage` with a large background map, left `FieldNotebook`, right `IndexCard`, and floating controls. This works on desktop but can feel crowded when editing routes or reviewing dense marker areas.

## Non-Goals

- Do not replace the cartographer visual system.
- Do not introduce a new map provider.
- Do not change mobile navigation into a full redesign in this phase.

## Plan

- [x] Audit `Stage`, `FieldNotebook`, `IndexCard`, and route/place page CSS to identify the smallest state needed for left/right panel collapse; verify with notes in the implementation PR description and screenshots of current desktop/mobile layouts.
- [x] Add local UI state for `leftPanelCollapsed` and `rightPanelCollapsed` in Places and Routes pages, preserving route/place selection and draft state; verify by collapsing/expanding panels without losing selected item or draft values.
- [x] Add accessible collapse buttons with clear labels and keyboard focus states for both side panels; verify with DOM inspection for `aria-expanded`/labels and keyboard tab smoke in Chrome.
- [x] Add a route-specific `Focus map` action that collapses both panels and keeps waypoint editing/marker dragging active; verify by editing a route, entering focus mode, dragging a marker, and saving.
- [x] Add responsive CSS so collapsed panels do not leave dead gutters at `1440x900`, `1024x768`, and `390x844`; verify with Chrome DevTools screenshots at those viewport sizes.
- [x] Not applicable: panel mode persistence was left out to avoid sticky hidden panels during editing; the controls are session-local, and `localStorage` persistence can be added later if users expect the state after reload.
- [x] Run Web quality gates; verify with `just web-check` and `cd web && npm run typecheck`.

## Risks

- Panel collapse can hide required save/delete controls; keep a visible restore/edit affordance while panels are collapsed.
- Focus-map mode can make unsaved changes easier to miss; ship after or together with the unsaved-changes plan if possible.

## Completion Checklist

- [x] Left and right panels can be collapsed and restored without losing selection or draft state, verified by manual Chrome smoke on Places and Routes.
- [x] Route focus-map mode leaves marker add/drag/select behavior working, verified by editing and saving a route in `just webtest-up`.
- [x] Desktop, tablet, and phone-sized layouts have no dead gutters or unreachable controls, verified by Chrome DevTools screenshots at `1440x900`, `1024x768`, and `390x844`.
- [x] Collapse controls are keyboard reachable and have accessible labels/state, verified by keyboard smoke and DOM inspection.
- [x] Web checks pass, verified by `just web-check` and `cd web && npm run typecheck`.

## Completion Evidence

- `just web-check` passed.
- `cd web && npm run typecheck` passed.
- Chrome DevTools smoke on `http://localhost:3401/dashboard/routes` verified `Focus map` collapses both panels and exposes `Show library`, `Show editor`, and `Show panels` controls with `aria-expanded` on panel toggles.
