# Product roadmap plan

## Goal

Keep Kestrel focused as an Android mock-location app with a cloud library and opt-in Web remote control. Success means the shipped product baseline is clear and the remaining active work is limited to release safety and required cloud validation.

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
- Do not add administrator/cross-user session controls, permanent device blocking, remote wipe, or background push wake-up.

## Plan

- [x] Harden production operations and Android releases through the concrete health, logging, operations, and signing tasks in `2026-05-10_engineering-backlog-plan.md`; verified by its isolated deploy/restore evidence, successful production deploy run `29342918346`, production `/health`, and signed `v0.6.1` release run `29342929175`.
- [x] Complete the production URL and copied-shared-route Android cloud smokes in `2026-05-10_engineering-backlog-plan.md`; verified 2026-07-15 on a moto g34 5G by recorded real-device login/sync and shared-route sync/playback evidence.

## Risks

- Sharing and remote control expand the security surface; keep opt-in, same-user ownership checks, expiry, audit, bounded polling, and the cancellation boundary documented in `docs/device-session-security.md`.
- Route payload compatibility can break Android sync if richer waypoint metadata lands without versioned tests.
- Production deploy safety now matters more than feature breadth; do ops/release hardening before larger product bets.

## Completion Checklist

- [x] The implemented Android, backend, Web, sync, sharing, remote-control, and device/session security baseline is recorded in this plan's Context and linked archived plans.
- [x] Production operations and Android release hardening are verified in `2026-05-10_engineering-backlog-plan.md` by local quality gates, isolated deploy/restore checks, production deploy health, and the signed GitHub release.
- [x] Both remaining Android cloud smokes passed and are recorded with device/build evidence in `2026-05-10_engineering-backlog-plan.md`.
