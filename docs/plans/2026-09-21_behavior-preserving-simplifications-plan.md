# Behavior-preserving simplifications

## Goal

Reduce independent implementations of the same behavior across Android, Backend, and Web while preserving current API responses, persisted data, sync semantics, and user interactions. Implement only the six confirmed opportunities from the repository review.

Status: all six implementations, focused acceptance checks, required workspace checks, and final diff review pass on `narumi/refactor/behavior-preserving-simplifications`, based on `origin/main` at `ec4984e`; PR delivery is in progress. The user authorized implementation, signed commits, push, and a pull request. Nothing has been pushed and no PR has been opened. Production operations and unapproved device/data operations remain excluded.

## Context

Kestrel has separate Kotlin/Compose, Hono/Prisma, and Next.js/Radix workspaces. Keep those boundaries; consolidate domain behavior within its owning workspace rather than introducing cross-platform schemas or generic utility frameworks.

Review-session baseline, not completion evidence for future edits:

- Backend: six focused Jest suites passed, covering 68 tests in library models/service/validation, sharing, sync, and remote-control service.
- Web: all 18 tests passed; `./node_modules/.bin/tsc --noEmit --incremental false` passed.
- Backend: `./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.build.json` failed because installed dependencies lack `jose`, `@prisma/adapter-pg`, and generated Prisma OIDC models.
- Checks used local Node.js 25 rather than CI's Node.js 22. Android execution, browser verification, database integration, and production builds were not run.
- The worktree was clean before creating this plan. No implementation files were changed during review.

## Non-Goals

- No feature changes, UI redesign, dependency upgrades, database schema changes, migrations, or public API changes.
- No authentication, refresh-token, remote-command, or foreground-service redesign.
- No unification of validators with different accepted inputs or error messages.
- No generic CRUD service, configurable share-panel framework, or new UI/test framework merely to support these refactors.
- No unrelated dead-code cleanup or changes to other active plans.

## Plan

### 1. Establish the execution baseline

- [x] Obtain explicit implementation authorization before changing source files. The user requested end-to-end execution and PR delivery; no existing device or database has been modified.
- [x] Recheck the cited implementations and callers against the current worktree; confirm that all six opportunities still hold and preserve unrelated changes.
- [x] Prepare Node.js 22 and Java 26, restore JavaScript dependencies from the existing lockfiles with `npm ci`, and generate Prisma. Node 22.23.2, Java 26.0.2, both installs, Prisma 7.10.0 generation, and Backend typechecking passed without manifest/lockfile/schema/migration changes. SDK found at `/opt/homebrew/share/android-commandlinetools`.
- [x] Rerun the focused Backend suites and Web tests/typechecks under Node 22: 68 Backend tests, 18 Web tests, and both typechecks passed. The stale-dependency failure is resolved.
- [x] Establish a safe validation target for the Room and browser cases below. Chrome DevTools checks passed against an isolated fixture. The user approved a new disposable Android target; AOSP API 36 arm64 revision 2 boots on emulator 37.1.11 as `emulator-5580`, with SDK/AVD files outside the repository and no existing device touched. Both archives passed their published checksums. Existing instrumentation lacked bootstrap fixtures; the extended cases are ready for before/after execution.

### 2. High: use one stored-route parser

Evidence: `backend/src/library/library.models.ts:169` and `backend/src/library/library.service.ts:645` independently parse stored revisions, validate waypoint metadata, and sort by `sequence`. Reads/sharing use the models implementation; updates use the service implementation.

- [x] Add characterization cases to `library.models.spec.ts` and `library.service.spec.ts` for unordered waypoints, missing/null metadata, and malformed stored payloads; confirm the existing read and update paths retain their current values and errors before extraction.
- [x] Export the existing parser from `library.models.ts` and use it in `LibraryService.updateRoute`; remove the duplicate parser, waypoint parser, nullable-number helper, and snapshot type from `library.service.ts`. Acceptance: both paths use one stored-data parser without routing stored payloads through request validation.
- [x] Run the library models/service and sharing service suites; verify unchanged error messages, accepted nullable values, sequence ordering, revision numbering, and waypoint metadata.

### 3. Medium: share Android's cloud-upsert workflow

Evidence: `app/src/main/java/dev/narumi/kestrel/core/cloud/CloudSyncRepository.kt:172` and `:231` repeat place/local-ID resolution, route/revision import, and library-item import. Both already use `CloudRouteSyncRows.kt` mappers.

