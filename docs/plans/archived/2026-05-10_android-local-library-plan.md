# Android local library plan

## Goal

Document the completed Android local-library migration and keep only the remaining follow-ups that build on the Room-backed cloud-shaped domain.

## Context

The original phase replaced DataStore `Favorite(name as id)` storage with Room-backed `Place`, `Route`, `RouteRevision`, `Waypoint`, `LibraryItem`, and `SyncState` rows. UI flows now use `LibraryRepository` and stable item ids. Legacy DataStore favorites JSON has been removed after migration stabilized.

## Non-Goals

- Do not reintroduce `Favorite.name` as an identity key.
- Do not add full Android route revision history UI in this baseline plan.
- Do not add per-segment speed/pause playback in this baseline plan.

## Plan

- [x] Create Room schema, DAO, entity/domain mappers, and repository for local library items.
- [x] Migrate DataStore favorites to Room while preserving point/route content, sort order, last-used timestamps, and startup favorite references.
- [x] Move Save point, Save route, Go to, Favorites, and Startup flows to `LibraryRepository` and stable `libraryItemId` identity.
- [x] Preserve current UX: Points/Routes tabs, recent/manual sorting, rename/edit/delete/apply-now, and route playback from current revision waypoints.
- [x] Remove legacy DataStore favorites JSON and migration-only code paths after stabilization.
- [x] Add remote-id columns and lookup helpers used by Android cloud sync.
- [x] Add dirty/local-only upload state transitions for local places that should be pushed to cloud; place upload + manual conflict resolution shipped end-to-end across PRs #46–#49 under `2026-05-10_android-local-upload-conflict-plan.md`.
- [x] Keep complete route revision history loading out of the baseline local-library slice; future history UI follow-up is tracked in `2026-05-10_engineering-backlog-plan.md`.
- [x] Keep per-segment speed/pause playback out of the baseline local-library slice; waypoint-metadata playback follow-up is tracked in `2026-05-10_engineering-backlog-plan.md`.

## Risks

- Dirty/local-only upload can conflict with cloud-first sync semantics if conflict policy is not documented first.
- Full revision history can increase local DB size and complicate pruning; Android should keep current-revision-only until a user-facing history need exists.
- Per-segment playback changes `MovementEngine` behavior and needs dedicated tests.

## Completion Checklist

- [x] Room-backed library is the canonical Android local library storage.
- [x] UI no longer reads or mutates legacy DataStore favorites.
- [x] Startup favorite references use `libraryItemId` rather than name identity.
- [x] Remote-id binding exists for synced cloud rows.
- [x] Dirty/local-only upload behavior is planned and implemented for places; outbox source-of-truth, conflict UI/actions, and real-device smoke all landed via PRs #46–#49 under `2026-05-10_android-local-upload-conflict-plan.md`. Remaining automated-test proof stays tracked in that plan's Completion Checklist rather than blocking this baseline local-library plan.
- [x] Route revision history and per-segment playback remain explicit follow-ups, verified by the dedicated backlog items in `2026-05-10_engineering-backlog-plan.md`.
