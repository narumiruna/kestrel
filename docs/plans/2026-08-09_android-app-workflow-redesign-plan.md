# Android app workflow redesign plan

## Goal

Redesign the Kestrel Android interface around the goals of choosing, previewing, starting, monitoring, replacing, and saving mock locations and routes. Make consequential changes explicit and atomic, keep active state visible, preserve every existing workflow and stored value, and provide responsive and accessible behavior across supported Android form factors. Completion requires automated evidence for primary flows, preview/confirm/cancel semantics, navigation, failures, compatibility, responsive layouts, accessibility, and updated user documentation.

## Context

The app currently has adaptive `Map`, `Favorites`, and `Options` destinations. It already exposes authoritative playback through `LocationService.runtimeState`, ordered setup prompts, route previews, presets, stable Room library IDs, and foreground-service controls. The redesign should build on those strengths rather than replace the mock engine, MapLibre, Room, DataStore, cloud APIs, or remote-command contract.

The main problems are silent interruption of active playback when opening a point, favorite, or map link; inconsistent immediate-save versus `Save` / `Done` behavior; active state being absent from Favorites and Options; fire-and-forget UI operations with limited failure recovery; duplicate Points/Routes navigation; implementation-oriented labels; incomplete Back/focus behavior; and insufficient interaction, responsive, accessibility, and forward-compatibility tests.

## Architecture

- Keep three shallow destinations: `Map`, `Favorites`, and renamed `Settings`. `MainActivity` owns destination/back behavior and a compact playback-status surface outside Map.
- Move screen orchestration into injectable feature state holders or ViewModels. Composables render explicit loading, empty, preview, active, saving/applying, success, error, disabled, and partial states instead of calling repositories directly.
- Keep `LocationService.runtimeState` authoritative. Add request-correlated local operation outcomes so point/route start or replacement is acknowledged before UI success, and validate/prepare replacements before altering the old runtime. Never implement replacement as `stop()` followed by `setLocation()` / `startRoute()`.
- Keep preview state separate from runtime state. `KestrelMap` renders distinguishable Current and Preview markers/routes while the current mock continues until confirmation.
- Keep Room and DataStore as sources of truth. Editors hold drafts and persist only on explicit confirmation; failed writes retain the prior stored value and the editor draft.
- Preserve existing JSON fields during known-field writes, including unknown future fields, while retaining `Json { ignoreUnknownKeys = true }`, nullable/defaulted new fields, stable `libraryItemId` identity, route modes, cloud registration, pending ACK, and session semantics.
- Keep settings as one ordered flat inventory of six rows. Dialogs/sheets are used only where editing needs a draft, preview, confirmation, or cancellation—not as Basic/Advanced navigation.

## Non-Goals

- Do not change `MovementEngine` modes, route generation determinism, mock-location requirements, or foreground-service persistence semantics.
- Do not add root behavior, Play Integrity/SafetyNet bypasses, track recording, or GPX/KML import/export.
- Do not replace MapLibre, Material 3, Room, DataStore, cloud APIs, or the Web remote-control queue.
- Do not add a fourth top-level destination or duplicate an existing Map/Favorites workflow behind a new mode switch.
- Do not change the existing startup favorite behavior in this redesign: a saved point starts mocking, while a saved route opens as a draft. The UI and documentation must describe that difference accurately.
- Do not run connected instrumentation, reinstall, clear data, or alter a physical device without separate explicit approval and a verified backup where required.
- Do not add or commit screenshot/image binaries; generated visual evidence stays untracked and outside the repository when applicable.

## Assumptions

- The primary users are Android developers/QA testers, route-simulation users, repeat Favorites users, and opt-in cloud/remote-control users.
- Routine start, pause, resume, stop, sort, and ordinary saves should remain efficient; confirmation is reserved for active replacement, deletion, conflict overwrite, remote-control enablement, sign-out with remote control active, and other meaningful risk.
- Compact phones remain the primary layout, but medium/expanded widths, landscape, large text, touch, D-pad, hardware keyboard, and TalkBack are supported.
- Custom cloud server support remains available, but changing servers while signed in is disabled with an explanation rather than partially migrating session/device state.

## Unknowns

