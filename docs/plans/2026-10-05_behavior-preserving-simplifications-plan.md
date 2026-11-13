# Behavior-preserving simplifications plan

## Goal

Resolve all eight confirmed findings from the full-repository simplification review. Reduce independent implementations, unused capabilities, and misleading APIs while preserving current API responses, stored data, transaction ordering, authentication semantics, and user interactions.

Status: all eight refactors were delivered in [PR #327](https://github.com/narumiruna/kestrel/pull/327), merged as `73c13fa`. Follow-up work on `narumi/test/simplification-verification` closes the route-linkage and helper-cancellation test gaps. Verification remains incomplete: Android screenshot references are missing, and the historical QR e2e failure has no established cause. Keep this plan active and the follow-up pull request in draft; do not archive the plan or claim completion.

The original, untracked root `PLAN.md` was deleted at the user's explicit request after the current source review. This file is the sole tracker for these eight refactors.

## Context

Kestrel has three meaningful workspace boundaries: Kotlin/Compose Android, Hono/Prisma Backend, and Next.js/Radix Web. Keep shared behavior inside its owning workspace. Use concrete domain operations, not generic CRUD, search, request, or UI frameworks.

This plan covers the original eight findings. The six changes in `archived/2026-09-21_behavior-preserving-simplifications-plan.md` are already delivered and are not repeated here. The evidence paragraphs in steps 2–9 describe the pre-refactor source at base `5bac5a3`; they are not descriptions of current duplication or unused code. Checked tasks retain the historical execution evidence below, subject to the reopened verification tasks. Recheck current callers before further work.

### Review-session baseline

These results describe the unmodified review checkout, not acceptance evidence for future changes. Checks used Node.js 26.10.0 rather than CI's Node.js 22; Android requires Java 26.

| Check | Command | Result |
| --- | --- | --- |
| Backend unit tests | `cd backend && npm run test -- --runInBand --no-cache` | 24 suites, 237 tests passed |
| Backend mocked e2e | `cd backend && npm run test:e2e -- --runInBand --no-cache` | 10 passed, 1 failed; Android QR-login flow reported `read ECONNRESET` |
| Backend typecheck | `cd backend && ./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.build.json` | Passed |
| Web tests | `cd web && npm test` | 30 tests passed |
| Web typecheck | `cd web && ./node_modules/.bin/tsc --noEmit --incremental false` | Passed using existing Next.js-generated types |
| Web lint | `cd web && npm run lint` | Passed with 44 CSS specificity warnings |
| Backend lint | `cd backend && npm run lint` | Attempts timed out without a completed result |
| Android JVM tests | `just android-test` and an offline `:app:testDebugUnitTest` attempt | Attempts timed out during Gradle startup; no fresh passing result established |

No production builds, browser verification, live PostgreSQL tests, connected instrumentation, or device operations were performed. The worktree was clean after review.

## Non-Goals and Action Limits

- No feature changes, UI redesign, dependency upgrades, schema changes, migrations, or stored-data cleanup.
- No consolidation of request validation with stored-data parsing or of distinct OIDC/QR-login protocols.
- No change to foreground-service lifecycle, refresh rotation, remote-command delivery, or account ownership rules.
- No broad CSS deletion or cascade reordering; live components reuse some classes from retired components.
- Historical authorization covered the original implementation, commit, push, and pull request. It did not cover production, device, or database operations. This record does not grant authorization for new actions.
- The current execution request authorizes the scoped tests and documentation, a focused branch, commit, push, and pull request. It does not authorize deployment, database changes, device operations, connected instrumentation, tags, or release workflows. The separate fixes listed below still require their own scope authorization. Browser screenshots belong outside the repository; do not stage image binaries.
- Keep all eight findings in scope. Leave failed or unavailable acceptance tasks open; do not move unfinished findings to another plan or backlog to declare completion.

## Plan

### 1. Establish a reproducible baseline

- [x] Recheck Git status, scoped instructions, cited definitions, and all callers/tests; record the implementation base revision and preserve unrelated changes. Acceptance: every finding is still present or has verified resolution evidence from intervening work.
- [x] Establish Node.js 22 and Java 26 with the configured Android SDK; use existing locked dependencies or `npm ci` when installation is required, without changing manifests or lockfiles. Acceptance: runtime versions and local tool availability are recorded.
- [x] Diagnose Backend lint and Gradle startup timeouts with bounded, observable checks. Keep the Bash tool timeout at 300 seconds, but bound each actual command to at most 180 seconds and split longer work into separately observed steps. Acceptance: required local checks complete or the external blocker is identified; blocked checks remain open.
- [ ] Reproduce the QR-login `ECONNRESET` failure under Node.js 22 and establish its cause before using e2e results for comparison. It did not reproduce (11/11 passed on base); no unrelated fix was needed, but the historical cause remains unknown. If a code fix is needed, obtain authorization for that explicit scope rather than hiding it in a simplification. Acceptance: the complete mocked e2e suite has a recorded passing baseline; do not weaken assertions or silently skip the failing case.
- [x] Capture focused characterization evidence before each refactor, using existing tests plus the cases below. For Web, use Chrome DevTools with an isolated local fixture at the repository's primary 1440×900 light-mode target. Acceptance: current outputs, errors, ordering, rendered controls, and interactions relevant to each finding are recorded without modifying real accounts, databases, or devices.

### 2. High: share Backend initial route creation

Evidence: `backend/src/library/library.service.ts:236` and `backend/src/sharing/sharing.service.ts:447` independently allocate sort order, create a route and revision, set the current revision, create a library item, and emit route/library-item sync events. `backend/src/library/library-writes.ts` already owns shared place creation.

- [x] Extend `library.service.spec.ts` and `sharing.service.spec.ts` to characterize write order, initial revision numbering, waypoint metadata, failure propagation, and shared copies with non-contiguous stored sequence values. Acceptance: the existing implementations pass identical expected write/response assertions before extraction.
- [x] Add one concrete `createRouteWithLibraryItem` operation to `library-writes.ts` and use it from normal creation and shared-route copying. Accept caller-prepared route fields and revision payload; keep validation, authorization, requested-revision selection, transaction boundaries, and final response loading/mapping at their callers. Acceptance: one implementation owns the common write sequence.
- [x] Add explicit `route.update` argument assertions, then run the library and sharing service suites and compare their database-call traces and returned snapshots. Acceptance: sort-order allocation, IDs, revision number 1, current-revision linkage, and route-before-library-item sync events are unchanged; normal creation still assigns sequence by index, shared copies preserve stored sequence and remain private, and a write failure prevents later writes.
  - Follow-up verified: `library.service.spec.ts` and `sharing.service.spec.ts` now assert exactly one update with the created route ID and revision ID. The normal-create fixture uses distinct created IDs. Both tests pass against the unchanged helper. In a disposable source copy, both tests fail for each wrong-revision, wrong-route, missing-update, and duplicate-update mutation; independent response mocks cannot hide those errors.

### 3. High: narrow the Web place editor to its used mode

Evidence: the only `PlaceEditor` caller is `web/app/dashboard/map/page.tsx:538`; it always uses compact details, hides the header/map, and supplies no delete callback. `web/components/PlaceMapEditor.tsx` is only referenced by the unreachable embedded-map branch.

- [x] Characterize new/existing place editing, map-pin/coordinate synchronization, dirty-state reporting, save/error feedback, discard, details disclosure, and sharing in the active Map inspector. Acceptance: the current field IDs, rendered classes, focus behavior, and saved/draft distinction are recorded.
- [x] Remove unused `compactDetails`, `showHeader`, `showMap`, and `onDelete` variants from `PlaceEditor.tsx` and its caller; remove unreachable header/map/delete markup, duplicate details markup, map-only fallback calculations, and `PlaceMapEditor.tsx`. Preserve the active DOM/layout wrappers rather than deleting empty containers incidentally. Acceptance: the component describes only the embedded inspector and no unused place-map implementation remains.
- [x] Run Web tests/typechecking and repeat the focused Chrome interactions. Acceptance: current field IDs/classes, callback timing, save failure retention, discard behavior, disclosure, sharing, and map synchronization remain unchanged; no second editor or new UI behavior is introduced.

### 4. Medium: share Android authorized-request retry

Evidence: `app/src/main/java/dev/narumi/kestrel/core/cloud/CloudSyncRepository.kt:558` and `RemoteControlRepository.kt:283` implement the same initial request, 401-only refresh, same-session concurrent-refresh fallback, and single retry. The existing `CloudSyncSessionProvider` is sufficient for this operation.

- [x] Add JVM characterization tests for success, non-401 failure, refresh success/failure, same-session concurrent refresh, logout/session replacement, cancellation, and a failed second request. Acceptance: tests lock down request/refresh counts, credentials, exact expiry message, and exception propagation.
- [x] Give the retry policy one internal owner in the cloud/session domain and call it from both repositories. Keep caller-specific initial session acquisition/messages, pending-ACK coordination, and `CloudAuthRepository.refreshSessionIfCurrent` with its mutex unchanged. Acceptance: both callers use the same policy without a configurable retry framework or new dependency interface.
- [x] Add helper cancellation tests during refresh and the second request, then run the focused policy tests and `RemoteControlRepositoryTest`, including refreshed pending ACKs and different-user protection. Acceptance: one retry only, no refresh for other failures, no switch to another session, unchanged ACK credentials/order, and helper cancellation is propagated. Full Android JVM checks follow in the final gate.
  - Follow-up verified: `AuthorizedSessionRequestTest.kt` now covers cancellation on the initial request, during refresh, and on the second request. The new cases assert exception identity, credentials, request/refresh counts, and no fallback session reads. All 10 helper tests and the focused remote/repository/mapper suites pass. These tests do not establish cancellation of suspended jobs or propagation through remote report/ACK callers. The concurrent-refresh fixture still uses a preloaded successor, not overlapping refresh calls.

### 5. Medium: share Backend exchange-session credential recovery

Evidence: `backend/src/auth/oidc.service.ts:1144` and `backend/src/android-login/android-login.service.ts:634` select identical session fields, reject missing/revoked/expired sessions, verify the derived initial refresh credential, and decrypt/verify the rotated successor when required.

- [x] Extend `oidc.service.spec.ts` and `android-login.service.spec.ts` with original-token recovery, valid rotation, missing/revoked/expired sessions, absent ciphertext, decryption failure, and successor-hash mismatch. Assert complete response shapes as well as tokens and session counts. Acceptance: existing implementations pass and recovery creates no additional session.
- [x] Extract one focused auth-domain session-credential recovery operation using existing concrete dependencies. Keep protocol-specific attempt authorization, secret derivation/context, recovery windows, audit events, response projection, and access-token issuance at the current callers. Preserve derivation/query order and fail-closed behavior. Acceptance: the shared session recovery sequence has one owner without merging protocols or normalizing responses.
- [x] Run both service suites and the mocked e2e suite against the repaired baseline. Acceptance: unchanged constant-time comparisons, expiry boundaries, query timing, current-successor verification, response fields, audit counts, and retry idempotency; no credential logging or new persisted secret.

### 6. Medium: remove unused Android reverse persistence mappings

Evidence: all five `toEntity` extensions in `app/src/main/java/dev/narumi/kestrel/core/library/LibraryMappers.kt:45` are called only by `app/src/test/java/dev/narumi/kestrel/core/library/LibraryMapperTest.kt:9`. Production writes use library row builders and cloud-sync mappings instead.

- [x] Replace round-trip-only mapper tests with direct entity-to-domain fixtures covering identity, timestamps, route revision, waypoint metadata/order, and library content assembly. Acceptance: tests exercise the mappings used by production without using the unused reverse mappings to construct their expected values.
- [x] Remove the five reverse mappings and their now-unused imports, keeping all `toDomain` functions, row builders, sync mappings, entities, and schemas unchanged. Acceptance: source searches find no reverse mappings or broken callers.
- [x] Run `LibraryMapperTest`, `LibraryRepositoryTest`, and `CloudSyncMappersTest`. Acceptance: used read projections and write builders retain their exact values; full Android compilation/JVM checks pass in the final gate.

### 7. Medium: remove unused Cartographer shell components

Evidence: `web/components/cartographer/FieldNotebook.tsx:16`, `StatusStrip.tsx:13`, `CornerMark.tsx:5`, `EdgeTape.tsx:1`, and `web/components/mapStyle.ts:183` (`createFieldNotebookMapStyle`) have no consumers. The active workspace uses `WorkspaceHeader` and a map item picker that still uses `field-notebook` classes.

- [x] Recheck static/dynamic imports, exports, and rendering references for the four components and style factory. Acceptance: no active consumer exists; record shared classes that the live Map picker and controls still need.
- [x] Remove those four source files and the unused style factory only. Keep active map-style choices and shared CSS unchanged. Acceptance: no orphan export or removed live selector remains.
- [x] Run Web typechecking/tests and inspect Map/Library navigation with Chrome DevTools. Acceptance: unchanged workspace header, picker, map-style options, navigation destinations, and rendered layout.

### 8. Medium: share saved-library search semantics

Evidence: `web/components/dashboard/LibraryCatalog.tsx:55` and `web/app/dashboard/map/page.tsx:766` duplicate place search over name/description/tags and route search over name/description/formatted mode, with trimmed lowercase substring matching.

- [x] Add characterization fixtures for whitespace, case, tags, notes, null descriptions, formatted modes, empty queries, and original result order. Acceptance: both current implementations return the same matching IDs for the fixtures.
- [x] Move the two concrete place/route matching predicates into a dashboard-owned search module and use them from both screens. Keep normalization, filtering/memoization, empty-query array shortcuts, type filtering, and result presentation compatible; do not create a configurable search framework. Acceptance: searchable fields and substring semantics have one implementation.
- [x] Run search tests, the Web test suite, and Chrome comparisons for the same queries in Map and Library. Acceptance: matching IDs/order, counts, empty-result feedback, selection, and navigation are unchanged.

### 9. Low: remove unused Room query variants

Evidence: `app/src/main/java/dev/narumi/kestrel/core/library/db/LibraryDao.kt:17` declares uncalled `observePlaceLibraryItems`, `observeRouteLibraryItems`, `getStartupLibraryItem`, and `getPendingPlaceUploadRecords`; the startup query duplicates `getLibraryItem` exactly.

- [x] Recheck production/test callers and remove only these four DAO declarations. Acceptance: the used repository/sync entry points remain intact, and no table, entity, converter, migration, or stored value changes.
- [x] Run `just android-build` to validate Room/KSP generation and `just android-test` for regressions. Acceptance: the application and remaining DAO implementations compile, and all JVM tests pass without any device or database operation.

### 10. Complete workspace verification and handoff

- [ ] Run Android gates separately under Java 26: `just android-check`, `just android-lint`, `just android-test`, `just android-ui`, and `just android-build`. Acceptance: every gate passes; screenshot validation does not update references or operate a connected device.
  - Follow-up: formatting, Detekt, resource lint, all 269 JVM tests, and debug build pass. `just android-ui` fails all 31 cases with `ScreenshotImageNotFoundException`. No references were generated or updated; this task remains blocked.
- [x] Run Backend gates under Node.js 22: Prisma client generation, lint, unit tests, mocked e2e, typecheck, and build through the existing recipes/scripts. Inspect test setup first to ensure Prisma remains mocked. Acceptance: every gate passes without migrations or live database writes.
- [x] Run Web gates under Node.js 22: `just web-check`, `just web-lint`, `cd web && npm test`, `just web-typecheck`, and `just web-build`, plus the focused Chrome checks above. Acceptance: every gate passes; existing CSS warnings are recorded and no new warning/regression is introduced. Do not treat `web-verify` as a substitute for `npm test`.
- [x] Review `git diff --check`, the full intended diff, and final Git status; compare API/error shapes, stored values, identity allocation, write/event order, retry counts, and active DOM/focus behavior with characterization evidence. Acceptance: only planned source/tests and this plan change, with no unrelated edits, manifests/lockfiles, schemas/migrations, tracked cache changes, or image binaries.
- [ ] Record each finding's final files and acceptance results, report remaining risks accurately, and archive this completed plan under `docs/plans/archived/` after all checks pass. The index already links to the active plan; archive it and update the index only when every open acceptance task has passing evidence. The current execution authorizes the follow-up commit, push, and pull request, but not deployment or device operations.

## Execution evidence (2026-10-05)

These are historical records from the original execution. References to the branch, staged files, and the preserved root `PLAN.md` describe that execution, not the current checkout. They are not fresh test results for the source review below.

- Base: `5bac5a3`; original `PLAN.md` was untracked and remains untouched. Node `v22.20.0`, Java `26.0.2`, Android SDK at `~/Library/Android/sdk`; locked dependencies already present. `prisma:generate` corrected the initially stale client (Backend lint then passed). The previously reported QR `ECONNRESET` did not reproduce: the unmodified base mocked e2e suite passed 11/11, twice. Historical root cause is unknown.
- Characterization: archived-HEAD source and four updated Backend service suites run against the original code in an isolated `/tmp` fixture (121 tests passed), and against this branch. Chrome 154 DevTools Protocol, isolated local API fixture at 1440×900 light, compared original Web source to this branch. Identical field IDs/classes, Library/Map tag and mode matches/order, empty result and clear-search focus, Map/Library navigation, saved/new inspector, marker and map-click coordinate updates, disclosure, sharing panel, failed save/draft retention, discard, saved feedback, and four map-style choices. No real accounts, backend, databases, devices, or screenshots in Git. Chrome fixture/logs remain outside the repository.
- Backend route creation: `backend/src/library/library-writes.ts`, `library.service.ts`, `sharing.service.ts`, and service specs. Original/updated tests assert sort order, initial revision, normal indices versus stored non-contiguous shared sequences, privacy, events/write order, failures stopping later writes and loaded snapshots.
- Web inspector: `web/components/dashboard/PlaceEditor.tsx`, `web/app/dashboard/map/page.tsx`; unused `web/components/PlaceMapEditor.tsx` removed. Original/current Chrome fixture output matches for active DOM and interactions.
- Android retry: `app/src/main/java/dev/narumi/kestrel/core/cloud/AuthorizedSessionRequest.kt`, both repositories, `AuthorizedSessionRequestTest.kt`. Focused policy and remote-control tests pass; refresh/logout/cancellation/second-failure cases covered.
- Backend recovery: `backend/src/auth/exchange-session-recovery.ts` and spec, OIDC/Android QR service files/specs. Original/current service suites and mocked e2e pass. The original QR recovery response **already** includes internal session fields; characterization preserves its shape, but this pre-existing security exposure needs a separately authorized response-contract review. No new logging or persistence.
- Android mappings and DAO: `LibraryMappers.kt`, `LibraryMapperTest.kt`, `LibraryDao.kt`. Direct read fixtures and focused repository/cloud mapper tests pass; Room/KSP and APK compile.
- Cartographer: four retired components and `createFieldNotebookMapStyle` removed; shared CSS untouched. Chrome original/current Map/Library picker/header, navigation and style menu agree.
- Search: `web/components/dashboard/librarySearch.ts`, `formatMode.ts`, `utils.ts`, Map page, Library catalog and `librarySearch.test.ts`. 33 Web tests plus original/current Chrome matching for tags, mode, whitespace, empty feedback and order.
- Final staged-diff review: `git diff --cached --check` and `git diff --check` are clean. Only the scoped Android/Backend/Web source/tests, this plan and its index entry are staged. `web/tsconfig.tsbuildinfo` was restored after typecheck; no manifest, lockfile, schema, migration, generated assets or binary images are staged. The original untracked `PLAN.md` remains unmodified.
- Final checks (correct runtimes): Android `just android-check`, `just android-lint`, `just android-test`, `just android-build` pass; Backend Prisma generation, lint, 258 unit tests / 25 suites, 11 mocked e2e tests / 4 suites, typecheck and build pass; Web `just web-check`, `just web-lint`, 33 tests, `just web-typecheck`, `just web-build` pass. Web reports the same 44 pre-existing CSS specificity warnings. **Open blocker:** `just android-ui` reports `ScreenshotImageNotFoundException` for all 31 tests: there are no checked-in reference images. Do not generate/stage image binaries or mark this gate passing. No schema/migration or device operation.

## Source review before follow-up (`09cd770`)

Git history and source inspection confirmed that merge `73c13fa` is an ancestor of this revision and that all eight implementations remain present. That review changed documentation only. No application tests, builds, browser checks, database operations, or device operations were run for that review.

### Open acceptance evidence

- The source review reopened route revision-linkage assertions and helper cancellation coverage in steps 2 and 4. The follow-up execution below resolves both gaps with new tests and fresh results.
- Android screenshot comparison remains open. The historical run reported 31 missing-reference failures. The current repository has no tracked reference images, and `.github/workflows/ci.yml` does not run screenshot validation. Its failure-report upload is not validation evidence. Reference images must be made available without staging image binaries before this gate can pass.
- The historical QR-login `ECONNRESET` did not reproduce in the recorded Node.js 22 baseline runs; all 11 mocked e2e tests passed. Its cause remains unknown. Keep the step 1 investigation open; do not claim either a current reproducible code defect or a root-cause fix.
- The final Android gate and archive checklist items remain open. No acceptance criterion was waived, moved to another plan, or marked complete by this review.

### Existing issues requiring separate fix authorization

These issues predate the extraction. Recording them does not authorize source changes or replace any open acceptance task above.

- Android QR recovery returns internal session fields, including `refreshTokenHash`, `rotatedRefreshTokenEncrypted`, and `revokedAt`. `backend/src/android-login/android-login.service.ts:651,674` passes and returns the full record; `android-login.routes.ts:103` serializes it. The test at `android-login.service.spec.ts:364–386` expects that record. A separate fix must project public session fields and test first-exchange/recovery response parity. This review does not establish cross-account access or credential compromise.
- Remote report and ACK callers catch cancellation. In `app/src/main/java/dev/narumi/kestrel/core/cloud/RemoteControlRepository.kt:223–235,245–260`, `runCatching` discards the report failure or reduces the ACK result to `isSuccess`, including `CancellationException`. The shared helper propagates cancellation, but these callers do not explicitly rethrow it. A separate fix needs caller cancellation tests. No device or lifecycle failure was demonstrated by this source review.

## Follow-up execution (2026-11-13)

- Branch: `narumi/test/simplification-verification`, based on `09cd770`, equal to `origin/main` at branch creation. The existing edits to this plan and `docs/plans/README.md` were preserved. Runtimes: Node.js `22.23.4`, Java `26.0.2`; the existing Android SDK provides platform `android-37.0`. Manifests and lockfiles are unchanged.
- Changed tests: `backend/src/library/library.service.spec.ts`, `backend/src/sharing/sharing.service.spec.ts`, and `app/src/test/java/dev/narumi/kestrel/core/cloud/AuthorizedSessionRequestTest.kt`. Production source, API responses, schemas, transactions, stored data, and caller cancellation behavior are unchanged.
- Focused checks: 127 Backend tests in the library, sharing, OIDC, Android-login, and exchange-session-recovery suites pass. Android helper, remote-control, library-mapper, library-repository, and cloud-mapper tests pass. An isolated Backend source copy passes both route-creation cases; each of four linkage mutations makes both cases fail. The repository's production files were not mutated.

| Workspace | Fresh checks | Result |
| --- | --- | --- |
| Android | `just android-check`, `just android-lint`, `just android-resource-lint`, `just android-test`, `just android-build` | Passed; 269 JVM tests across 50 suites, no failures or skipped tests |
| Android screenshots | `just android-ui` | Failed: 31/31 missing-reference errors; no references updated or generated |
| Backend | Prisma generation, lint, unit tests, mocked e2e, typecheck, build through existing recipes | Passed; 509 unit tests / 39 suites and 21 e2e tests / 5 suites |
| Web | `just web-check`, `just web-lint`, `just web-test`, `just web-typecheck`, `just web-build` | Passed; 320 tests; 43 existing CSS warnings and 1 informational diagnostic, no Web source changes |
| Localization | `just i18n-check` | Passed for all 18 Android and Web locales |

- QR investigation: the current Android-login mocked e2e file passed 10 additional runs under Node.js 22 (2 tests per run). The locked Supertest/Superagent versions changed from `7.2.2`/`10.3.0` at the original base to `7.3.1`/`10.4.1` now. Current Supertest has shared-request close tracking and loopback binding, but that difference does not establish the historical failure's cause. The bounded investigation remained inconclusive; step 1 stays open. No assertions were weakened or cases skipped.
- Review: the full test/documentation diff was checked for correctness, security, lifecycle safety, compatibility, regressions, and scope. An independent source review found no new supported defect. No fresh browser or device verification was performed; no Web behavior or production source changed. Local logs and mutation reports are outside the repository at `/private/tmp/kestrel-simplification-verification.OydNyZ/`.
- Completion remains blocked. Supply usable screenshot reference images without committing image binaries, then rerun screenshot validation. Establish the original QR failure's cause from a reproducible case or original diagnostic evidence; repeated current passes do not prove that cause. Keep both unresolved requirements here and keep the follow-up pull request in draft. Do not archive this plan.

## Risks and Recovery

- Shared-route copying must retain stored sequence values, while ordinary route creation assigns indices. Sharing a write workflow must not accidentally share different validation/normalization policies.
- Authentication extractions can alter retries, query timing, fail-closed checks, audit counts, or response projection. Characterize these first and keep protocol-specific boundaries explicit.
- Dead-code findings can become live through parallel work. Recheck all consumers before removal; update evidence rather than blindly applying old line references.
- Live components reuse legacy classes. Removing a source component does not authorize deleting its entire CSS family or rearranging cascade order.
- Baseline lint and Gradle startup completed after Prisma client generation and online Gradle dependency resolution. The historical QR `ECONNRESET` could not be reproduced under Node.js 22. Android screenshot validation remains blocked by missing references; do not count a partial run as passing evidence.
- No schema or data rollback is required. Keep each finding's diff independently reviewable; if validation fails, stop and revise or revert only that refactor after checking for unrelated changes. Never reset the entire worktree or clear application data.

## Completion Checklist

- [x] Backend initial route creation has one write owner; normal/shared sequence rules, privacy, transactions, and event ordering are preserved.
- [x] Web place editing has only its active embedded mode; the unused editor is removed and all active draft/save/share interactions pass.
- [x] Android sync and remote control share one authorized-request retry policy with unchanged session identity, cancellation, and ACK behavior.
- [x] Backend exchange-session credential recovery has one owner while OIDC/QR authorization, derivation, audit, and response boundaries remain distinct.
- [x] Unused reverse Android mappings are removed, and direct tests cover the used read mappings.
- [x] The four unused Cartographer components and style factory are removed without deleting shared live CSS.
- [x] Map and Library share concrete search predicates with unchanged matching results, ordering, and presentation.
- [x] The four unused Room query variants are removed without schema/data changes.
- [ ] Correct-runtime baselines, all affected workspace gates, and focused behavior checks pass with recorded evidence; failed/unavailable tasks have not been silently skipped or moved out of scope.
- [ ] Final diff review is complete, unrelated changes are preserved, no unauthorized external/device/data operation occurred, and the completed plan is archived with its index entry updated.
