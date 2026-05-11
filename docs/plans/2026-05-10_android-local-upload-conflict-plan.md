# Android local upload and manual conflict plan

## Goal

Let Android upload locally-created and locally-edited library places to the cloud, detect item-level conflicts against web/cloud changes, and let the user resolve conflicts manually without losing local work. The first implementation slice is place-only end-to-end; routes are planned as a follow-up after the sync state machine is proven.

## Context

Android already stores local library data in Room with local UUID ids, nullable `remoteId` fields, and `SyncStatus { LocalOnly, Synced, Dirty, Deleted }`. Cloud sync currently supports login, bootstrap, changes polling, cursor recovery, and cloud-to-Android upserts/deletions. Backend already has authenticated place/route CRUD and sync event streams, but Android does not yet upload local changes.

Local ids and cloud ids remain separate identities: Android keeps local UUIDs stable for UI/Room relations, and writes backend UUIDs into `remoteId` after successful upload.

## Architecture

- Use item-level manual conflict, not field-level merge.
- Add backend `LibraryItem.version` as the aggregate version for conflict detection.
- Treat content edits and deletes as versioned changes; keep usage/order metadata best-effort.
- Add `POST /sync/upload` as a sync-specific batch endpoint with per-item atomicity.
- Use per-item `clientMutationId` idempotency for upload changes.
- Use Android hybrid outbox state:
  - entity `syncStatus` remains a UI/cache summary;
  - `pending_sync_changes` is the source of upload payload truth;
  - `sync_conflicts` persists manual conflicts across app restarts.
- Sync pipeline:
  1. pull remote changes;
  2. classify local pending changes against remote versions;
  3. upload safe pending changes through `/sync/upload`;
  4. pull confirmation/generated sync events.

## Non-Goals

- Do not implement route upload/conflict resolution in the first slice.
- Do not implement field-level merge or three-way merge UI.
- Do not make `lastUsedAt`, reorder/sort order, or future pinned state trigger manual conflicts in the first slice.
- Do not collapse local ids and cloud ids into one identity.

## Plan

- [x] Add backend `LibraryItem.version` with a Prisma migration and map it in library/sync DTOs; verified in PR #46 with `cd backend && npm run build` and `cd backend && npm run lint`.
- [x] Update backend place create/update/delete flows to bump `LibraryItem.version` for rename, coordinate/content edits, and soft delete; implemented in PR #46, with dedicated version increment tests still needed.
- [x] Add backend sync upload models and `POST /sync/upload` for place create/update/delete changes, with per-item transactions and response buckets `uploaded`, `conflicts`, and `failed`; implemented in PR #46, with partial-success tests still needed.
- [x] Add backend idempotency storage keyed by `(userId, clientMutationId)` with request hash and stored result; implemented in PR #46, with retry/reuse tests still needed.
- [x] Add Android Room migrations for `pending_sync_changes` and `sync_conflicts`, plus any local remote-version fields needed to store the last synced `LibraryItem.version`; verified in PR #46 with `just build`, `just check`, and `just lint`.
- [x] Update Android local place mutations so local-only place delete hard-deletes, while synced place rename/edit/delete sets entity `syncStatus` to `Dirty` or `Deleted`; implemented in PR #46 (with `pending_sync_changes` becoming the payload source of truth in PR #47), repository unit tests still needed.
- [x] Extend `CloudApiClient` with `/sync/upload` request/response models for place create/update/delete and per-item `clientMutationId`; verified in PR #46 with `just build`.
- [x] Update `CloudSyncRepository` to run pull/upload/pull-confirm and to persist uploaded remote ids/versions back into existing local rows without changing local ids; implemented in PR #46, with sync repository tests for local-only place upload still needed.
- [x] Implement conflict detection for dirty/deleted place changes when backend reports a newer `LibraryItem.version`; persist `sync_conflicts` with local/cloud snapshots and base/remote versions; implemented in PR #46, with richer JSON snapshots and update-vs-update/delete-vs-update tests still needed.
- [x] Make `pending_sync_changes` the upload payload source of truth instead of deriving upload changes from current entity state; implemented by writing place snapshots from local mutations and uploading decoded outbox payloads, verified with `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:testDebugUnitTest`, `just check`, and `just lint`.
- [x] Add Options → Cloud sync conflict UI showing pending place conflicts and actions `Use Cloud`, `Use Local`, and `Keep Both`; implemented with an Options preview and verified with `just check`, `just lint`, and `:app:testDebugUnitTest`; manual user acceptance still needed.
- [x] Implement conflict actions: `Use Cloud` applies cloud snapshot and clears outbox/conflict, `Use Local` retries upload with the local snapshot and current expected version, and `Keep Both` keeps cloud on the original synced item while duplicating local snapshot as a new local-only place; verified with `just check`, `just lint`, and `:app:testDebugUnitTest`; richer repository/sync tests still needed.
- [x] Keep `lastUsedAt` and reorder best-effort outside conflict handling; existing touch/reorder unit tests still pass after sync changes with `:app:testDebugUnitTest`.
- [x] Update `android-local-library-plan.md`, `android-cloud-sync-plan.md`, and `product-roadmap-plan.md` checklists to point to this plan and mark place upload/conflict as the active first slice; verified by docs diff in PR #46 follow-up.
- [ ] Run full validation: `just check`, `just lint`, backend test/lint commands, and one Android real-device smoke test for local place create → foreground/manual sync → cloud visibility → conflict resolution. See **Validation runbook** below for the exact step sequence.
  - 2026-05-11 Android validation: `just check`, `just lint`, `just build`, and `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:testDebugUnitTest` pass; backend commands and real-device conflict smoke still pending.
  - PR #46 validation so far: `just check`, `just lint`, `just build`, `cd backend && npm run lint`, and `cd backend && npm run build` pass.
  - 2026-05-11 backend validation: `cd backend && npm run lint`, `cd backend && npm run build`, and `cd backend && npm test -- --runInBand` all pass after fixing the time-bomb `session-auth.guard.spec.ts` (used a fixed past `expiresAt`) in PR #49; now uses `jest.useFakeTimers()` + `setSystemTime`.