- The first implementation task must determine the smallest reliable non-destructive Compose interaction-test path for focus, Back, keyboard, and responsive assertions without targeting an attached physical device.
- A bounded prototype must verify that separate Current/Preview MapLibre sources remain readable and performant for large generated routes before the full Map refactor.
- A bounded service test must prove that request-correlated replacement failures can retain the prior runtime; if Android service-start failure prevents that guarantee, the UI must state the exact boundary and keep preview/runtime state unambiguous.

## Risks

- Foreground-service lifecycle changes can regress restore, notification, polling leases, or atomic replacement. Keep the protocol additive and cover Single, Route, paused, completion, process restore, and failure paths.
- Two route overlays can become visually ambiguous. Use labels plus shape/pattern/opacity differences, not color alone, and show Preview only after an explicit selection.
- Explicit drafts can add steps. Keep simple controls inline and require Save only where cancellation or failure preservation has user value.
- A global playback surface consumes space on compact screens. Show it only outside Map and keep one primary runtime action plus `View map`.
- Unified Favorites can reduce type-specific scanning. Retain flat `All / Points / Routes` filters and visible item-kind summaries without default tab separation.
- Forward-compatible JSON merge logic can accidentally retain invalid known values. Normalize known fields while preserving only unknown keys and verify each settings blob independently.
- Cloud and remote-control actions cross local/server boundaries and cannot be globally transactional. Preserve prior local state on failure, report any server/local divergence, and retain existing retry/idempotency semantics.

## Plan

### 1. Establish testable contracts and compatibility guards

- [ ] Add a focused architecture/test spike for Compose interaction execution on a disposable host or CI emulator, document the chosen non-destructive command in this plan, and prove Back/focus/keyboard assertions with one isolated component without installing on a physical device.
- [x] Add pure presentation state models for app-shell playback, Map setup/draft/preview/active operations, Favorites loading/edit/delete, and Settings drafts; verify transition tables with targeted `:app:testDebugUnitTest --tests ...` commands before wiring production composables.
- [x] Add serialization fixtures that inject unknown fields into startup, random-route, playback, cloud, remote-control, and mock-state JSON, update one known field, and assert unknown fields plus legacy defaults survive; verify with targeted `core.data` tests.
- [x] Prototype separate Current/Preview MapLibre sources and an adaptive compact/medium/expanded Map task-panel shell; verify source reconciliation with JVM tests and review generated captures outside the repository at 320dp, compact landscape, 600dp, and 840dp.
- [x] Add request IDs and local operation outcomes to the `LocationService` UI command boundary, validate replacement inputs before changing runtime, and cover successful/failed Single-to-Route, Route-to-Single, Route-to-Route, paused-route, and restore transitions with focused service/coordinator tests.

### 2. Redesign navigation and active-state visibility

- [x] Update `MainActivity.kt` to retain `Map` / `Favorites` / `Settings`, add deterministic Back handling, and show a compact authoritative playback bar outside Map with `View map` and contextual Pause/Resume/Stop; verify destination, transient-dismissal, focus-return, and runtime-state tests.
- [x] Define shared feedback and operation components for scoped progress, actionable errors, success announcements, disabled reasons, and screen-reader live regions; verify semantics, stable layout size, and retry behavior in isolated Compose tests.

### 3. Redesign the Map workflow

- [x] Refactor Map into explicit Setup, Empty, Preview/Draft, and Active task-panel states with one dominant action per state; verify point, drawn route, generated route, pause/resume/stop, route completion, and setup-blocked presentation tests.
- [x] Replace `Go to` with a goal-oriented chooser containing coordinate/URL input, a unified recent Favorites list, flat optional type filters, and `View all favorites`, while preserving external `geo:`, Google Maps, and share intents; verify valid/invalid input, empty/loading results, dismissal, and deep-link tests.
- [x] Make point/favorite/map-link selection side-effect-free preview while playback is active, render Current versus Preview concretely, and require a current/new comparison before `Replace current mock`; verify confirm sends one replacement, cancel sends no service command, and failure leaves the old runtime active.
- [x] Make random generation produce a reversible route preview with presets, custom values, estimated distance, explicit `Preview route`, and no playback start; verify replacement of an existing draft is disclosed and cancellation preserves both the draft and stored last-used values.
- [x] Add accessible route-draft controls for undo/remove/reorder or equivalent non-map waypoint management, keep speed presets and Once/Loop/Ping-pong choices flat, and verify keyboard/TalkBack alternatives to tap/long-press gestures.
- [x] Implement compact bottom-sheet and medium/expanded bounded side-panel layouts without hiding Map state or primary controls; verify no horizontal overflow or critical truncation at 320/360/412dp, short landscape, 600/840dp, dark mode, and 1.3x/2.0 font scale.

