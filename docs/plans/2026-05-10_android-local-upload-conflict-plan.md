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
- [x] Update Android local place mutations so local-only place delete hard-deletes, while synced place rename/edit/delete sets entity `syncStatus` to `Dirty` or `Deleted`; implemented in PR #46, but `pending_sync_changes` is not yet the payload source of truth and repository unit tests are still needed.
- [x] Extend `CloudApiClient` with `/sync/upload` request/response models for place create/update/delete and per-item `clientMutationId`; verified in PR #46 with `just build`.
- [x] Update `CloudSyncRepository` to run pull/upload/pull-confirm and to persist uploaded remote ids/versions back into existing local rows without changing local ids; implemented in PR #46, with sync repository tests for local-only place upload still needed.
- [x] Implement conflict detection for dirty/deleted place changes when backend reports a newer `LibraryItem.version`; persist `sync_conflicts` with local/cloud snapshots and base/remote versions; implemented in PR #46, with richer JSON snapshots and update-vs-update/delete-vs-update tests still needed.
- [ ] Make `pending_sync_changes` the upload payload source of truth instead of deriving upload changes from current entity state; verify with DAO/repository tests that dirty state and outbox rows update atomically.
- [ ] Add Options → Cloud sync conflict UI showing pending place conflicts and actions `Use Cloud`, `Use Local`, and `Keep Both`; verify with Compose preview/smoke test and manual user acceptance.
- [ ] Implement conflict actions: `Use Cloud` applies cloud snapshot and clears outbox/conflict, `Use Local` retries upload with the local snapshot and current expected version, and `Keep Both` keeps cloud on the original synced item while duplicating local snapshot as a new local-only place; verify with repository/sync tests.
- [ ] Keep `lastUsedAt` and reorder best-effort outside conflict handling; verify existing touch/reorder behavior still works after sync changes with targeted tests or manual smoke test.
- [x] Update `android-local-library-plan.md`, `android-cloud-sync-plan.md`, and `product-roadmap-plan.md` checklists to point to this plan and mark place upload/conflict as the active first slice; verified by docs diff in PR #46 follow-up.
- [ ] Run full validation: `just check`, `just lint`, backend test/lint commands, and one Android real-device smoke test for local place create → foreground/manual sync → cloud visibility → conflict resolution.
  - PR #46 validation so far: `just check`, `just lint`, `just build`, `cd backend && npm run lint`, and `cd backend && npm run build` pass.
  - `cd backend && npm test -- --runInBand` has one failing auth guard spec (`session is no longer active`) while all other suites pass; resolve or confirm pre-existing before merging.

## Risks

- Adding aggregate versioning can miss changes if backend code updates place/route rows without bumping `LibraryItem.version`; tests must cover every versioned mutation path.
- Hybrid outbox state can drift from entity `syncStatus`; repository mutations and sync resolution must update both in one Room transaction.
- `POST /sync/upload` duplicates some CRUD semantics; backend service code should share validation/mapping where practical.
- Conflict UI in Options is discoverable enough for the first slice but may need Favorites badges later.

## Rollback / Recovery

- Backend migration must be backward-compatible by giving existing library items an initial version, e.g. `1`.
- If upload fails after rollout, Android should keep outbox rows and local dirty/deleted state for retry rather than dropping local changes.
- If `/sync/upload` is disabled or unavailable, cloud-to-Android sync should continue to work and local edits should remain pending.
- Idempotent upload retries must prevent duplicate cloud places after network failures.

## Completion Checklist

- [ ] Local-only Android places upload to cloud and bind returned `remoteId`/version to the existing local rows, verified by automated tests and an Android smoke test.
- [ ] Synced Android place rename/coordinate edit/delete syncs to cloud through `/sync/upload`, verified by backend and Android tests.
- [ ] Web/cloud concurrent edits produce persisted item-level Android conflicts, verified by conflict tests and manual UI acceptance.
- [ ] `Use Cloud`, `Use Local`, and `Keep Both` resolve place conflicts without losing local or cloud snapshots, verified by tests and smoke test.
- [ ] Retry after upload response loss does not duplicate cloud places, verified by idempotency tests.
- [ ] Route upload/conflict remains explicitly deferred to a follow-up plan or unchecked roadmap item, verified by docs update.
