# Engineering backlog plan

## Goal

Keep only actionable cross-cutting work in the active backlog. Success means production/release safety and required manual validations are visible, while completed or speculative items stop cluttering active planning.

## Context

Completed since the original backlog:

- CI lanes, path filters, backend `build`, backend e2e policy, and Web lint/typecheck/build are in `.github/workflows/ci.yml`.
- Android app icon, notification copy, route status mode/speed, disabled selected chips, route progress persistence, Web map styles, Web dashboard IA/polish, sharing, and remote control are archived in `docs/plans/archived/`.
- Release builds currently produce an unsigned APK; signing is still intentionally not configured.

## Plan

### Production / release hardening

- [ ] Add a backend health endpoint and Docker Compose backend healthcheck; verify with `cd backend && npm run test && npm run build` plus `docker compose -f compose.deploy.yaml config --quiet`.
- [ ] Add structured backend request/error logging with request id plus safe user/session metadata; verify with backend unit/e2e coverage or a local request log sample that contains no secrets.
- [ ] Write `docs/operations.md` with required deploy secrets, local `.env` guidance, rotation notes, DB backup, and migration rollback; verify against `.github/workflows/deploy.yml` and `compose.deploy.yaml`.
- [ ] Decide API documentation/client policy: generated OpenAPI clients or hand-written DTO rules; verify by either published docs or a short decision record in `docs/operations.md` / `docs/remote-control-api.md`.
- [ ] Establish Android release signing flow with minify still off; verify `just release` produces a signed or explicitly documented unsigned artifact.

### Manual validation

- [ ] Run one non-destructive Android cloud smoke covering production URL alias login (`https://kestrel.narumi.dev`) and `Sync now`; record device, build, and result in `2026-05-13_android-cloud-options-autofill-url-plan.md`.
- [ ] After copying a shared route from the public Web page, run Android `Sync now` and confirm the copied route appears/behaves as a normal owned route; do not use `just reset` / `pm clear`.
- [ ] Run a fresh real-device Go to/Favorites apply smoke after the next substantial map/favorites refactor; this is not needed for docs-only or Web-only work.

### Android maintainability

- [ ] Split `KestrelMap` enough to remove its current `LongMethod` detekt baseline entry; verify with `just check && just lint` and `rg "KestrelMap" detekt-baseline.xml`.
- [ ] Decide whether `MapScreen` drafts (`waypoints` / `speedKmh` / `routeMode`) should survive tab switching; verify by either a short docs note accepting the limitation or a dedicated NavHost/SaveableStateHolder plan.
- [ ] Add emulator/instrumented CI only if a stable, non-destructive service-lifecycle test can run without wiping operator device state.

### Not active until requested

These are intentionally not active tasks: route revision history UI, route generator advanced parameters, per-segment speed/pause playback, jitter simulation, OSRM/GraphHopper on-road routing, zh-TW/ja localization, and Android map style switching. Promote one into its own plan only when there is a concrete user story.

## Risks

- Logging and API docs can leak secrets or freeze unstable APIs if overbuilt; start with minimal safe fields and current endpoints.
- DB backup/rollback docs are easy to write but dangerous if untested; include a restore check when production data exists.
- Instrumented/device tests can wipe app-private state; call out destructive commands before running them.

## Completion Checklist

- [ ] Production deploy has health checks, structured logs, secrets guidance, and DB backup/rollback documentation.
- [ ] API documentation/client policy is implemented or explicitly accepted as hand-written DTOs.
- [ ] Android release artifacts are signed, or unsigned status remains explicitly documented until signing exists.
- [ ] Required Android manual smokes are recorded or explicitly blocked with evidence.
- [ ] Speculative features remain outside active checklists until they have a concrete plan.
