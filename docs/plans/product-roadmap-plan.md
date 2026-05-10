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
- [ ] Implement route sharing as the next product slice: public latest route links and copy-to-library.
- [ ] Implement sync/upload strengthening: local-only upload, remote-id binding after upload, and documented conflict policy.
- [ ] Implement device/session management: device state reporting, session/device list, and revoke controls.
- [ ] Design remote command model only after device/session management exists and has an explicit threat model.
- [ ] Harden operations: secrets management, DB backup/rollback, backend/web CI, structured logging, health/metrics, and API docs/client generation.

## Risks

- Sharing and remote control expand the security surface; threat modeling must precede public links or commands.
- Cloud-first sync plus local-only items can create duplicate-looking entries until upload/conflict policy is explicit.
- Route payload compatibility can break Android sync if versioning is not documented before richer waypoint metadata lands.

## Completion Checklist

- [x] Product roadmap reflects the implemented Android, backend, web, and sync baseline from the consolidated legacy planning docs.
- [ ] `sharing-plan.md` is completed and merged for public latest route links and copy-to-library.
- [ ] Local-only upload/conflict policy has an accepted plan and implementation PRs.
- [ ] Device/session management has an accepted plan before remote commands are designed.
- [ ] Operations checklist has CI, logging, health, backup, and API documentation coverage.
