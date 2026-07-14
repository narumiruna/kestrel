# Kestrel operations

## Production deployment

Production deploys run `.github/workflows/deploy.yml` on the self-hosted runner and use `compose.deploy.yaml`. Do not deploy with `compose.dev.yaml`; its bind mounts and watch processes are development-only.

Required GitHub Actions secrets:

| Secret | Purpose | Rotation impact |
| --- | --- | --- |
| `POSTGRES_USER` | PostgreSQL application/backup role | Update PostgreSQL and deploy configuration together. |
| `POSTGRES_PASSWORD` | PostgreSQL role password | Rotate in PostgreSQL first, then update the secret and redeploy. |
| `AUTH_ACCESS_TOKEN_SECRET` | HMAC access-token signing | Existing short-lived access tokens stop working; refresh sessions can obtain replacements. |
| `AUTH_TOTP_ENCRYPTION_KEY` | Encrypts stored TOTP secrets | Do not replace directly. Re-encrypt every stored TOTP secret during a maintenance migration, then update the secret. |
| `PAT_TOKEN` | Allows version/tag workflows to trigger follow-up workflows | Replace with a token that can write repository contents and workflows. |

`POSTGRES_DB` is optional and defaults to `kestrel`. The workflow writes a mode-`0600` temporary `.env`, validates the Compose model, deploys production images, and removes the file even after failure.

After deployment, verify readiness and request correlation:

```bash
curl -fsS -D /tmp/kestrel-health.headers https://kestrel.narumi.dev/api/backend/health
rg -i '^x-request-id:' /tmp/kestrel-health.headers
```

The backend healthcheck queries PostgreSQL before returning `200`. Web startup waits for this check. Backend request logs are structured JSON under the `HttpRequest` context and contain only method, path without query parameters, status, duration, request ID, and authenticated user/session IDs. They must never include authorization headers, request bodies, query strings, credentials, refresh tokens, TOTP codes, or location payloads.

## Local environment

Copy `.env.example` to the ignored `.env` file and restrict it before adding non-development values:

```bash
cp .env.example .env
chmod 600 .env
```

The defaults in `compose.dev.yaml` are only for local development. Never reuse its database password, access-token secret, or TOTP encryption key in production. Start and stop the live-reload stack with `just cloud-up` and `just cloud-down`.

## Database backup and bounded restore check

Create a custom-format backup before schema migrations, credential-key migrations, or risky deploys. The command reads database values from `.env` through Compose and does not place the password in the archive name or process arguments:

```bash
umask 077
backup="kestrel-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file .env -f compose.deploy.yaml exec -T postgres \
  sh -c 'pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  > "$backup"
test -s "$backup"
docker compose --env-file .env -f compose.deploy.yaml exec -T postgres \
  pg_restore --list < "$backup" >/dev/null
```

A backup is not accepted until this bounded restore drill succeeds against an isolated database on the same PostgreSQL version. It does not alter the production database:

```bash
restore_db="kestrel_restore_check_$(date -u +%Y%m%d%H%M%S)"
docker compose --env-file .env -f compose.deploy.yaml exec -T postgres \
  sh -c 'createdb --username="$POSTGRES_USER" "$1"' sh "$restore_db"
docker compose --env-file .env -f compose.deploy.yaml exec -T postgres \
  sh -c 'pg_restore --exit-on-error --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$1"' sh "$restore_db" \
  < "$backup"
docker compose --env-file .env -f compose.deploy.yaml exec -T postgres \
  sh -c 'psql --username="$POSTGRES_USER" --dbname="$1" --tuples-only --command="SELECT COUNT(*) FROM _prisma_migrations;"' sh "$restore_db"
docker compose --env-file .env -f compose.deploy.yaml exec -T postgres \
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
