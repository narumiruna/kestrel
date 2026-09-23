# Android QR login API

Android QR login lets a recently authenticated Web session authorize a new independent Android session. Endpoint paths below are Backend-relative; Web uses `/api/backend/*`. The security model and social-engineering limits are defined in [device and session security](device-session-security.md).

## Enablement

`GET /auth/methods` includes:

```json
{
  "androidQrLogin": { "enabled": true },
  "oidc": { "enabled": false, "displayName": "OpenID Connect" }
}
```

The method is enabled only when `KESTREL_PUBLIC_URL` is an accepted origin, `AUTH_ANDROID_QR_LOGIN_SECRET` decodes to exactly 32 bytes, and `AUTH_ANDROID_QR_LOGIN_CREATION_ENABLED` is not `false`. Production requires HTTPS; non-production accepts loopback HTTP. Setting the creation flag to `false` hides discovery and rejects new attempts while leaving claim and exchange available for already-issued attempts during a drain. Existing login methods remain available when QR login is disabled.

## QR payload

The Backend creates, and Android strictly parses, this versioned shape:

```text
https://kestrel.example.com/login/android#attempt=<uuid>&secret=<43-char-base64url>&v=1
```

The fragment has exactly `attempt`, `secret`, and `v`. It has no query, credentials, redirect, API URL, or arbitrary path. Android never opens the URL. After showing the origin for confirmation, it derives exactly:

```text
https://kestrel.example.com/api/backend
```

The fragment prevents the secret from reaching HTTP requests and referrers. It is still a short-lived bearer capability and must not be logged, copied into analytics, or shared.

## Web attempt control

All four endpoints require the originating Web bearer session and return `Cache-Control: no-store`. Attempt creation requires that session's `createdAt` to be within the previous ten minutes.

### Create

`POST /auth/android-login-attempts`

```json
{
  "attemptId": "123e4567-e89b-42d3-a456-426614174000",
  "expiresAt": "2026-09-23T12:05:00.000Z",
  "pollIntervalSeconds": 5,
  "qrCodeDataUrl": "data:image/png;base64,..."
}
```

The attempt expires in five minutes. Creating another attempt denies the originating session's previous active attempt. A stale session receives `403` with `code=reauthentication_required`; use normal password or OIDC sign-in to obtain a recent session.

### Status

`GET /auth/android-login-attempts/:attemptId`

```json
{
  "attemptId": "123e4567-e89b-42d3-a456-426614174000",
  "device": { "name": "Google Pixel", "appVersion": "0.8.0" },
  "expiresAt": "2026-09-23T12:05:00.000Z",
  "matchingCode": "123-456",
  "status": "claimed"
}
```

`status` is `pending`, `claimed`, `approved`, `denied`, `expired`, or `consumed`. `device` and `matchingCode` are `null` before claim. Device labels are untrusted display text even though the Backend strips control characters and enforces length bounds.

### Approve or deny

- `POST /auth/android-login-attempts/:attemptId/approve`
- `POST /auth/android-login-attempts/:attemptId/deny`

Approval requires a claimed, unexpired attempt and the same still-active session that created it. Denial also serves as Web cancellation. Both return the current status representation. Foreign attempts return non-enumerating `404`.

## Android claim and exchange

These endpoints are public client endpoints and use the QR capability instead of a bearer access token. They return `Cache-Control: no-store`. Send credentials only in JSON request bodies.

### Claim

`POST /auth/android-login-attempts/:attemptId/claim`

```json
{
  "qrSecret": "43-char-base64url-value",
  "verifierChallenge": "43-char-SHA-256-base64url-value",
  "deviceName": "Google Pixel",
  "appVersion": "0.8.0"
}
```

Successful `201` response:

```json
{
  "attemptId": "123e4567-e89b-42d3-a456-426614174000",
  "expiresAt": "2026-09-23T12:05:00.000Z",
  "matchingCode": "123-456",
  "pollIntervalSeconds": 5,
  "serverOrigin": "https://kestrel.example.com",
  "user": { "username": "admin" }
}
```

Android generates a verifier with at least 256 bits of randomness, persists it in app-private non-backed-up storage, and sends only its S256 challenge during claim. Repeating the same secret/challenge is idempotent; a different challenge receives `409` and cannot replace the first claim.

### Exchange

`POST /auth/android-login-attempts/:attemptId/exchange`

```json
{
  "qrSecret": "43-char-base64url-value",
  "verifier": "client-held-base64url-verifier"
}
```

Before Web approval, the response is `202`:

```json
{ "status": "pending", "retryAfterSeconds": 5 }
```

Polling sooner can return `429` with `status=slow_down`; both responses include `Retry-After`. After approval, `201` returns the normal Kestrel auth-session response containing the new Android access token, refresh token, user, and session. Android must persist that session before deleting the pending attempt.

Denial returns `403`; invalid or expired capability returns generic `410`. Clients must treat both as terminal. An approved exchange atomically creates at most one session. Repeating the same exchange during the bounded 20-minute recovery window returns that session's current valid refresh credential rather than creating another session.

## Storage, audit, and rate boundaries

PostgreSQL stores only the QR-secret hash, verifier challenge, bounded metadata, state timestamps, and exchange-session ID. It never stores the raw QR secret, verifier, access token, or refresh token in `android_login_attempts`. Revoking the authorizing Web session denies unconsumed attempts; revoking the completed Android session immediately blocks its bearer access.

Operators must rate-limit claim/exchange by source at ingress and avoid body/query logging. The application also enforces a five-second minimum exchange interval, a finite active-attempt cap, short expiry, bounded pruning, and generic terminal errors. Audit events cover create, claim, approve, deny, expiry, and exchange outcomes without secret values.
