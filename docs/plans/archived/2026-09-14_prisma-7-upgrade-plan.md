# Prisma 7 upgrade plan

## Goal

Upgrade the Backend Prisma CLI and client from 6.19.3 to 7.10.0 while preserving PostgreSQL runtime behavior and passing the Backend checks.

## Plan

- [x] Update `backend/package.json` and `backend/package-lock.json` to Prisma 7.10.0; verify with `npm ls @prisma/client prisma --depth=0`.
- [x] Move the CLI datasource URL to `backend/prisma.config.ts`, add the PostgreSQL driver adapter, and update Prisma Client construction; `npm run prisma:generate` passes.
- [x] Run Backend lint, unit tests, end-to-end tests, typecheck, and build; all checks pass.

## Risks

- Prisma 7 requires a PostgreSQL driver adapter and changes connection-pool ownership to `pg`; validation must cover both generated types and runtime-facing tests.
- This upgrade changes tooling and client setup only. It must not modify the database schema or existing migrations.

## Completion Checklist

- [x] Both Prisma packages resolve to 7.10.0.
- [x] Prisma Client generation succeeds without changing the database schema or migrations.
- [x] All required Backend checks pass.
- [x] Move this completed plan to `docs/plans/archived/`.
