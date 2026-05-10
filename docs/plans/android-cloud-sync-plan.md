# Android cloud sync plan

## Goal

Document the completed Android cloud sync baseline and keep follow-up work focused on upload/conflict/device-state behavior rather than basic login/bootstrap polling.

## Context

Android can sign in with username/password + TOTP or recovery code, store session data using Keystore-backed encryption, sync cloud library data into Room, recover from expired/ahead cursors by bootstrapping, and execute cloud route current revision snapshots.

## Non-Goals

- Do not upload local-only items in the completed baseline.
- Do not add realtime command or remote control in the completed baseline.
- Do not implement conflict resolution UI until upload semantics are defined.

## Plan

- [x] Add `core/cloud` models, session store, API client, auth repository, and sync repository.
- [x] Add Options UI for API base URL, login/logout, refresh, sync now, last synced at, and last sync error.
- [x] Implement auth endpoints for login, refresh, and revoke.
- [x] Implement sync bootstrap to upsert cloud places, routes, current revisions, waypoints, library items, sync cursor, and user id.
- [x] Implement changes polling for upserts, deletions, cursor storage, and foreground/manual refresh.
- [x] Recover from `SYNC_CURSOR_EXPIRED` and `since cursor is ahead of server state` by clearing only the sync cursor and bootstrapping.
- [x] Ensure route application uses Room current revision snapshot waypoints and route-level speed/mode.
- [x] Define local-only upload policy, including when to prompt, how to bind remote ids, and how to represent dirty/deleted states; place-first implementation is tracked in `2026-05-10_android-local-upload-conflict-plan.md` and PR #46.
- [x] Define conflict policy: cloud wins, local dirty upload, and any manual resolution cases; manual item-level conflict resolution remains in `2026-05-10_android-local-upload-conflict-plan.md`.
- [ ] Add device state reporting once device/session management has a concrete product slice.

## Risks

- Local-only upload without conflict policy can duplicate or overwrite routes unexpectedly.
- Retaining synced cache after logout is useful offline but can confuse account switching; bootstrap already clears old synced rows when user id changes.
- Manual API base URL entry is flexible but easy to misconfigure; deploy documentation should keep the `/api/backend` same-origin proxy path clear.

## Completion Checklist

- [x] Android login works against cloud auth.
- [x] Refresh token/session storage is Keystore-backed.
- [x] Bootstrap and changes sync web-created places/routes into Room.
- [x] Cursor expired/ahead conditions recover without clearing all app data.
- [x] Cloud routes execute using current revision snapshots.
- [ ] Upload/conflict/device-state follow-ups have separate accepted plans before implementation; place upload/conflict is active in `2026-05-10_android-local-upload-conflict-plan.md`, while device state remains unplanned.