### 4. Redesign Favorites around reuse and safe management

- [x] Replace default Points/Routes tabs with one Favorites list, flat `All / Points / Routes` filters, flat `Manual / Recent / A–Z` sorting, and a direct empty-state `Choose on map` action; verify filtering, sorting, large collections, loading, empty, and navigation behavior.
- [x] Change the row primary action to `Preview on map`, keep one kind-specific Edit action and the existing Rename/Reorder/Delete capabilities, and expose complete item names/details without critical ellipsis; verify Place/Route and manual-order action inventories against the rendered UI.
- [x] Convert rename, point edit, route edit, save favorite, reorder, and delete into explicit pending/success/failure flows that await repository results; verify Save applies once, Cancel performs no write, failure keeps the draft and previous value, and success is announced.
- [x] Expand delete confirmation to preview cloud deletion semantics and startup-favorite fallback, then apply deletion and fallback consistently through repository ownership; verify local-only, synced, selected-startup, failure, and cancellation cases.

### 5. Redesign Settings as one flat, outcome-oriented inventory

- [x] Rename Options to Settings and present six ordered rows—app opening, map links, random routes, route recovery, cloud sync/account, and Web remote control—with actual current summaries and no Basic/Advanced grouping; verify inventory, ordering, loading, error precedence, and large-text rendering.
- [x] Rebuild startup editing as a draft with three flat choices, a unified Favorite picker, an exact point-versus-route effect preview, and explicit Save/Cancel; verify no first-item auto-selection, missing/deleted favorite fallback, cancellation, persistence failure, and legacy preference compatibility.
- [x] Rebuild random-route defaults and route recovery as preset-plus-custom editors with concrete distance/rollback previews, explicit Save/Cancel, and reset-as-draft behavior; preserve full existing numeric ranges and verify validation boundaries, failure, reset, and unknown-field retention.
- [x] Keep map-link setup goal-oriented, automatically recheck Android link/mock settings after resume, and ensure `Test geo link` creates only a preview rather than stopping active playback; verify supported/unsupported Android versions, missing activity fallback, active runtime, and cancellation.
- [x] Rework cloud account UI around sign-in state and sync outcomes, disclose custom server details contextually, hide OTP until credentials are ready for autofill, replace routine `Refresh session` with error recovery, and keep local Favorites visible during loading/offline/partial sync; verify TOTP/recovery-code focus, sign-in, sync, expiry, server-change disabled reason, retry, and partial-conflict states.
- [x] Require a concrete confirmation before enabling Web remote control, show device/readiness/last-command state in user language, keep disabling immediate, and preserve repository rollback/idempotency behavior on failure; verify signed-out, registering, enabled, disabled, session-expired, polling-error, enable-cancel, and disable-failure cases.
- [x] Redesign conflict resolution to compare every available differing field and label outcomes as device/cloud/keep-both effects; verify each confirmation, cancellation, failure preservation, focus return, and successful conflict removal.

### 6. Complete accessibility, responsive, documentation, and quality evidence

- [x] Add Compose interaction/semantics tests for primary actions, previews, confirmations, cancellations, Back navigation, focus entry/return, D-pad/keyboard activation, live state announcements, non-color status, 48dp targets, and disabled reasons using only the approved disposable test target.
- [x] Extend host screenshot/render cases for the redesigned high-risk states and supported width/text/theme matrix, run `just android-ui`, and keep all generated image references/diffs untracked and outside commits in accordance with repository policy.
- [x] Audit light/dark color pairs and Map Current/Preview/Device treatments for WCAG AA text/control contrast and non-color differentiation; record the checked token/semantic results in this plan without adding image binaries.
- [x] Update `README.md` and add or revise Android user guidance under `docs/` for setup, point/route preview, replacement confirmation, Favorites, exact startup behavior, route recovery, cloud sync/conflicts, remote-control authorization, failure recovery, and final `Settings` terminology; verify every documented label/path against source.
- [x] Run focused tests during each phase, then run `just android-check`, `just android-test`, `just android-ui`, `just android-build`, and `just android-lint` separately within 180-second command bounds; leave any unavailable or failing gate unchecked with concrete evidence.
- [ ] Perform a final requirement-by-requirement source/test/docs audit, confirm no image binaries or unintended generated files are tracked or staged, and obtain user acceptance of the final workflows before archiving this plan.

