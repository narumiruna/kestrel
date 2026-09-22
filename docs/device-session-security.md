# Device and session security

This document defines the trust boundaries and revocation behavior for Kestrel account sessions, Android device registration, playback-state reporting, and Web remote control.

## Security goals

- Every session/device management operation is scoped to the authenticated user.
- Access tokens identify both a user (`sub`) and server-side session (`sid`); the session remains the authorization source of truth.
- Revoking a session immediately blocks subsequent guarded API requests, even if its access token has not expired.
- Revoking an Android device also revokes the session that last registered it and prevents new remote commands or state reports from that session.
- Device IDs and client device IDs are identifiers, not credentials.
- Responses never expose access tokens, refresh-token hashes, or Android `clientDeviceId` values.

## Trust boundaries

### Web and Android clients

Clients may hold access/refresh tokens and submit user-controlled labels, user agents, IP-derived request metadata, device IDs, and client device IDs. The backend validates ownership independently for every operation. Android is responsible for enforcing local mock-location permission and reporting whether command application succeeded.

### Backend

The backend verifies access-token signatures, then loads the referenced session on every guarded request. It rejects missing, expired, or revoked sessions. Device registration derives `registeredSessionId` from verified access-token claims; the request body cannot choose a session.

### Database

PostgreSQL stores session expiry/revocation, bounded client metadata, device/session linkage, device revocation, state reports, and command status. Refresh tokens are stored only as hashes. Revocation updates use transactions so session, device, and queued-command states do not diverge.

## Step-up authentication

The following sensitive actions require the current account password:

- revoke a different session;
- revoke all sessions except the current one;
- revoke an Android device.

Signing out/revoking the current session does not require password re-entry. Step-up verification uses the existing rate-limited password verifier and validates an existing credential without applying the 12-character new-password rule. This preserves compatibility with the explicit development-only `admin` account.

A stolen active session alone therefore cannot silently evict other sessions or devices without the account password. This phase does not add TOTP re-prompting.

## Session management

`GET /auth/sessions` returns active, unexpired sessions owned by the caller. Each entry contains:

- `id`, `createdAt`, `lastUsedAt`, and `expiresAt`;
- `isCurrent`, derived from verified access-token claims;
- bounded `ipAddress` and `userAgent` metadata when available.

`lastUsedAt` is a coarse login/refresh activity signal, not per-request tracking. Metadata is stripped of control characters and bounded to database column lengths. No location inference is performed.

Revocation endpoints:

- `POST /auth/session/revoke` — backward-compatible current-session logout.
- `POST /auth/sessions/:sessionId/revoke` — target session; `currentPassword` is required unless the target is current.
- `POST /auth/sessions/revoke-others` — atomically preserves current session and revokes all other active sessions; requires `currentPassword`.

Foreign/missing session IDs return a non-enumerating not-found response. Repeated revocation is idempotent for an owned record.

## Device registration and revocation

Android registration remains `POST /devices/register` with a stable installation-scoped `clientDeviceId`. The backend upserts by `(userId, clientDeviceId)`, records the verified current session as `registeredSessionId`, and clears an earlier device revocation only when registration is made through a new valid session.

`POST /devices/:deviceId/revoke` requires `currentPassword` and atomically:

1. sets `revokedAt`;
2. disables remote control;
3. revokes the linked session when one exists;
4. expires undelivered `QUEUED` commands.

A revoked installation is not a permanent hardware denylist. The user may explicitly sign in again on that Android installation; its new valid session can re-register the stable client ID and clear `revokedAt`. The revoked session itself cannot reactivate the device because `SessionAuthGuard` rejects it first.

Older device rows have nullable session linkage. They become linked the next time Android registers. Revoking such an older unlinked device still disables it and expires queued commands, but cannot revoke a session that was never recorded.

## Playback-state reporting

An enabled, non-revoked Android device may call `POST /devices/:deviceId/state` with its matching `clientDeviceId` and one of:

- `IDLE`
- `SINGLE`
- `ROUTE`
- `PAUSED`

Android reports the initial state, real `LocationService.runtimeState` transitions, and bounded polling heartbeats while remote control is opted in and either the app is foreground or the location service is active. Runtime state does not emit per movement tick, so reporting does not create per-tick traffic. Disabled, signed-out, foreign, or revoked devices cannot report state.

## Remote-command cancellation boundary

Revocation prevents command creation and delivery after the revocation transaction and expires commands still in `QUEUED` state.

A `DELIVERED` command may already be executing on Android. Revocation cannot recall it, guarantee a remote undo, or guarantee a final ACK because the linked session may become invalid before ACK. Delivered commands retain the existing ACK-timeout behavior and eventually become `EXPIRED` if no result arrives. Terminal `APPLIED`, `FAILED`, and `EXPIRED` history is not rewritten.

The Web UI must describe this boundary instead of claiming that device revocation stops an already delivered mock operation.

## QR-assisted Android login

QR login transfers authorization from a recently authenticated Web session to a signed-out Android app without transferring the Web session itself. It is a Kestrel cross-device protocol informed by OAuth device-flow guidance, not an implementation of RFC 8628. Exact payloads, endpoints, and status responses are documented in [Android QR login API](android-qr-login-api.md).

### Configuration and compatibility

