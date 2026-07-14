# Engineering backlog plan

## Goal

Keep only actionable cross-cutting work in the active backlog. Success means production/release safety and required manual validations are visible, while completed or speculative items stop cluttering active planning.

## Context

Completed since the original backlog:

- CI lanes, path filters, backend `build`, backend e2e policy, and Web lint/typecheck/build are in `.github/workflows/ci.yml`.
- Android app icon, notification copy, route status mode/speed, disabled selected chips, route progress persistence, Web map styles, Web dashboard IA/polish, sharing, and remote control are archived in `docs/plans/archived/`.
- Release builds now require the configured release keystore and produce a signed APK; unsigned release builds fail explicitly.

## Plan

### Production / release hardening

- [x] Add a backend health endpoint and Docker Compose backend healthcheck so deploy startup depends on backend readiness rather than `service_started`; verified 2026-07-14 by backend unit/e2e/lint/typecheck/build, both Compose config checks, and an isolated deploy stack where backend became healthy before Web started.
- [x] Add structured backend request/error logging with request id plus safe user/session metadata; verified 2026-07-14 by middleware/e2e tests and an isolated deploy request whose JSON log contained the request ID but excluded query values, auth secrets, and database credentials.
- [x] Write `docs/operations.md` with required deploy secrets, local `.env` guidance, rotation notes, DB backup/restore, and migration rollback; verified 2026-07-14 against the workflows/Compose config and by restoring a custom-format backup into an isolated database containing all 12 Prisma migrations, then dropping it.
- [x] Establish Android release signing while keeping minify off, update the release workflow and Digital Asset Links fingerprint, and verify `just release` plus the GitHub workflow produce an installable signed artifact; verified 2026-07-14/15 with local `just release` + `apksigner` (RSA 4096, v2, SHA-256 `24:6F:…:50:FD`), successful GitHub Release run `29342929175`, published `v0.6.1` asset `kestrel-0.6.1-release.apk`, and the matching fingerprint deployed in `/.well-known/assetlinks.json`.

### Manual validation

- [x] Run one non-destructive real-device Android cloud smoke covering production URL alias login (`https://kestrel.narumi.dev`) and `Sync now`; passed 2026-07-15 on motorola moto g34 5G, Android 15 (API 35), Kestrel 0.6.0 (versionCode 14): the alias signed in without `/api/backend`, `Sync now` reported `Sync complete`, and no reset, clear, install, or instrumentation command was used.
- [x] Copy a shared route from the public Web page, run Android `Sync now`, and confirm it appears and runs as a normal owned route; passed 2026-07-15 on motorola moto g34 5G, Android 15 (API 35), Kestrel 0.6.0 (versionCode 14): Web reported `Copied as Shared Android smoke 1784042392716`, Android reported `Sync complete`, the route appeared under Favorites → Routes as 2 waypoints / 7 km/h / Loop, and playback entered `Route playing` before the test route was stopped. Browser evidence: `/share/[token]` at the default desktop viewport, screenshot `pi-chrome-devtools-screenshot-19b97545-c7a5-47dc-a5f8-f3e9aa61b934.png`. No app data was cleared.

### Android maintainability

- [x] Split `KestrelMap` enough to remove its `LongMethod` detekt baseline entry; verified 2026-07-14 with `just android-check`, `just android-lint`, `just android-test`, `just android-build`, and `rg "KestrelMap" detekt-baseline.xml` returning no match.

## Risks

- Structured logs can leak credentials, tokens, or precise location data; keep fields allowlisted and test redaction.
- DB backup/rollback documentation is unsafe if it describes an unverified restore path; include a bounded restore check.
- Real-device validation must preserve app-private state; do not uninstall, clear data, or run connected instrumentation as setup.

## Completion Checklist

- [x] Production deploy readiness is verified by backend health checks, structured safe logs, and tested operations guidance; an isolated `compose.deploy.yaml` stack and bounded 12-migration restore drill passed on 2026-07-14.
- [x] Android GitHub release artifacts are signed and installable, verified by local certificate inspection and successful GitHub Release run `29342929175`, which built, verified, and published the signed `v0.6.1` APK.
- [x] Both Android cloud smokes are recorded with device/build evidence: production alias login/sync and Web-copy → Android sync/playback passed on the moto g34 5G without clearing app data on 2026-07-15.
- [x] `KestrelMap` no longer has a `LongMethod` baseline entry, verified by passing Android formatting, detekt, unit-test, and debug-build gates plus a baseline search with no match on 2026-07-14.
