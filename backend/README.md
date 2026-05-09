# Kestrel Cloud Backend

NestJS + Prisma backend workspace for the location/route sync platform described in `docs/plan/location-route-sync-platform.md`.

## Included foundation

- NestJS API workspace under `backend/`
- PostgreSQL local development setup with Docker Compose
- Prisma schema and initial migration for the `users` table
- Basic health endpoint at `GET /`

## Environment

Copy the example file and adjust values if needed:

```bash
cp .env.example .env
```

Default local database URL:

```bash
postgresql://kestrel:kestrel@localhost:5432/kestrel_cloud?schema=public
```

## Local development

```bash
npm install
npm run db:up
npm run prisma:migrate:dev
npm run prisma:generate
npm run start:dev
```

The API will start on `http://localhost:3000`.

## Validation

```bash
npm run lint
npm run test
npm run test:e2e
npm run build
```

## Database utilities

```bash
npm run db:down
npm run prisma:studio
npm run prisma:migrate:deploy
```

## Initial schema scope

The first migration only establishes the `users` table required for Phase 1 auth work:

- `id`
- `username`
- `password_hash`
- `totp_secret_encrypted`
- `totp_enabled_at`
- `created_at`
- `updated_at`
