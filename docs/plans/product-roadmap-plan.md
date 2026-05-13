# Product roadmap plan

## Goal

Keep Kestrel focused as an Android mock-location app with a cloud library: Web edits places/routes, Android syncs and executes them, and future work can add sharing, device state, and remote control without reworking the domain model.

## Context

Kestrel now has these completed foundations:

- Android mock location, route playback, random route generation, MapLibre UI, Favorites/Go to, Room-backed cloud-shaped library.
- NestJS + PostgreSQL + Prisma backend with username/password + TOTP auth, library CRUD, sync bootstrap/changes, and auth/session infrastructure.
- Next.js web console for auth and place/route editing.
- Android cloud login and sync, including cursor recovery and current revision route execution.

The remaining roadmap should not reopen completed local-library or cloud-sync foundations except for explicit follow-ups.

## Non-Goals

- Do not bypass Play Integrity / SafetyNet.
- Do not introduce a second map backend; MapLibre remains the map implementation.
- Do not add GPS track recording or GPX/KML import/export.
- Do not merge web and backend codebases in this roadmap; same-origin proxying/deploy entrypoint work is separate.

## Plan

- [x] Establish Android mock-location MVP: single point, route playback, random route generation, startup behavior, foreground service, and MapLibre UI.
- [x] Replace local `Favorite(name as id)` storage with Room-backed `Place / Route / RouteRevision / Waypoint / LibraryItem` domain.
- [x] Build cloud auth and library APIs with TOTP, refresh sessions, owner-scoped CRUD, immutable route revisions, and sync events.
- [x] Build web console login and place/route editing workflows.
- [x] Build Android cloud login, sync bootstrap/changes, cursor recovery, and current-revision route execution.
- [x] Implement route sharing as the next product slice: backend/web implementation for public latest route links and copy-to-library landed under `docs/plans/archived/2026-05-13_sharing-plan.md` on 2026-05-13, including share-link CRUD, public route page, authenticated copy-to-library, a successful dev-DB migration run for `20260513110000_sharing_links`, a browser smoke run for create-link → public page → sign-in → copy, and the post-PR follow-up fixes archived under `docs/plans/archived/2026-05-13_sharing-followups-plan.md`. Remaining Android end-to-end proof was moved to `engineering-backlog-plan.md` as a separate follow-up.
- [ ] Implement sync/upload strengthening: local-only place upload, remote-id binding after upload, item-level manual conflict resolution, and `Use Cloud` / `Use Local` / `Keep Both` actions all shipped end-to-end and verified on a real-device smoke run (`2026-05-10_android-local-upload-conflict-plan.md`, PRs #46–#49). Remaining work is automated test coverage (backend `LibraryItem.version` bump tests, `/sync/upload` partial-success + idempotency reuse tests, conflict variants, and Android `CloudSyncRepository` local-only upload tests); route upload/conflict is still deferred.
- [ ] Implement device/session management: device state reporting, session/device list, and revoke controls.
- [ ] Design remote command model only after device/session management exists and has an explicit threat model.
- [ ] Harden operations: secrets management, DB backup/rollback, backend/web CI, structured logging, health/metrics, and API docs/client generation.

## Risks

- Sharing and remote control expand the security surface; threat modeling must precede public links or commands.
- Cloud-first sync plus local-only items can create duplicate-looking entries until upload/conflict policy is explicit.
- Route payload compatibility can break Android sync if versioning is not documented before richer waypoint metadata lands.

## Completion Checklist

- [x] Product roadmap reflects the implemented Android, backend, web, and sync baseline from the consolidated legacy planning docs.
- [x] `docs/plans/archived/2026-05-13_sharing-plan.md` implementation is landed locally for public latest route links and copy-to-library, with backend/web validation, the dev-DB migration run, browser smoke evidence recorded on 2026-05-13, and follow-up correctness fixes archived under `docs/plans/archived/2026-05-13_sharing-followups-plan.md`.
- [ ] Local-only upload/conflict policy has an accepted plan and implementation PRs; place-first work is in `2026-05-10_android-local-upload-conflict-plan.md`, with implementation shipped across PRs #46–#48, smoke closed by PR #49, and remaining completion pending the backend / Android automated tests listed in that plan's Completion Checklist.
- [ ] Device/session management has an accepted plan before remote commands are designed.
- [ ] Operations checklist has CI, logging, health, backup, and API documentation coverage.
