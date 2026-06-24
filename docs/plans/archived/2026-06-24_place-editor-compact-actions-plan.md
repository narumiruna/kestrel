## Goal

Make the Web place and route editors easier to use by removing secondary share and remote-control panels from the main form flow. Success means editor forms keep primary data fields first, save actions stay primary and reachable, delete actions remain visually separated, and Share / Device actions open overlays without changing editor content height.

## Context

`PlaceEditor` is rendered inside `IndexCard` with `showHeader={false}` and `showMap={false}` in `web/app/dashboard/places/page.tsx`. `IndexCard` already has an `actions` slot, so the Device action can live in the card header without adding new layout plumbing. Current share and remote UI live in `web/components/dashboard/PlaceEditor.tsx` and `web/components/dashboard/RemoteControlPanel.tsx` as in-flow accordion sections.

Chrome review of the current UI at `1440×760` confirmed the plan: the right editor panel was about `402px` wide, collapsed Web remote + Publishing/share already occupied two card rows below the fields, and opening both grew `.place-editor-content` to about `952px` scroll height for a `430px` viewport. The footer stayed sticky, but the secondary panels dominated the editor scroll area.

## Non-Goals

- Do not change backend share-link or remote-control APIs.
- Do not add a UI dependency; use existing React state and CSS.

## Plan

- [x] Split `web/components/dashboard/RemoteControlPanel.tsx` so the existing control body can be rendered inside a native `<dialog>` for places while preserving the route accordion; verified `RouteRemoteControlPanel` still renders `<details>` with Chrome/CDP on `/dashboard/routes`.
- [x] Add a compact place Device action in `web/app/dashboard/places/page.tsx` via `IndexCard.actions`; verified the main `PlaceEditor` no longer renders `PlaceRemoteControlPanel` in `place-editor-content` and the header action opens the Device dialog.
- [x] Replace the `Publishing / share` `<details>` in `web/components/dashboard/PlaceEditor.tsx` with a footer `Share` secondary button in the save action group, visually between `Delete` and `Save place`; verified `PlaceSharePanel` can create a public link and then shows copy/open/disable actions.
- [x] Add the smallest needed CSS in `web/app/globals.css` for the Share dialog, Device dialog, and footer action row so dialogs sit above the editor instead of consuming form height; verified `Delete` stays on the left, `Share` is secondary, and `Save place` remains the rightmost primary action.
- [x] Add basic dialog accessibility: `type="button"`, `aria-haspopup="dialog"`, labelled title, close button, and native Escape close; verified with Chrome/CDP that Escape closes Share.
- [x] Run `cd web && npm run lint` and `cd web && npm run typecheck`; both passed, and `web/tsconfig.tsbuildinfo` was reverted after typecheck rewrote it.
- [x] Manually review `/dashboard/places` with an existing place: opened Device, opened Share, created a public link, saw copy/open actions, and confirmed no in-flow accordion remains; screenshot evidence at `/tmp/kestrel-places-compact-actions.png`.
- [x] Apply the same compact-action pattern to `/dashboard/routes`: move route remote control to a Device dialog in the route summary header, move route publish/share into a footer Share dialog, and keep `Public route` in that dialog; verified with code review and web checks.

## Risks

- Header Device action needs to reflect selected place changes; mitigated by keying `PlaceRemoteControlAction` by selected place id.
- Native clipboard may fail outside secure contexts; existing manual-copy fallback notice remains.

## Completion Checklist

- [x] Publishing/share no longer appears as a large accordion card in place or route editors, verified by `web/components/dashboard/PlaceEditor.tsx`, `web/components/dashboard/RouteEditor.tsx`, and Chrome/CDP on `/dashboard/places` (`detailsCount: 0`).
- [x] Web remote control is accessible from compact Device actions and no longer appears in the place/route form flow, verified by `web/app/dashboard/places/page.tsx`, `web/components/dashboard/RouteEditor.tsx`, and Chrome/CDP (`headerActions: "Device\nNo devices"`).
- [x] Opening Share or Device does not change the main editor content height, verified by Chrome/CDP (`411.4375px` before, Share open, and Device open).
- [x] `Save place` remains the primary footer action and `Delete` remains visually separated, verified manually and by Chrome/CDP footer text `Delete\nShare\nSave place`.
- [x] Web checks pass with `cd web && npm run lint` and `cd web && npm run typecheck`.
