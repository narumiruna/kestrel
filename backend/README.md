# Kestrel Cloud Backend

Hono + Prisma backend workspace for the location/route sync platform described in `docs/plans/2026-05-10_product-roadmap-plan.md`.

## Included foundation

- Hono API workspace under `backend/`
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
- `KESTREL_PUBLIC_URL`: public Web origin with no path, query, or fragment; OIDC callbacks and Android QR login derive fixed paths from it
- `AUTH_ANDROID_QR_LOGIN_SECRET`: optional dedicated 32-byte base64 or 64-character hex secret; set it with `KESTREL_PUBLIC_URL` to enable Android QR login
- `AUTH_OIDC_ISSUER`, `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET`, `AUTH_OIDC_FLOW_ENCRYPTION_KEY`, `KESTREL_PUBLIC_URL`: optional generic OIDC configuration; set all values to enable it (`AUTH_OIDC_DISPLAY_NAME` is optional)
- `AUTH_OIDC_DISPLAY_NAME`: optional provider label shown by clients (defaults to `OpenID Connect`)
- `AUTH_OIDC_FLOW_ENCRYPTION_KEY`: separate 32-byte base64 or 64-character hex key for short-lived OIDC state and exchange recovery

See [`docs/oidc.md`](../docs/oidc.md) for OIDC client setup and account-mapping rules.

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
npm run typecheck
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

### `federated_identities` and `oidc_login_attempts`

- Immutable provider `issuer + sub` mappings to Kestrel users
- Authenticated-encrypted stateless PKCE authorization state, one-time hashed exchange tickets, and deterministic same-client retry recovery without persisted raw session credentials

### `android_login_attempts`

- Short-lived owner/origin-session binding, hashed QR secret, Android verifier challenge, bounded device metadata, and monotonic approval/consumption timestamps
- Exchange-session linkage for retry-safe recovery without storing the raw QR secret, verifier, or session credentials

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
- `GET /auth/methods`: public availability of optional sign-in methods
- `POST /auth/oidc/start`: create a Web/Android OIDC authorization request
- `GET /auth/oidc/callback`: verify OIDC and redirect with a one-time exchange ticket
- `POST /auth/oidc/exchange`: consume the client-bound ticket → normal Kestrel session
- `POST /auth/android-login-attempts`: recently authenticated Web session creates a five-minute Android QR login attempt
- `GET /auth/android-login-attempts/:attemptId`, `POST .../approve`, `POST .../deny`: originating Web session inspects and controls its attempt
- `POST /auth/android-login-attempts/:attemptId/claim`, `POST .../exchange`: Android binds a verifier, polls for approval, and receives a normal independent session
- `POST /auth/refresh`: refresh token rotation + new short-lived access token; retrying the immediately previous token within 20 minutes returns the same encrypted-at-rest successor, while reuse after that window revokes the session
- `POST /auth/session/revoke`: revoke the current session using `Authorization: Bearer <access_token>`

See [`docs/android-qr-login-api.md`](../docs/android-qr-login-api.md) for the QR payload/API contract and [`docs/device-session-security.md`](../docs/device-session-security.md) for its threat model.
