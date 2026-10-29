# Kestrel operations

## Production deployment

Production deploys run `.github/workflows/deploy.yml` on the self-hosted runner and use `compose.yaml`. Do not deploy with `compose.dev.yaml`; its bind mounts and watch processes are development-only.

Required GitHub Actions secrets (`AUTH_OIDC_FLOW_ENCRYPTION_KEY` and `AUTH_OIDC_CLIENT_SECRET` are required only when OIDC is enabled; `AUTH_ANDROID_QR_LOGIN_SECRET` is required while Android QR login creation is enabled or existing attempts are draining; `ENCRYPTION_KEY` is required for AI credential methods):

| Secret                          | Purpose                                                             | Rotation impact                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POSTGRES_USER`                 | PostgreSQL application/backup role                                  | Update PostgreSQL and deploy configuration together.                                                                                                                                 |
| `POSTGRES_PASSWORD`             | PostgreSQL role password                                            | Rotate in PostgreSQL first, then update the secret and redeploy.                                                                                                                     |
| `AUTH_ACCESS_TOKEN_SECRET`      | HMAC access-token signing                                           | Existing short-lived access tokens stop working; refresh sessions can obtain replacements.                                                                                           |
| `AUTH_ANDROID_QR_LOGIN_SECRET`  | Matching-code and retry-safe Android QR exchange derivation         | In-flight attempts and their bounded exchange recovery fail; completed sessions are unaffected. Drain creation and wait at least 25 minutes before removing or rotating it.        |
| `AUTH_OIDC_FLOW_ENCRYPTION_KEY` | Encrypts short-lived OIDC authorization state and exchange recovery | In-flight OIDC logins fail; existing sessions are unaffected. Configure only with all OIDC values.                                                                                   |
| `AUTH_OIDC_CLIENT_SECRET`       | OIDC confidential-client secret                                     | In-flight/new OIDC logins fail until both sides use the new secret.                                                                                                                  |
| `AUTH_TOTP_ENCRYPTION_KEY`      | Encrypts stored TOTP secrets                                        | Do not replace directly. Re-encrypt every stored TOTP secret during a maintenance migration, then update the secret.                                                                 |
| `ENCRYPTION_KEY`                | Encrypts stored AI credentials and authorization interaction data   | Keep the current key value when renaming the variable. Key rotation requires the maintenance procedure in [`ai-provider-settings.md`](ai-provider-settings.md).                       |
| `PAT_TOKEN`                     | Allows version/tag workflows to trigger follow-up workflows         | Replace with a token that can write repository contents and workflows.                                                                                                               |

`POSTGRES_DB` is optional and defaults to `kestrel`. Generic OIDC is optional and disabled unless every required value is configured. Android QR login is independently optional and disabled unless both `AUTH_ANDROID_QR_LOGIN_SECRET` and a valid `KESTREL_PUBLIC_URL` are present. Store the QR and OIDC secrets as GitHub Actions secrets; store `KESTREL_PUBLIC_URL`, `AUTH_ANDROID_QR_LOGIN_CREATION_ENABLED`, the issuer, client ID, and optional display name as repository variables listed here and in [`oidc.md`](oidc.md). The creation flag defaults to `true`; setting it to `false` hides method discovery and rejects new QR attempts without disabling claim/exchange for attempts being drained. `KESTREL_PUBLIC_URL` must be the HTTPS Web origin only; Kestrel derives the QR path at `/login/android` and Android always derives the Backend at `/api/backend`. Loopback HTTP is development-only. No deployment-specific auth value has a repository fallback. The workflow passes deployment values to Compose only through the deploy step's process environment, explicitly disables dotenv input, validates the Compose model, and then deploys production images.

Generate a dedicated QR secret without reusing access-token, TOTP, or OIDC keys:

```bash
openssl rand -base64 32
```

Before enabling it, apply source-aware ingress limits to `POST /api/backend/auth/android-login-attempts/:attemptId/claim` and `/exchange`. Do not log request bodies, fragments, or query strings. The application additionally caps all unexpired attempt rows, including denied replacements, before rendering a QR code; enforces five-minute creation expiry and a minimum five-second exchange poll interval; and returns `Retry-After`. Ingress controls remain required for volumetric abuse. Monitor `android_qr_create`, `android_qr_claim`, `android_qr_approve`, `android_qr_deny`, `android_qr_expire`, and `android_qr_exchange` audit outcomes without collecting QR secrets or exact payloads.

After deployment, verify readiness and request correlation:

```bash
curl -fsS -D /tmp/kestrel-health.headers https://kestrel.narumi.dev/api/backend/health
rg -i '^x-request-id:' /tmp/kestrel-health.headers
```

The backend healthcheck queries PostgreSQL before returning `200`.
Web startup waits for this check.

## Route assistant operations

The screenshot assistant uses the requesting user's saved image-capable chat configuration. There is no shared provider key, provider approval gate, routing/search supplier, or image-free fallback. See the [API contract](route-assistant-api.md), [user guide](web-cloud-guide.md#suggest-a-path-from-a-screenshot), and [source evidence](route-assistant-source-terms.md).

### Ingress and streaming

These are deployment requirements, not a claim that a live ingress was configured or tested:

- Bound assistant JSON uploads to **4 MiB** at ingress. Route creation/update accepts **256 KiB** so full-precision 1000-point paths remain saveable; other Backend bodies retain the existing 100 KiB limit. The Next.js proxy and Backend also count actual body chunks, including requests without a trusted `Content-Length`, before complete buffering/parsing. Keep those application limits; ingress limits do not replace them.
- Permit the **90-second** run and upload/setup overhead through every timeout hop. Forward NDJSON incrementally without response buffering or transformation. Preserve `Cache-Control: no-store, no-transform` and `X-Accel-Buffering: no`; the latter is a hint, not proof of proxy behavior.
- Propagate downstream abort to the Backend fetch and local worker. Test explicit Stop, dropped connections, timeout, and incomplete streams. Do not automatically retry POST after an ambiguous paid request.
- Keep Authorization in headers, not URLs. Remove request bodies, query strings, images/base64, prompts, geometry, conversion metadata, provider arguments, raw errors, and thinking from ingress, application, tracing, and telemetry logs. Collect only bounded status/error codes and operational metadata.

No reverse-proxy configuration is in this repository. Deployed edge/proxy-hop settings and evidence are not available locally. Local proxy fixtures cannot prove deployed upload bounds, streaming, timeout, abort behavior, or edge log policy. The deployment owner must inspect each actual hop and verify it after explicit authorization; do not claim deployment or live proxy verification from local results.

### Process and recovery limits

Production uses `compose.yaml`, with one Backend process. Assistant rate/concurrency/recent-ID controls are in-memory **per process**, not distributed: 4 starts/minute/user, 1 active run/user, 4 active runs total, and 256 recent run IDs retained for up to 10 minutes. Do not scale Backend replicas and assume these are fleet-wide limits. Restart clears these counters as well as active runs; it does not resume inference.

Each run is limited to 90 seconds, 4 model turns, 16,384 total output tokens, 8 tools, and 3 candidates. The short-lived inference worker receives resolved user credentials in a cleared environment with fixed SDK safeguards and only required user cloud configuration. It does not inherit host provider keys, profiles, metadata credentials, proxy settings, or endpoint overrides. Bedrock uses the user's regional endpoint with one SDK attempt; Vertex requires an explicit key, not an ADC placeholder. Final provider payloads are capped after SDK thinking-budget expansion. This is not an operating-system sandbox. Production worker resource limits are 128 MiB old generation, 16 MiB young generation, and 4 MiB stack; source-mode fixtures use 256 MiB old generation. These are worker runtime limits, not a container memory quota or a guarantee about all native allocations. Compose does not define an assistant-specific resource reservation.

Stop new runs before maintenance. Abort active work and clear unaccepted candidate/image state without deleting drafts, routes, or personal AI connections. Review expires 10 minutes after capture. Images/prompts/proposals are not stored in the database; reload/restart cannot recover chat or background work. Existing manual Save alone persists approved geometry. Saved geometry remains usable without AI; retain source attribution. No route-schema migration is introduced by this feature.

Cancellation and worker termination do not prove upstream provider cancellation, deletion, or a refund. Provider charges and retention can continue after Stop, stream loss, disconnect, or process restart. There is no automatic paid retry, resume, exactly-once billing, or provider-refund guarantee. Do not replay a lost request automatically.

Only OSM-based captures are enabled. Esri satellite capture remains disabled until the source/account owner obtains unresolved transfer/derived-output permission and resolves attribution. Keep OSM image and application credit after Apply/Save, including Android's native attribution and public/API consumers. No provider approval gate is required for a user's otherwise supported personal model.

### Local verification and external evidence

Use deterministic tiles, fake multimodal providers, and transient test state. `npm run test:ai:integration` runs registry/auth isolation, bounded image/tool loops, final provider-payload limits, file/endpoint/retry controls, and source/compiled worker fixtures under Node.js 22; `backend/test/route-assistant-browser.fixture.cjs` and `scripts/verify-route-assistant-browser.mjs` support local browser verification through Chrome DevTools. These fixtures are **local development verification, not deployment configuration**. Never expose fixture endpoints publicly or copy their test authentication into production. Keep screenshots outside the repository.

Required coding checks remain mandatory: Backend validation/PNG/conversion/ownership/run tests, Web lifecycle/proxy tests, fake-provider and browser fixtures, and affected lint, typecheck, test, and build gates. Include body-size rejection through actual chunks, missing/invalid images, settings/auth changes, stale generations, Save races, explicit Stop, no automatic retry, source credit, and no sensitive context leakage. Fixture success does not prove live model quality, provider billing/retention, deployed ingress, or physical-device behavior.

Source-owner permission actions, live inference/account changes, deployment/proxy inspection, and device checks require separate owner authorization. Record these as unverified until evidence exists. They do not block local coding or replace mandatory fixture checks. Do not mark the active plan complete on this documentation's authority; its owner records acceptance evidence.

## Logging

The backend logs with [pino](https://getpino.io) and writes one NDJSON line per event to stdout, so `docker compose logs` and any log collector can parse it without a second pass.
Every line carries `time` (ISO 8601), `level` (`debug`, `info`, `warn`, `error`, `fatal`), `service`, the emitting `context` (for example `HttpRequest`, `AuthService`, `Prisma`), and `msg`.

The backend reads `LOG_LEVEL` and defaults to `info`; an unrecognized value falls back to `info`, and the test environment is silent.
Both Compose files map `KESTREL_LOG_LEVEL` onto the container's `LOG_LEVEL`, defaulting to `info` in `compose.yaml` and `debug` in `compose.dev.yaml`.
Set `LOG_LEVEL` directly when the backend runs outside Compose.

Read the stream locally by piping it through the pretty printer:

```bash
docker compose -f compose.yaml logs -f backend | npx pino-pretty
```

`npm run start:pretty` runs the dev server through the pretty printer.
The `start` and `start:dev` scripts stay unpiped so a crash keeps the Node process exit code, which the dev Compose stack relies on.

### What may be logged

Request logs under the `HttpRequest` context contain only method, path without query parameters, status, duration, request ID, and authenticated user/session IDs.
They must never include authorization headers, request bodies, query strings, credentials, refresh tokens, TOTP codes, or location payloads.

Auth events are mirrored from the audit table to stdout under the `AuthAuditService` context with event, outcome, auth method, failure reason, and user/session IDs.
Username, IP address, and user agent stay in the database and must not reach the log stream.
Rate-limit logs report the limit type and attempt count without the blocked subject.

Unhandled errors are logged under `HttpException` with the request ID, so a failing response can be traced back to its request log line.
The logger also censors password/session fields plus OIDC authorization codes, client nonces, exchange tickets, and ID tokens as a backstop; that redaction is a safety net, not a licence to pass those values to a log call.

## Local environment

Copy `.env.example` to the ignored `.env` file and restrict it before adding non-development values:

```bash
cp .env.example .env
chmod 600 .env
```

The defaults in `compose.dev.yaml` are only for local development. Never reuse its database password, access-token secret, or TOTP encryption key in production. QR login remains off by default. To test it locally, set disposable values before starting the stack, then confirm `GET /auth/methods` reports `androidQrLogin.enabled=true`:

```bash
export KESTREL_PUBLIC_URL=http://localhost:3301
export AUTH_ANDROID_QR_LOGIN_SECRET="$(openssl rand -base64 32)"
just cloud-up
curl -fsS http://localhost:3300/auth/methods
```

Start and stop the live-reload stack with `just cloud-up` and `just cloud-down`.

## Database backup and bounded restore check

Create a custom-format backup before schema migrations, credential-key migrations, or risky deploys. The command reads database values from `.env` through Compose and does not place the password in the archive name or process arguments:

```bash
umask 077
backup="kestrel-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file .env -f compose.yaml exec -T postgres \
  sh -c 'pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  > "$backup"