- [x] Extend `app/src/androidTest/java/dev/narumi/kestrel/core/cloud/CloudSyncRepositoryTest.kt` with equivalent bootstrap/incremental import fixtures and a deterministic unique-ID factory; verify existing-ID reuse, new-ID allocation, missing revisions, embedded-library-item precedence, and database rows before extraction.
- [x] Extract a private `applyCloudUpserts(places, routes, libraryItems)` method inside `CloudSyncRepository`; call it within each existing transaction. Acceptance: one import sequence, unchanged DAO/UUID call order, and no new sync abstraction.
- [x] Keep bootstrap account cleanup/pruning, incremental deletions, cursor recovery, and success writes at their current call sites; verify unchanged final rows/cursors and rollback on an import failure with the Room fixtures.
- [x] Run JVM `CloudSyncRepositoryTest` and `CloudSyncMappersTest`, then the extended Room cases on the explicitly approved target; record results. Do not run connected instrumentation without explaining its install/data-loss risk and obtaining consent.

### 4. Medium: consolidate place creation across three entry points

Evidence: `backend/src/library/library.service.ts:76`, `backend/src/sync/sync.service.ts:306`, and `backend/src/sharing/sharing.service.ts:426` repeat sort-order lookup, place/library-item insertion, and two ordered sync events.

- [x] Strengthen the existing direct-create, upload-create, and copy-place tests to assert database arguments, optional description/tag handling, owner IDs, sort order, and event order; verify current behavior before extraction.
- [x] Introduce one plain library-owned transaction function for inserting a place, its library item, and the two sync events, returning their IDs; call it from all three paths. Acceptance: callers retain input preparation, transaction ownership, response queries/mapping, and upload idempotency.
- [x] Run `library.service.spec.ts`, `sync.service.spec.ts`, and `sharing.service.spec.ts`; confirm identical requests/results and retry behavior. Do not normalize sync input through the stricter direct-API validator or combine route-creation workflows with different sequence semantics.

### 5. Medium: share the share-link request lifecycle

Evidence: `web/components/dashboard/RouteSharePanel.tsx:9`, `PlaceEditor.tsx:413`, and `LibraryItemActions.tsx:27` independently implement share-link GET/POST/PATCH requests, 404 handling, and loading/error/mutation state.

- [x] Capture existing request and state transitions with controlled success, 404, and failure responses for the two editors and Library actions; record load/reset triggers, busy states, and displayed feedback. Use a narrow local test seam or Chrome DevTools rather than adding a generic testing framework.
- [x] Extract one domain-specific share-link hook for load/create/disable operations and migrate the three consumers; retain caller-specific markup, clipboard feedback, dialog load/reset triggers, and delete coordination. Acceptance: request/state behavior has one owner while the interfaces remain unchanged.
- [x] Verify create, disable, re-enable, reopen, item switching, and failure handling through Chrome DevTools against an approved disposable local fixture; confirm identical endpoint/body selection, 404-as-no-link behavior, labels, busy states, and clipboard messages. Keep route sharing bound to the saved route, never its unsaved draft.
- [x] Run Web tests and typechecking; record browser evidence without placing screenshots in the repository.

### 6. Medium: remove superseded route-draft helpers

Evidence: `web/components/dashboard/routeEditorUtils.ts:4` retains an unused draft model while `routeDraftState.ts` owns active draft behavior. `RouteEditor.tsx:44` imports only three presentation helpers from the old module.

- [x] Repeat production/test/import reference searches for `getRouteBaseline`, `isRouteDraftEqual`, `getWaypointKey`, `formatWaypointSummary`, `getRouteBuilderHint`, `getSaveDisabledReason`, and the exported `moveWaypoint`; confirm they remain unused before deletion. Do not confuse the exported helper with `RouteEditor`'s live local callback of the same name.
- [x] Remove those exports and their unused private helpers/imports; retain `formatWaypointName`, `getWaypointBadgeClassName`, and `formatWaypointCoords`. Acceptance: the active draft implementation and its consumers are unchanged.
- [x] Run Web tests and typechecking; confirm route metadata, reordering, undo/redo, and save-rebasing tests pass, with no references to removed exports.

### 7. Low: remove array conversions from single-selection controls

Evidence: `web/components/ui/radix-ui.tsx:33` wraps a scalar Radix `type="single"` value in an array API. All four consumers wrap and unwrap one value: `cartographer/Stage.tsx:58`, `dashboard/RouteEditor.tsx:514`, `dashboard/LibraryCatalog.tsx:172`, and `web/app/dashboard/map/page.tsx:634`.

