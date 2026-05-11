# Engineering backlog plan

## Goal

Consolidate cross-cutting engineering and app-polish work that remains after the completed local library, web console, backend, and Android sync phases.

## Context

This backlog comes from the general TODO and the operations/DX sections of the cloud platform todo. Items here are not required to finish the sharing MVP, but they improve testability, release readiness, maintainability, and user polish.

## Plan

- [ ] Add Android GitHub Actions CI for PRs: `just check`, `just lint`, and `:app:assembleDebug`, with Gradle cache.
- [x] Add backend CI for test, lint, and typecheck.
- [x] Add web CI for lint/typecheck/build.
- [x] Add `paths:` filter (or `dorny/paths-filter`) to `.github/workflows/ci.yml` so `android`, `backend`, and `web` jobs only run when their respective workspace files change. Surfaced by PR #58 review.
- [x] Add an optional `nest build` step to the `backend` CI job to catch `nest-cli.json` / asset-copy regressions that `typecheck` misses. Surfaced by PR #58 review.
- [x] Decide policy for promoting backend `test:e2e` into CI (separate job with Postgres service vs. nightly vs. keep local-only). Surfaced by PR #58 review. Decided: promote to existing `backend` job because specs use `overrideProvider(PrismaService)` and need no Postgres.
- [ ] Add API structured logging with request id, auth user/session metadata where safe, and error classification.
- [ ] Add API metrics and health checks suitable for Docker/production monitoring.
- [ ] Write secrets management strategy for deploy: required env vars, rotation, and local `.env` guidance.
- [ ] Write DB backup and migration rollback strategy for production PostgreSQL.
- [ ] Generate or publish OpenAPI docs for auth/library/sync/sharing APIs.
- [ ] Decide client generation strategy: TypeScript generated client, Kotlin generated client, or documented hand-written client rules.
- [ ] Add Android jitter option for mock samples: configurable lat/lng and speed perturbation, default off, with `MovementEngine`/service tests where possible.
- [ ] Improve foreground notification title/text and channel description.
- [ ] Replace default Android Studio app icon with Kestrel adaptive icon assets.
- [ ] Add Generate route advanced parameters: starting bearing, turn variance, and optional seed.
- [ ] Split `MapScreen` and `KestrelMap` long composables enough to remove corresponding detekt baseline entries.
- [ ] Establish release build/proguard flow: first signed release with minify off, then staged R8 enablement.
- [ ] Add map style toggle for OSM raster and project light/dark styles.
- [ ] Plan on-road movement using OSRM/GraphHopper public API without offline routing.
- [ ] Add zh-TW and ja string resources after UI strings stabilize.
- [ ] Add instrumented CI tests for emulator service lifecycle and startup mode apply behavior.
- [ ] Show current mode + speed numerically in `MapScreen` status row while a route is playing; today it only shows `Route playing` + waypoint count, so operators can't tell at a glance which mode/speed the restored route is in. Surfaced by `2026-05-11_route-ui-state-restore-plan.md` smoke results.
- [ ] Make `ChipChoice` with `enabled = false && selected = true` visually distinct (reduced-alpha `primaryContainer` or outline); today `AssistChip` disabled colors mask the selected state so running-route mode/speed chips all look identical grey. Surfaced by `2026-05-11_route-ui-state-restore-plan.md` smoke results.
- [ ] Decide whether `MapScreen` drafts (`waypoints` / `speedKmh` / `routeMode`) should survive tab switching. Today `rememberSaveable` survives config change but not tab switch, because `NavigationSuiteScaffold` is not backed by a `SaveableStateHolder`. Either document the limitation or migrate tab navigation to a `NavHost` backstack in a dedicated plan. Surfaced by `2026-05-11_route-ui-state-restore-plan.md` smoke results.

## Risks

- CI can be blocked by local/project Java assumptions; use Linux CI paths and avoid macOS-specific `JAVA_HOME` assumptions.
- API docs/client generation should not freeze unstable sharing/remote-command APIs too early.
- On-road routing adds external service reliability and rate-limit concerns; keep it separate from core mock playback.

## Completion Checklist

- [ ] Android, backend, and web CI run on PRs and block broken formatting/lint/builds.
- [ ] Production deploy has documented secrets, health checks, and DB backup/rollback procedures.
- [ ] API documentation/client strategy is implemented or explicitly accepted as hand-written.
- [ ] App polish items that affect first impressions are done: notification wording and app icon.
- [ ] Large optional features remain separated into dedicated plans before implementation.
