# Web workspace UI polish

## Goal

Finish the UI/UX direction in https://chatgpt.com/share/6ac34214-db94-83ee-b9f1-ab6bbb00002f, including its three route, Library, and Account mockups, without changing cloud contracts or introducing fabricated capabilities.

## Context

Base: `ba41d92` on `main`, also `origin/main`. Branch: `narumi/feat/web-workspace-ui-polish`. Untracked user-owned `PLAN.md` is unrelated and must remain unchanged.

The earlier feedback pass (PR #328) already delivered collision-safe markers, mixed Library name/updated sorting, explicit Open on map, contextual notes/reference links, shared Account navigation, on-demand password changes, and texture removal. Preserve and freshly verify these rather than duplicating them.

Mockups express hierarchy, not literal specifications for pagination, autosave, simulated playback progress, undoable device actions, or account data. Retain the original brand assets, manual Save, existing device playback dialog, session revocation confirmations, and one MapLibre implementation. Only the existing 1440×900 light-mode Web target is in scope; Backend and Android are unchanged.

## Plan

- [x] Read the full shared conversation and all three generated images; inspect instructions, current code, prior delivery, callers, and clean base. Reference images remain outside Git.
- [x] Separate the existing Path and Playback settings with Radix tabs; keep identity, details, Save, Share, and device playback discoverable. Use that same selection to show editable markers in Path and endpoint-only read-only preview in Playback, without a redundant second mode switch. Keep draft state/history/metadata across tab changes and prevent map clicks/drags in preview.
- [x] Scale ordinary waypoint labels by zoom while retaining collision-safe priority targets, and synchronize marker/list selection and map centering. Test empty/single/dense/closed routes, offscreen endpoints, zoom changes, and preview selection.
- [x] Align Library name/type/summary/action columns and retain 56–64px desktop rows, mixed sorting, search/filter, reference-link disclosure, sharing/deletion, and failure/empty feedback.
- [x] Reduce large workspace panel rounding and stacked card chrome without changing marker positioning, brand assets, or security behavior. Keep Account sign-in methods, sessions/devices, and password disclosure intact.
- [x] Repair the production MapLibre worker loading discovered during visual verification: pre-render only the installed worker/shared modules under fixed sibling filenames, preserve MIME/security/cache headers, and reject all unlisted paths. No dependency, remote CDN, or upstream asset changes. Asset byte-equality/allowlist tests and actual rendered GeoJSON checks pass.
- [x] Update the user guide for the actual route workflow and record verification evidence.

## Completion Checklist

- [x] Node.js 22 Web tests, `just web-check`, `just web-lint`, `just web-typecheck`, and `just web-build` pass; record existing warnings and any failure honestly.
- [x] Chrome DevTools fixture checks at 1440×900 light mode cover all three screens, Path/Playback draft preservation and read-only preview, dense marker selection/list/map sync and zoom recovery, mixed columns/sort/search, password disclosure/focus restoration, and plausible read/save failures. Fixtures block actual backend/device/database writes; screenshots remain outside Git.
- [x] Review complete diff for scope, API/storage compatibility, map lifecycle/events, draft/save semantics, focus/accessibility, and security; `git diff --check` passes. Preserve `PLAN.md`, lockfiles, schemas, caches, and image binaries.
- [x] Archive this plan and update the index after acceptance evidence passes; sign the intended commit, push the focused branch, and open a PR with verification and limitations. No releases, deployments, or device operations.

## Verification evidence

- Node.js `22.20.0`, locked dependencies installed with `just web-install`; no manifest/lockfile edits. `npm test`: 61/61 passing. `just web-check`, `just web-lint`, `just web-typecheck`, and `just web-build` pass. Biome retains the existing 44 CSS specificity warnings; no new warnings.
- Chrome 154 DevTools Protocol, isolated headless profile, 1440×900 light mode, against the production build on localhost:3411. Fixture script/screenshots/logs remain outside Git at `/private/tmp/kestrel-uiux-reference/` and `/private/tmp/kestrel-uiux-*.log`.
- Library: mixed name order, matching column positions, 64px rows, type filter, name/updated sorting, tag search/clear, empty results, retained content/retry after a mocked read failure, safe reference-link disclosure, and Share dialog opening. No real mutations.
- Account: shared navigation without a falsely active workspace tab; linked sign-in method, two fixture sessions, empty devices/disabled QR states, on-demand password form, close/reset, and focus restoration. Credential/revocation submissions and live QR/OIDC flows remain outside this UI-only change.
- Route: rendered GeoJSON features (not only DOM markers), collision-safe dense markers, map centering and visible selected list row, zoom recovery (5 → 24 visible targets), pointer append, Undo/Redo preserved across tabs, keyboard tab navigation, name/speed/mode retention, read-only preview click/drag blocking, and style replacement retaining rendered route/read-only state. A mocked 503 Save retains all 94 original coordinates and per-waypoint speed/pause metadata; Discard restores saved data, and invalid speed remains unsavable from Path.
- Worker and shared module return HTTP 200 JavaScript with `nosniff` in production and Webpack development; unlisted assets and `.env` return 404. Production build pre-renders both modules, so deployment does not require runtime filesystem copying. Tests verify exact locked-package bytes and fail-closed traversal.
- Initial visual verification caught the pre-existing broken default worker URL. A hashed worker URL also failed its relative shared-module import; fixed-name pre-rendered modules resolved both errors. Initial format checks failed while iterating and now pass. One browser retry hung on an old page's unsaved-navigation prompt; fresh isolated targets with a 150s watchdog resolve that harness issue.
- Existing dependency audit risk: Next.js 16.3.5 reports critical advisory GHSA-vcvr-r3jv-pc5j (`next/og ImageResponse`). Source search finds no use of that API. No dependency upgrade is included in this UI task. Audit itself does not pass; required Web gates do.
- Android/Backend are unchanged, so their gates, migrations, real-device commands, and live-account/database tests are not applicable. Mobile/dark-mode matrices, release/deploy, real password/Share/delete/device writes, and package publishing were not performed.

## Handoff

Implementation commit `73bd780` is SSH-signed and verified using a temporary allowed-signers file, pushed to `narumi/feat/web-workspace-ui-polish`, and delivered as [PR #330](https://github.com/narumiruna/kestrel/pull/330) against `main`. This plan is archived and indexed in the documentation follow-up. Hosted CI is still pending at handoff and is not claimed as passing. Local commit hooks passed, including Java 26 Spotless and Web Biome. Untracked user-owned `PLAN.md` remains untouched.

## Risks

Tab changes must not remount MapLibre or erase draft history. Deferred style callbacks must use the latest editing mode. Preview must block both append and drag, including after style recovery. Non-visible Playback fields still require domain validation before Save. Endpoint separation must stay collision-safe and geographic coordinates must not change. Account and remote actions retain existing security checks; browser tests must not contact a real backend.