- [x] Replace the adapter at all four call sites with Radix's scalar single-selection API and remove the obsolete wrapper; preserve the same primitives, classes, labels, and controlled selection. Acceptance: no singleton-array conversions remain in these controls.
- [x] Keep an explicit guard against Radix's empty-string deselection callback; verify pointer/keyboard changes and clicking the selected option retain current behavior, including the Stage control when visible, focus handling, and unsaved-draft navigation guards.
- [x] Run Web tests/typechecking and capture Chrome DevTools interaction results for all four controls; do not replace them with a different component family.

## Verification evidence

- Backend characterization: the four changed suites passed all 62 tests before and after extracting shared logic. Full Node 22 checks passed: `npm run prisma:generate`, `npm run lint`, `npm test -- --runInBand` (21 suites, 218 tests), `npm run test:e2e -- --runInBand` (3 suites, 9 tests), `npm run typecheck`, and `npm run build`. The e2e setup injects mocked Prisma; no real database was mutated. Package scripts were used because the current Backend `justfile` dependency guard still expects the removed Nest CLI.
- Android: Java 26 `just android-check`, `just android-lint`, `just android-test` (34 suites, 176 tests), and `just android-build` passed separately. Focused JVM `CloudSyncRepositoryTest` and `CloudSyncMappersTest` passed. `:app:compileDebugAndroidTestKotlin` passed with the extended Room fixtures before and after extraction. After explicit target approval, all **11 Room tests passed against both original `ec4984e` code and the refactored implementation**, with identical fixtures. The original code ran in a temporary detached worktree; the implementation branch was not reverted. Both builds used `:app:assembleDebug :app:assembleDebugAndroidTest`, installed only on `emulator-5580`, then ran `adb -s emulator-5580 shell am instrument -w -r -e class dev.narumi.kestrel.core.cloud.CloudSyncRepositoryTest dev.narumi.kestrel.test/androidx.test.runner.AndroidJUnitRunner`. Assertions cover equal final rows, identity/UUID allocation, missing revisions, explicit/embedded precedence, bootstrap pruning/account cleanup, delta deletions, transactional rollback, cursor advancement, uploads/conflicts, and bootstrap recovery for HTTP 410 expired and HTTP 400 ahead-of-server cursors.
- Web: Node 22 `just web-check` passed with 49 existing CSS specificity warnings; `npm test` passed all 18 tests; `just web-typecheck` and `just web-build` passed. New effect-dependency diagnostics were resolved with narrowly explained annotations retaining the original whole-saved-object reload trigger; no dependency rule or configuration was disabled globally.
- Chrome DevTools Protocol verification used Chrome 153, an isolated browser profile, a synthetic in-memory API at loopback port 3430, and Next.js at loopback port 3431. No existing cloud service, account, database, or device was used. Desktop viewport was 1440×1000; the Stage-only mobile control was exercised at 600×900. No screenshots were added.
- Before/after browser state and request traces matched exactly for Library place/route dialogs and both editors: GET 404, loading, POST failure/retry/success, PATCH failure/retry/disable/re-enable, clipboard success/failure wording, reopening, item switching, and GET failure. Controlled 650 ms responses verified disabled `Creating…`/`Saving…` states. Development Strict Mode's repeated mount GETs were retained.
- Before/after browser traces also matched for all four toggles: pointer changes, selected-option clicks retaining selection, ArrowRight/Enter changes, roles/checked values/focus, and Stage's visible Map/Choose/Edit control. Unsaved route navigation retained Keep editing/Discard changes behavior and focus restoration. Sharing an edited route sent only the saved route ID, no draft payload, and kept the saved-revision warning. Additional post-change place/route deletion checks passed: shared busy state disables the menu, errors remain visible after failure, opening Share clears those errors, and retry uses the same DELETE endpoint.

### Diff review and local commits

- Reviewed all 21 changed source/test files against `ec4984e`, including the two new helpers. Parser inputs/errors, caller-specific normalization, transaction/event order, sync orchestration, dialog triggers, delete coordination, and selected-option guards remain at their original boundaries. No authentication, refresh, foreground-service, schema, migration, dependency, CSS, or image changes were introduced. `git diff origin/main --check` passed. The generated `web/tsconfig.tsbuildinfo` change was restored; unrelated files were not changed.
- Signed source commits: `671333a` (Backend), `fea217c` (Android), `3f2b794` (Web). SSH signatures were verified with the configured signing public key using a temporary allowed-signers file, without changing Git identity or persistent verification configuration.
- Isolated browser/API/Next process groups were stopped after verification. Existing local cloud services and Chrome profiles were not changed.
- The user explicitly approved downloading/creating a new disposable emulator after being informed that instrumentation can reinstall the app and clear target data. The 11 before/after Room cases passed without a production-code fix, including an added cursor-recovery regression. The emulator was stopped and the temporary baseline worktree removed. No existing device was touched, and no acceptance criterion was removed or moved elsewhere.
- After the final test addition, Android format/lint/JVM/build checks passed again, using verified up-to-date outputs for unchanged tasks. Backend generation/lint/218 unit tests/9 mocked e2e tests/typecheck/build and Web check/18 tests/typecheck/build also passed again under Node 22. Final diff review found no additional correctness, security, lifecycle, compatibility, or scope issues. Remaining delivery work is the authorized branch push and PR; release/deploy/tag workflows will not be dispatched.

