# Product roadmap plan

## Goal

Keep Kestrel focused as an Android mock-location app with a cloud library and opt-in Web remote control. Success means the roadmap reflects shipped foundations, keeps security-sensitive work explicit, and only promotes future features when there is a concrete user need.

## Context

Completed foundations:

- Android mock location, route playback, random route generation, MapLibre UI, Favorites/Go to, Room-backed library, startup behavior, and route progress restore.
- NestJS + PostgreSQL + Prisma backend with auth/TOTP, sessions, library CRUD, sync bootstrap/changes, sharing, and remote-control command queue.
- Next.js web console with Map/Library dashboard, place/route editing, sharing/copy-to-library, map styles, and compact Device/Share actions.
- Android cloud login/sync, local-only place upload/conflict resolution, current-revision route execution, and opt-in Web remote command polling.

## Non-Goals

- Do not bypass Play Integrity / SafetyNet.
- Do not introduce a second map backend; MapLibre remains the map implementation.
- Do not add GPS track recording or GPX/KML import/export.
- Do not add broad device/session administration until there is a user story beyond remote-control device selection.

## Plan

- [x] Establish Android mock-location MVP: single point, route playback, random route generation, startup behavior, foreground service, and MapLibre UI.
- [x] Replace local `Favorite(name as id)` storage with Room-backed `Place / Route / RouteRevision / Waypoint / LibraryItem` domain.
- [x] Build cloud auth and library APIs with TOTP, refresh sessions, owner-scoped CRUD, immutable route revisions, and sync events.
- [x] Build web console login and place/route editing workflows, then evolve it into the Map/Library dashboard.
- [x] Build Android cloud login, sync bootstrap/changes, cursor recovery, and current-revision route execution.
- [x] Implement public route/place sharing and authenticated copy-to-library; archived under `docs/plans/archived/2026-05-13_sharing-plan.md`, `2026-05-13_sharing-followups-plan.md`, and `2026-05-16_web-place-sharing-plan.md`.
- [x] Implement place-first upload/conflict strengthening; archived under `docs/plans/archived/2026-05-10_android-local-upload-conflict-plan.md`.
- [x] Implement opt-in Web remote control: backend command queue, Android polling/executor, Web Device actions, and physical smoke coverage; archived under `docs/plans/archived/2026-06-20_web-remote-mock-control-plan.md` and its slice plans.
- [ ] Harden production operations: health checks, structured logging, secrets guidance, DB backup/rollback, and release signing; track concrete tasks in `2026-05-10_engineering-backlog-plan.md`.
- [ ] Finish the remaining Android cloud manual smokes: production URL alias login + `Sync now`, and copied shared route syncing to Android; track in `2026-05-13_android-cloud-options-autofill-url-plan.md` and `2026-05-10_engineering-backlog-plan.md`.
- [ ] Pick the next product feature only from observed need; current candidates stay out of active scope until requested: route revision browsing, richer per-waypoint playback, on-road routing, jitter simulation, localization, and full session management.

## Risks

- Sharing and remote control expand the security surface; keep opt-in, same-user ownership checks, expiry, audit, and bounded polling.
- Route payload compatibility can break Android sync if richer waypoint metadata lands without versioned tests.
- Production deploy safety now matters more than feature breadth; do ops/release hardening before larger product bets.

## Completion Checklist

- [x] Roadmap reflects the implemented Android, backend, web, sync, sharing, and remote-control baseline.
- [ ] Production operations and release hardening have an accepted, verified slice in `2026-05-10_engineering-backlog-plan.md`.
- [ ] Remaining Android cloud manual smokes are either passed and archived, or explicitly marked blocked with device/environment evidence.
- [ ] Any new large product feature has its own focused plan before implementation.
