## Goal

Make unsaved edits in the Web Places and Routes editors obvious and hard to lose. Success means users can see when a draft differs from the saved record, get warned before destructive navigation, and receive a clear save confirmation.

## Context

Current Places and Routes pages keep local draft state in `web/app/dashboard/places/page.tsx`, `web/app/dashboard/routes/page.tsx`, `PlaceEditor`, and `RouteEditor`. Save feedback exists in `RouteEditor`, but unsaved state is not exposed consistently across the map, list selection, editor footer, and navigation.

## Non-Goals

- Do not add offline draft persistence in this phase.
- Do not redesign the editor forms beyond unsaved-state signals and guards.
- Do not change backend API contracts.

## Plan

- [x] Add dirty-state detection helpers for Place and Route drafts to compare editor state with the selected saved item; verify with focused unit tests or small pure-function tests under `web` plus `npm run typecheck`.
- [x] Surface dirty state in `PlaceEditor` and `RouteEditor` footer/header copy with an `Unsaved changes` label and save-success toast/notice; verify with Chrome DevTools screenshots of both clean and dirty states.
- [x] Guard selection changes in `FieldNotebook` entries so switching Places/Routes while dirty asks the user to save, discard, or cancel; verify manually in `just webtest-up` by editing a field and attempting to select another item.
- [x] Guard browser/tab navigation with `beforeunload` only while dirty; verify manually by editing a field and reloading the page, then confirming no warning appears after saving.
- [x] Add discard/reset actions that restore the selected saved item or clear a new draft; verify by editing place coordinates and route waypoints, discarding, and checking the map/editor return to saved values.
- [x] Run quality gates for touched Web code; verify with `just web-check` and `cd web && npm run typecheck`.

## Risks

- Dirty checks can become noisy if derived/default values differ in shape from API payloads; keep comparison helpers small and normalize values before comparing.
- Native `beforeunload` prompts are browser-controlled and cannot show custom text; do not rely on custom copy there.

## Completion Checklist

- [x] Dirty Places and Routes show visible `Unsaved changes` state, verified by Chrome DevTools screenshots in the dev stack.
- [x] Switching selected library items while dirty cannot silently discard edits, verified by manual browser smoke in `just webtest-up`.
- [x] Reloading/closing while dirty triggers a browser warning and does not warn after save/discard, verified by manual browser smoke.
- [x] Save success and discard/reset behavior are visible and correct for Place and Route editors, verified by manual browser smoke.
- [x] Web checks pass, verified by `just web-check` and `cd web && npm run typecheck`.

## Completion Evidence

- `just web-check` passed.
- `cd web && npm run typecheck` passed.
- Chrome DevTools smoke on `http://localhost:3401/dashboard/routes` verified `Unsaved changes`, `Discard changes`, and `beforeunload` cancellation for dirty route edits.