test -s "$backup"
docker compose --env-file .env -f compose.yaml exec -T postgres \
  pg_restore --list < "$backup" >/dev/null
```

A backup is not accepted until this bounded restore drill succeeds against an isolated database on the same PostgreSQL version. It does not alter the production database:

```bash
restore_db="kestrel_restore_check_$(date -u +%Y%m%d%H%M%S)"
docker compose --env-file .env -f compose.yaml exec -T postgres \
  sh -c 'createdb --username="$POSTGRES_USER" "$1"' sh "$restore_db"
docker compose --env-file .env -f compose.yaml exec -T postgres \
  sh -c 'pg_restore --exit-on-error --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$1"' sh "$restore_db" \
  < "$backup"
docker compose --env-file .env -f compose.yaml exec -T postgres \
  sh -c 'psql --username="$POSTGRES_USER" --dbname="$1" --tuples-only --command="SELECT COUNT(*) FROM _prisma_migrations;"' sh "$restore_db"
docker compose --env-file .env -f compose.yaml exec -T postgres \
  sh -c 'dropdb --username="$POSTGRES_USER" "$1"' sh "$restore_db"
```

If any restore command fails, retain the archive, remove the isolated database with `dropdb --if-exists`, and investigate before deploying.

## Migration rollback and recovery

Prisma migrations have no automatic down migration. Before `prisma migrate deploy`, retain both a verified database backup and the previously deployed Git revision/image.

If a migration or application deploy fails:

1. Stop Web/backend traffic while keeping PostgreSQL available.
2. Capture a failure-time backup for diagnosis; do not overwrite the pre-deploy archive.
3. Restore the verified pre-deploy archive into an isolated database and confirm it opens.
4. Recreate the production database from that archive only after confirming the rollback data-loss window.
5. Deploy the previous known-good Git revision/images.
6. Run `/health`, login, library read, and sync smoke checks before reopening traffic.

Use `prisma migrate resolve --rolled-back <migration>` only for a failed migration whose database changes were manually reversed and reviewed. It is not a substitute for restoring a backup.

For an Android QR login feature rollback, keep `AUTH_ANDROID_QR_LOGIN_SECRET` configured and set the repository variable `AUTH_ANDROID_QR_LOGIN_CREATION_ENABLED=false`, then deploy the current Backend. Verify `GET /auth/methods` reports `androidQrLogin.enabled=false` and authenticated creation returns `503`, while claim/exchange routes remain available. Record when creation was disabled and wait at least 25 minutes: up to five minutes for the last issued attempt plus the twenty-minute consumed-exchange recovery window. Only after that drain may you remove or rotate the secret and roll back Web/Android entry points and Backend routes. Existing QR-created sessions are ordinary sessions and must remain refreshable and revocable. The additive `android_login_attempts` table may remain until a later reviewed migration; do not delete completed Android sessions. Restore from the verified backup rather than editing an applied migration if the schema deployment itself must be reversed.

## Android release signing

Release signing uses one long-lived upload keystore. Back up the keystore and alias/password recovery material in separate encrypted offline locations; losing it prevents future GitHub releases from updating installed copies.

Repository secrets required by `.github/workflows/release.yml`:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_STORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

For a local signed build, point Gradle at the same keystore without committing credentials:

```bash
export KESTREL_RELEASE_KEYSTORE_PATH="$HOME/.config/kestrel/release.jks"
export KESTREL_RELEASE_STORE_PASSWORD="$(security find-generic-password -w -s dev.narumi.kestrel.release-store)"
export KESTREL_RELEASE_KEY_ALIAS="kestrel-release"
export KESTREL_RELEASE_KEY_PASSWORD="$(security find-generic-password -w -s dev.narumi.kestrel.release-key)"
just release
apksigner="$(find "$HOME/Library/Android/sdk/build-tools" -type f -name apksigner | sort -V | tail -1)"
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  "$apksigner" verify --verbose --print-certs app/build/outputs/apk/release/app-release.apk
```

Gradle rejects release builds when signing variables are absent, preventing accidental publication of an unsigned APK. When the certificate changes, update `web/public/.well-known/assetlinks.json` with the SHA-256 certificate fingerprint and verify the deployed file before releasing.
