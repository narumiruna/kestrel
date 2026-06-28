## Goal

Consolidate local Docker development and browser-test Compose setup into one `compose.dev.yaml`, and seed the dev backend with a password-only `admin` account plus sample Places and Routes for Chrome DevTools / Playwright debugging.

## Context

Current local Compose files split dev hot reload (`compose.yaml`) from production-like browser testing (`compose.webtest.yaml`). Both are dev-only and duplicate Postgres/backend/web wiring. `compose.deploy.yaml` remains the production deploy file and is out of scope.

## Plan

- [x] Create `compose.dev.yaml` with two profiles: a watch profile matching current `compose.yaml` hot reload behavior, and an image profile matching current `compose.webtest.yaml` built-image behavior; verified with `docker compose -f compose.dev.yaml --profile watch config --quiet` and `docker compose -f compose.dev.yaml --profile image config --quiet`.
- [x] Add an idempotent backend dev seed script that only runs when explicitly enabled, creates/resets `admin` with password-only login, and upserts sample places/routes; verified with `cd backend && npm run test -- dev-seed.spec.ts` plus API login/listing smoke on `localhost:3401`.
- [x] Update local commands (`justfile`, backend package DB helpers) to use `compose.dev.yaml`, and remove the replaced dev/webtest Compose files; verified by `git status --short` showing deleted old files and updated command files.
- [x] Run the smallest quality gates and a browser-test stack smoke using the new file; verified with `just web-check`, backend lint/type/test, and `KESTREL_DEV_WEB_PORT=3401 KESTREL_DEV_BACKEND_PORT=3400 KESTREL_DEV_POSTGRES_PORT=15433 docker compose -f compose.dev.yaml --profile image up -d --build`.

## Completion Checklist

- [x] `compose.dev.yaml` can start watch and image dev modes, verified by Compose config and an image-mode smoke.
- [x] Dev startup seeds `admin` / `admin` without OTP plus sample places/routes, verified by API login and `/places` `/routes` responses (`3` places, `2` routes).
- [x] `compose.yaml` and `compose.webtest.yaml` are replaced by `compose.dev.yaml`, and `justfile` recipes use the new file.
- [x] Quality gates pass: `just web-check`, `cd backend && npm run lint`, `cd backend && npm run test -- dev-seed.spec.ts`, and `cd backend && npm run typecheck`.
