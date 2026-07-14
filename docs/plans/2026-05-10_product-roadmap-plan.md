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

- [ ] Harden production operations and Android releases through the concrete health, logging, operations, and signing tasks in `2026-05-10_engineering-backlog-plan.md`; verify with that plan's completion evidence.
- [ ] Complete the production URL and copied-shared-route Android cloud smokes in `2026-05-10_engineering-backlog-plan.md`; verify with recorded real-device evidence.

## Risks

- Sharing and remote control expand the security surface; keep opt-in, same-user ownership checks, expiry, audit, bounded polling, and the cancellation boundary documented in `docs/device-session-security.md`.
- Route payload compatibility can break Android sync if richer waypoint metadata lands without versioned tests.
- Production deploy safety now matters more than feature breadth; do ops/release hardening before larger product bets.

## Completion Checklist

- [x] The implemented Android, backend, Web, sync, sharing, remote-control, and device/session security baseline is recorded in this plan's Context and linked archived plans.
- [ ] Production operations and Android release hardening are verified in `2026-05-10_engineering-backlog-plan.md`.
- [ ] Both remaining Android cloud smokes pass or have concrete external-blocker evidence in `2026-05-10_engineering-backlog-plan.md`.
