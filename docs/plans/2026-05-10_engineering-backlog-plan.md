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

- [ ] Add a backend health endpoint and Docker Compose backend healthcheck so deploy startup depends on backend readiness rather than `service_started`; verify with `cd backend && npm run test && npm run build` plus `docker compose -f compose.deploy.yaml config --quiet`.
- [ ] Add structured backend request/error logging with request id plus safe user/session metadata; verify with backend unit/e2e coverage or a local request log sample that contains no secrets.
- [ ] Write `docs/operations.md` with required deploy secrets, local `.env` guidance, rotation notes, DB backup/restore, and migration rollback; verify against `.github/workflows/deploy.yml` and `compose.deploy.yaml` and include one bounded restore check.
- [ ] Establish Android release signing while keeping minify off, update the release workflow and Digital Asset Links fingerprint, and verify `just release` plus the GitHub workflow produce an installable signed artifact.

### Manual validation

- [ ] Run one non-destructive real-device Android cloud smoke covering production URL alias login (`https://kestrel.narumi.dev`) and `Sync now`; record device, Android/app version, and result in this item without using `just reset` / `pm clear`.
- [ ] Copy a shared route from the public Web page, run Android `Sync now`, and confirm it appears and runs as a normal owned route; record device, Android/app version, and result in this item without clearing app data.

### Android maintainability

- [ ] Split `KestrelMap` enough to remove its current `LongMethod` detekt baseline entry; verify with `just check && just lint` and `rg "KestrelMap" detekt-baseline.xml` returning no match.

## Risks

- Structured logs can leak credentials, tokens, or precise location data; keep fields allowlisted and test redaction.
- DB backup/rollback documentation is unsafe if it describes an unverified restore path; include a bounded restore check.
- Real-device validation must preserve app-private state; do not uninstall, clear data, or run connected instrumentation as setup.

## Completion Checklist

- [ ] Production deploy readiness is verified by backend health checks, structured safe logs, and tested operations guidance.
- [ ] Android GitHub release artifacts are signed and installable, verified by the release build/workflow and certificate inspection.
- [ ] Both Android cloud smokes are recorded with device/build evidence or explicitly blocked by an external dependency.
- [ ] `KestrelMap` no longer has a `LongMethod` baseline entry, verified by Android quality gates and baseline search.