Changed source/test files:

- Android: `app/src/main/java/dev/narumi/kestrel/core/cloud/CloudSyncRepository.kt`; `app/src/androidTest/java/dev/narumi/kestrel/core/cloud/CloudSyncRepositoryTest.kt`.
- Backend: `backend/src/library/library-writes.ts`, `backend/src/library/library.models.ts`, `backend/src/library/library.models.spec.ts`, `backend/src/library/library.service.ts`, `backend/src/library/library.service.spec.ts`, `backend/src/sharing/sharing.service.ts`, `backend/src/sharing/sharing.service.spec.ts`, `backend/src/sync/sync.service.ts`, `backend/src/sync/sync.service.spec.ts`.
- Web: `web/app/dashboard/map/page.tsx`, `web/components/cartographer/Stage.tsx`, `web/components/dashboard/LibraryCatalog.tsx`, `web/components/dashboard/LibraryItemActions.tsx`, `web/components/dashboard/PlaceEditor.tsx`, `web/components/dashboard/RouteEditor.tsx`, `web/components/dashboard/RouteSharePanel.tsx`, `web/components/dashboard/routeEditorUtils.ts`, `web/components/dashboard/useShareLink.ts`, `web/components/ui/radix-ui.tsx`.
- Documentation: this plan remains active until Room verification and PR delivery are complete.

## Risks

- Stored-data parsing intentionally differs from request validation. Tightening accepted values or normalizing missing metadata would be a behavior change.
- Sync extraction can alter identity allocation, transaction ordering, pruning, or cursor advancement. Keep orchestration at the existing boundaries and test database outcomes, not only mapper outputs.
- Share-link consumers have different load/reset and delete coordination behavior. Share the request lifecycle, not the entire UI or its wording.
- Selected-option clicks currently do not clear single-selection state. A direct Radix migration must retain that guard.
- The initial dependency and unavailable-target gaps are resolved by lockfile installs/Prisma generation, isolated Chrome checks, and approved disposable Room execution. Remaining verification limits: Backend e2e uses mocked Prisma rather than a live PostgreSQL database; Room ran on one AOSP API 36 arm64 emulator, not physical devices or an OS matrix. No production or physical-device operation is part of this refactor.

## Rollback / Recovery

Keep each proposal independently reviewable. If characterization or regression checks fail, stop that refactor and restore only its own changes after checking for unrelated edits; do not use a worktree-wide reset. No database rollback, migration, storage reset, or compatibility-data removal is needed because schemas and public contracts must remain unchanged. This plan authorizes no deployment or release.

## Completion Checklist

- [x] All six proposals are implemented and their focused acceptance checks pass; each shared behavior has one owner and no speculative abstraction was introduced.
- [x] Android validation passes under Java 26: `just android-check`, `just android-lint`, `just android-test`, and `just android-build`, plus the approved Room cases above. Record each command separately.
- [x] Backend validation passes under Node.js 22: Prisma generation, lint, unit tests, mocked e2e tests, typechecking, and build using the `justfile` recipes or corresponding package scripts. Inspect test setup before execution to ensure no real database is mutated.
- [x] Web validation passes under Node.js 22: `just web-check`, `cd web && npm test`, `just web-typecheck`, and `just web-build`, plus the recorded Chrome DevTools checks above. `just web-verify` alone does not run the Web tests.
- [x] The final diff preserves API response/error shapes, stored values, identity/transaction/event ordering, sync retries/cursors, and UI behavior; manifests, lockfiles, schemas, migrations, unrelated files, and image binaries are unchanged.
- [x] Baseline failures and unavailable checks are resolved, or any proposed scope/acceptance change is explicitly accepted by the user; leave unverified tasks open rather than silently narrowing scope.
- [ ] Record the final changed-file list and check outcomes, create signed commits, push only the focused branch, and open the requested pull request with verification evidence and remaining risks. No deploy, release, or unapproved device/data operation occurs.
