# Engineering backlog plan

## Goal

Consolidate cross-cutting engineering and app-polish work that remains after the completed local library, web console, backend, and Android sync phases.

## Context

This backlog comes from the general TODO and the operations/DX sections of the cloud platform todo. Items here are not required to finish the sharing MVP, but they improve testability, release readiness, maintainability, and user polish.

## Plan

- [x] Add Android GitHub Actions CI for PRs: Android job now runs `just android-check`, `just android-lint`, `:app:assembleDebug`, and unit tests with Gradle cache.
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
- [x] Improve foreground notification title/text and channel description. Completed in `docs/plans/archived/2026-05-23_foreground-notification-copy-plan.md`; verified with stale-copy `rg` check and `just check`.
- [x] Replace default Android Studio app icon with Kestrel adaptive icon assets. Completed in `docs/plans/archived/2026-05-23_android-adaptive-icon-plan.md`; verified with resource inspection, captured icon preview review, `just build`, and `just check`.
- [ ] Add Generate route advanced parameters: starting bearing, turn variance, and optional seed.
- [ ] Add Android route revision history UI only if a concrete product need appears; keep current-revision-only storage/load behavior as the default until that slice is planned.
- [ ] Add per-segment waypoint speed/pause playback once route execution supports waypoint metadata end-to-end, with dedicated `MovementEngine`/service tests.
- [ ] Split `MapScreen` and `KestrelMap` long composables enough to remove corresponding detekt baseline entries.
- [ ] Establish release build/proguard flow: first signed release with minify off, then staged R8 enablement.
- [ ] Add map style toggle for OSM raster and project light/dark styles.
- [ ] Plan on-road movement using OSRM/GraphHopper public API without offline routing.
- [ ] Add zh-TW and ja string resources after UI strings stabilize.
- [ ] Add instrumented CI tests for emulator service lifecycle and startup mode apply behavior.
- [ ] Run a fresh real-device smoke for Go to/Favorites apply behavior after the next substantial map/favorites refactor, since the baseline quick-jump/favorites slice is otherwise complete and current cleanup was verified only by `just check` / `just lint`.
- [ ] Show current mode + speed numerically in `MapScreen` status row while a route is playing; today it only shows `Route playing` + waypoint count, so operators can't tell at a glance which mode/speed the restored route is in. Surfaced by `2026-05-11_route-ui-state-restore-plan.md` smoke results.
- [ ] Run an Android `Sync now` smoke after copying a shared route from the public web page, and confirm the copied route appears/behaves as a normal owned route on device. Moved out of `docs/plans/archived/2026-05-13_sharing-plan.md` so the shipped sharing slice can close while keeping one Android end-to-end proof item tracked.
- [ ] Make `ChipChoice` with `enabled = false && selected = true` visually distinct (reduced-alpha `primaryContainer` or outline); today `AssistChip` disabled colors mask the selected state so running-route mode/speed chips all look identical grey. Surfaced by `2026-05-11_route-ui-state-restore-plan.md` smoke results.
- [ ] Decide whether `MapScreen` drafts (`waypoints` / `speedKmh` / `routeMode`) should survive tab switching. Today `rememberSaveable` survives config change but not tab switch, because `NavigationSuiteScaffold` is not backed by a `SaveableStateHolder`. Either document the limitation or migrate tab navigation to a `NavHost` backstack in a dedicated plan. Surfaced by `2026-05-11_route-ui-state-restore-plan.md` smoke results.

## Risks

- CI can be blocked by local/project Java assumptions; use Linux CI paths and avoid macOS-specific `JAVA_HOME` assumptions.
- API docs/client generation should not freeze unstable sharing/remote-command APIs too early.
- On-road routing adds external service reliability and rate-limit concerns; keep it separate from core mock playback.

## Completion Checklist

- [x] Android, backend, and web CI run on PRs and block broken formatting/lint/builds.
- [ ] Production deploy has documented secrets, health checks, and DB backup/rollback procedures.
- [ ] API documentation/client strategy is implemented or explicitly accepted as hand-written.
- [x] App polish items that affect first impressions are done: notification wording and app icon; verified by archived notification/icon plans plus `just check`.
- [ ] Large optional features remain separated into dedicated plans before implementation.