- The feature is disabled unless `KESTREL_PUBLIC_URL` and the dedicated 32-byte `AUTH_ANDROID_QR_LOGIN_SECRET` are valid.
- Supported deployments expose the Backend at `${KESTREL_PUBLIC_URL}/api/backend`. Android derives only this fixed path and never accepts an API URL supplied inside the QR.
- Production origins require HTTPS. HTTP is accepted only for loopback development origins.
- The first Android implementation uses Google Code Scanner without a camera permission. Devices without Google Play services continue to support password/TOTP/recovery-code and OIDC login.

### Protocol and state

1. A Web session whose `createdAt` is no more than 10 minutes old creates an attempt bound to its verified user and session IDs. A stale Web session must complete normal password or OIDC sign-in first.
2. The Backend returns a QR image for a versioned `${KESTREL_PUBLIC_URL}/login/android` URL. Only the URL fragment contains the attempt ID and high-entropy QR secret, so browsers, proxies, referrers, and access logs do not receive the secret.
3. The signed-out Android app parses but never opens the scanned URL, confirms the origin, creates a high-entropy verifier, and claims the attempt with the QR secret plus the verifier's S256 challenge.
4. Android shows the server, username, and a short matching code. Web shows bounded Android metadata and the same code. Android confirmation and explicit approval from the originating still-active Web session are both required.
5. Android exchanges the QR secret and verifier. The Backend verifies the secret hash and challenge, atomically consumes the approved attempt, and creates a new independent Android `Session`.
6. Android stores the resulting session through `CloudSessionStore`, clears the pending attempt, and starts normal sync. QR login does not register a remote-control device or enable remote control.

Attempts advance monotonically through pending, claimed, approved or denied, and consumed; expiry is terminal. The QR secret and verifier each contain at least 256 bits of randomness. Raw QR secrets, verifiers, access tokens, and refresh tokens are not stored in attempt rows. Attempts expire after a short user-interaction window, enforce a minimum polling interval, and are pruned with bounded work.

Only the originating Web session may inspect, approve, deny, or cancel its attempt. Session revocation denies its unconsumed attempts. Duplicate claim is idempotent only for the same verifier challenge; competing challenges are rejected. Atomic consumption creates at most one Android session. A bounded recovery window derives the same initial refresh credential from client-held secrets and can recover the current rotated successor, so a lost exchange response does not create a second session or strand Android.

### QR-specific threats and mitigations

| Threat                                                   | Mitigation                                                                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QR screenshot or shoulder surfing                        | Short expiry, high-entropy secret, single claim, Android/Web matching-code comparison, and explicit approval.                                                                                 |
| Attacker presents their own account QR to a victim       | Android prominently displays the confirmed server and username before exchange; the victim can cancel without creating a session.                                                             |
| Remote phishing or attacker claims first                 | Web must compare the code shown on the Android device and review bounded device metadata; a competing claim cannot be replaced.                                                               |
| Stolen old Web session creates persistent access         | Attempt creation requires a Web session created within the previous 10 minutes, and approval requires that same session to remain active.                                                     |
| Originating session is revoked after approval            | Exchange rechecks the authorizing session and revocation proactively denies unconsumed attempts.                                                                                              |
| QR payload redirects Android to an attacker server       | Android accepts only the versioned configured-origin path, derives `/api/backend`, never follows the scanned URL, and requires origin confirmation before changing signed-out cloud settings. |
| Replay or concurrent exchange creates duplicate sessions | Secret/challenge binding, compare-and-set transitions, serializable session creation, and exchange-session recovery return at most one session.                                               |
| Exchange response is lost                                | Bounded deterministic credential recovery returns the same session and current refresh successor.                                                                                             |
| Public polling causes database or request pressure       | User-initiated creation, active-attempt caps, short expiry, minimum poll interval, application backstops, and source-aware ingress limits.                                                    |
| Secrets leak through logs or caches                      | QR secret is in the URL fragment and request body only; responses use `Cache-Control: no-store`; logger redaction covers all QR credential names.                                             |

## Threats and mitigations

| Threat                                               | Mitigation                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| User enumerates another account's session/device IDs | Every lookup includes authenticated `userId`; foreign IDs return not found.                            |
| Client links a device to another session             | `registeredSessionId` comes only from verified access-token claims.                                    |
| Stolen device ID/client ID authorizes polling        | Poll/state/ACK require a valid same-user bearer session plus matching server/client device IDs.        |
| Stolen Web session revokes all other access          | Non-current session/device revocation requires rate-limited current-password step-up.                  |
| Revoked Android silently re-enables itself           | Linked session is revoked atomically; only a new explicit login session can re-register.               |
| Sensitive request metadata leaks                     | Values are owner-only, control-stripped, length-bounded, and contain no tokens.                        |
| Revocation claims to cancel work already sent        | UI/API documentation explicitly distinguishes queued cancellation from delivered-command timeout.      |
| State reporting increases background tracking        | Reporting is opt-in, lease-bound, transition/heartbeat-based, and contains only coarse playback state. |

## Explicit limitations

- No FCM/push wake-up, remote wipe, permanent installation block, or remote undo.
- No IP geolocation or durable browser/device fingerprinting.
- No Android UI for managing all sessions/devices; management is Web-first.
- No selected place/route IDs in the first playback-state payload.
- Password changes do not automatically revoke all other sessions in this phase.
