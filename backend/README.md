# Kestrel Cloud Backend

NestJS + Prisma backend workspace for the location/route sync platform described in `docs/plans/product-roadmap-plan.md`.

## Included foundation

- NestJS API workspace under `backend/`
- PostgreSQL local development setup with Docker Compose
- Prisma schema and initial migration for the `users` table
- Basic service metadata endpoint at `GET /`

## Environment

Copy the example file and adjust values if needed:

```bash
cp .env.example .env
```

Default local database URL:

```bash
postgresql://kestrel:kestrel@localhost:15432/kestrel_cloud?schema=public
```

Additional auth settings:

- `AUTH_ACCESS_TOKEN_SECRET`: secret used to sign short-lived access tokens
- `AUTH_ACCESS_TOKEN_TTL_SECONDS`: optional access token lifetime in seconds (defaults to 900)
- `AUTH_RATE_LIMIT_MAX_ATTEMPTS`: optional max failed password/TOTP/recovery-code attempts per window (defaults to 5)
- `AUTH_RATE_LIMIT_WINDOW_SECONDS`: optional rate-limit counting window in seconds (defaults to 900)
- `AUTH_RATE_LIMIT_BLOCK_SECONDS`: optional temporary block duration in seconds after hitting the limit (defaults to 900)
- `AUTH_TOTP_ENCRYPTION_KEY`: 32-byte key encoded as base64 (or 64-char hex) for encrypting stored TOTP secrets
- `AUTH_TOTP_ISSUER`: optional otpauth issuer label shown in authenticator apps

## Local development

```bash
npm install
npm run db:up
npm run prisma:migrate:dev
npm run prisma:generate
npm run start:dev
```

The API will start on `http://localhost:3300`.

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

## Current auth schema scope

The current migrations establish the core Phase 1 auth tables:

### `users`

- `id`
- `username`
- `password_hash`
- `totp_secret_encrypted`
- `totp_enabled_at`
- `created_at`
- `updated_at`

### `recovery_codes`

- `id`
- `user_id`
- `code_hash`
- `used_at`
- `created_at`

### `sessions`

- `id`
- `user_id`
- `refresh_token_hash`
- `expires_at`
- `revoked_at`
- `last_used_at`
- `created_at`

### `auth_rate_limits`

- `id`
- `type`
- `subject`
- `attempts`
- `window_started_at`
- `blocked_until`
- `created_at`
- `updated_at`

### `auth_audit_logs`

- `id`
- `event`
- `outcome`
- `auth_method`
- `failure_reason`
- `username`
- `user_id`
- `session_id`
- `ip_address`
- `user_agent`
- `created_at`

## Auth endpoints

- `POST /auth/login`: username/password + TOTP or recovery code → access token + refresh token + session
- `POST /auth/refresh`: refresh token rotation + new short-lived access token
- `POST /auth/session/revoke`: revoke the current session using `Authorization: Bearer <access_token>`