## Implementation evidence (2026-08-09)

- JVM presentation, compatibility, location-operation, repository, and failure/cancellation tests pass with `just android-test`. The isolated Compose interaction suite covers keyboard activation, 48dp targets, Back dismissal with focus return, confirmation/cancellation counts, and polite/assertive live regions; `:app:assembleDebugAndroidTest` proves it compiles.
- Connected execution of that Compose interaction APK was deliberately not run: this plan and repository policy require separate approval before any connected instrumentation/install. The non-destructive compile command is `./gradlew :app:assembleDebugAndroidTest`; the eventual disposable-emulator execution target is the existing `connectedDebugAndroidTest` task after approval.
- Twelve host render cases cover 320/360/412/600/840dp, 1.3x/1.4x/2.0 text, light/dark, setup, idle/draft, active, replacement, playback, Favorites, and Settings. Local PNG references under ignored `app/src/screenshotTestDebug/` were visually reviewed and `just android-ui` passed; no image is tracked or staged.
- Contrast audit (foreground/background): light body 16.45:1, light secondary 8.23:1, light primary 5.85:1, light error 6.53:1, dark body 14.16:1, dark secondary 10.78:1, dark primary 10.08:1, dark error 10.12:1, light Preview 6.03:1, and dark Preview 11.29:1. Current/Preview also differ by solid/dashed lines, marker size/stroke, and explicit Current/New text; runtime states pair colored dots with labels.
- Hardening review fixed lost DataStore unknown fields, list-element identity mismatches, delete/startup cross-store ordering, swallowed coroutine cancellation, stale idle foreground-service restore, unacknowledged-operation timeouts, remote-disable/sign-out partial failures, and misleading failure copy. Replacement provider preparation happens before the old route/job is cancelled.
- Final local gates passed separately: `just android-check`, `just android-test`, `just android-ui`, `just android-build`, and `just android-lint`. `:app:assembleDebugAndroidTest` also passed. User acceptance and connected interaction execution remain intentionally pending, so this plan stays active until PR review.

## Completion Checklist

- [x] Map exposes clear Setup, Empty, Preview/Draft, and Active states with one dominant action and authoritative playback status.
- [x] Selecting a point, Favorite, map link, or generated route can be previewed without stopping active playback; replacement is confirmed, atomic, acknowledged, and failure-preserving.
- [x] Favorites is a unified, scannable workflow with all existing save/open/edit/rename/reorder/delete behavior and safe cancellation/failure semantics.
- [x] Settings contains one flat six-item inventory with outcome-oriented labels, explicit drafts where needed, and no Basic/Advanced navigation split.
- [x] Loading, empty, success, error, disabled, offline/partial, preview, confirmation, and cancellation states are implemented and covered by automated evidence.
- [x] Back, focus, keyboard/D-pad, TalkBack semantics, live announcements, target sizes, contrast, large text, compact landscape, and medium/expanded layouts meet the stated acceptance criteria.
- [x] Existing Room rows, stable IDs, routes, startup references, sort order, mock state, sessions, custom server, remote registration/pending ACKs, legacy payloads, and unknown JSON fields survive the redesign.
- [x] README and Android user guidance exactly match final labels, effects, safeguards, recovery behavior, and platform limitations.
- [x] `just android-check`, `just android-test`, `just android-ui`, `just android-build`, and `just android-lint` pass, with no connected physical-device or destructive data operation performed without separate approval.
- [ ] User acceptance is recorded, all tasks and checks contain sufficient evidence, and the completed plan is moved to `docs/plans/archived/`.
