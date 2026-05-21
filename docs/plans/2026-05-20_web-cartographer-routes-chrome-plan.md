## Goal

Extend the cartographer workspace to the Routes page and replace the old dashboard header/tab chrome with field-notebook chrome. Success means Places and Routes share the same map-first stage, route editing still works, and no old segmented-control/top-header dashboard chrome remains in the cartographer dashboard.

## Context

This plan depends on the cartographer Places components being available. The current Routes page is `web/app/dashboard/routes/page.tsx`; route editing lives in `web/components/dashboard/RouteEditor.tsx` and map editing in `web/components/RouteMapEditor.tsx`.

## Non-Goals

- Do not change route API schemas or backend route behavior.
- Do not add GPX/KML import/export or track recording.
- Do not use a keyed hosted watercolor tile provider.
- Do not rebuild login beyond optional visual alignment.

## Architecture

Routes should reuse the `web/components/cartographer/` stage primitives. Route data fetching and mutations remain in `web/app/dashboard/routes/page.tsx`; the existing `RouteEditor` can be embedded or split only where necessary to preserve waypoints, publishing, and save/delete behavior.

## Plan

- [x] Add `UserMark.tsx` and account-menu integration to `web/components/cartographer/` so logout/theme/password actions remain reachable after the old header is removed; verify manually that logout and theme toggle still work.
- [x] Remove the old dashboard top header and segmented tabs from cartographer Places/Routes pages while keeping navigation inside `FieldNotebook`; verify with `rg -n "kc-topbar|kc-tabs|DashboardShell" web/app/dashboard web/components/cartographer` and browser screenshots.
- [x] Rebuild `web/app/dashboard/routes/page.tsx` around `Stage`, `EdgeTape`, `CornerMark`, `FieldNotebook` in Routes mode, `StatusStrip`, `ScaleBar`, and `ZoomStack`; verify with screenshot of `/dashboard/routes`.
- [x] Implement a route `IndexCard` variant with draft/revision stamp, route metadata, waypoint count, mode, speed, distance, and action bar; verify selected route details match API data in browser smoke.
- [x] Preserve route editor functionality by embedding or adapting `RouteEditor`: waypoint add/remove/reorder, map click add, marker drag, save, delete confirmation, public/share link; verify with manual route edit smoke.
- [x] Add a stage-level keyboard shortcut module in `web/lib/keyboard.ts` or `web/components/cartographer/useKeyboardShortcuts.ts`: `g p`, `g r`, `n`, `/`, `Escape`, and `?`; verify shortcuts do not fire while typing in inputs/textareas/contenteditable.
- [x] Add a keyboard cheatsheet overlay with mono typography and paper-card styling; verify `?` opens/closes it and `Escape` closes it.
- [x] Delete or deprecate unused old dashboard chrome references after both Places and Routes are migrated; verify removed files/selectors are listed in the PR description.
- [x] Run web quality gates; verify with `cd web && npm exec -- biome ci .`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.

## Risks

- Removing `DashboardShell` can accidentally drop auth/session controls if `UserMark` does not fully replace them.
- RouteEditor is stateful and long; splitting too aggressively can create save/waypoint regressions.
- Keyboard shortcuts can conflict with form editing unless input focus checks are comprehensive.

## Rollback / Recovery

- Keep the Routes chrome migration as a separate commit from keyboard shortcuts so shortcut regressions can be reverted independently.
- If route editing regresses, temporarily mount the existing `RouteEditor` in a floating panel and defer deeper visual decomposition.

## Completion Checklist

- [x] Places and Routes both use cartographer stage chrome and no old dashboard top header/tab group, verified by screenshots and `rg -n "kc-topbar|kc-tabs" web/app/dashboard web/components/cartographer` review.
- [x] Route workflows still work, verified by manual tests for selecting a route, adding waypoints, dragging markers, saving, deleting with confirmation, and share-link actions.
- [x] Account/logout/theme/password actions are still reachable, verified by manual browser smoke.
- [x] Keyboard shortcuts work and do not fire while typing, verified by manual shortcut smoke.
- [x] No keyed map-provider dependency is introduced, verified by `rg -n "NEXT_PUBLIC_.*MAP|api_key=" web`.
- [x] Web checks pass, verified by `cd web && npm exec -- biome ci .`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.