## Risks

- Adding aggregate versioning can miss changes if backend code updates place/route rows without bumping `LibraryItem.version`; tests must cover every versioned mutation path.
- Hybrid outbox state can drift from entity `syncStatus`; repository mutations and sync resolution must update both in one Room transaction.
- `POST /sync/upload` duplicates some CRUD semantics; backend service code should share validation/mapping where practical.
- Conflict UI in Options is discoverable enough for the first slice but may need Favorites badges later.

## Validation runbook

Run these on the macOS dev machine (this is where `java_home` in `justfile` points and where `adb` is installed). The WSL Linux side cannot run Android Gradle, and `backend/node_modules` there is owned by root, so backend commands also belong here.

1. Android static checks + unit tests:
   - `just check`
   - `just lint`
   - `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:testDebugUnitTest`
2. Backend lint/build/tests:
   - `cd backend && npm run lint`
   - `cd backend && npm run build`
   - `cd backend && npm test -- --runInBand`
3. Real-device smoke test (one Android device with mock-location selected as this app):
   - Sign in to cloud account A.
   - Create a local-only place on Android → trigger `Sync now` → confirm it appears on the web for account A with the same name/coords.
   - From the web, rename that place; from Android (without syncing yet), also rename it to a different name → `Sync now` → confirm a conflict row appears under Options → Cloud sync.
   - Exercise all three conflict actions on separate conflicts: `Use Cloud`, `Use Local`, `Keep Both`. Verify each post-condition:
     - `Use Cloud`: local row matches cloud snapshot; outbox + conflict cleared.
     - `Use Local`: cloud place ends up matching the local snapshot; conflict cleared.
     - `Keep Both`: original synced place keeps cloud snapshot; a new local-only place with the local snapshot exists on Android.
   - Force-quit the app mid-upload (airplane mode toggle) and re-sync to confirm no duplicate cloud places (idempotency).
4. Record the run date + commit hash and tick the matching Completion Checklist items.

## Rollback / Recovery

- Backend migration must be backward-compatible by giving existing library items an initial version, e.g. `1`.
- If upload fails after rollout, Android should keep outbox rows and local dirty/deleted state for retry rather than dropping local changes.
- If `/sync/upload` is disabled or unavailable, cloud-to-Android sync should continue to work and local edits should remain pending.
- Idempotent upload retries must prevent duplicate cloud places after network failures.

## Completion Checklist

- [ ] Local-only Android places upload to cloud and bind returned `remoteId`/version to the existing local rows, verified by automated tests and an Android smoke test. _Implementation landed in PR #46; awaiting sync repository tests for local-only place upload and step 3 smoke test._
- [ ] Synced Android place rename/coordinate edit/delete syncs to cloud through `/sync/upload`, verified by backend and Android tests. _Backend + Android implementation landed; backend version-bump and partial-success tests still needed (runbook step 2)._
- [ ] Web/cloud concurrent edits produce persisted item-level Android conflicts, verified by conflict tests and manual UI acceptance. _Detection + persistence implemented; richer update-vs-update / delete-vs-update tests and manual UI acceptance pending (runbook step 3)._
- [ ] `Use Cloud`, `Use Local`, and `Keep Both` resolve place conflicts without losing local or cloud snapshots, verified by tests and smoke test. _Actions implemented and covered by `:app:testDebugUnitTest`; richer repository/sync tests and smoke test pending._
- [ ] Retry after upload response loss does not duplicate cloud places, verified by idempotency tests. _Backend idempotency storage keyed by `(userId, clientMutationId)` implemented; retry/reuse tests and runbook step 3 airplane-mode check pending._
- [x] Route upload/conflict remains explicitly deferred to a follow-up plan or unchecked roadmap item, verified by docs update. _`product-roadmap-plan.md`, `android-local-library-plan.md`, and `android-cloud-sync-plan.md` already point at this plan as the place-only first slice._
