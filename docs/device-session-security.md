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

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| User enumerates another account's session/device IDs | Every lookup includes authenticated `userId`; foreign IDs return not found. |
| Client links a device to another session | `registeredSessionId` comes only from verified access-token claims. |
| Stolen device ID/client ID authorizes polling | Poll/state/ACK require a valid same-user bearer session plus matching server/client device IDs. |
| Stolen Web session revokes all other access | Non-current session/device revocation requires rate-limited current-password step-up. |
| Revoked Android silently re-enables itself | Linked session is revoked atomically; only a new explicit login session can re-register. |
| Sensitive request metadata leaks | Values are owner-only, control-stripped, length-bounded, and contain no tokens. |
| Revocation claims to cancel work already sent | UI/API documentation explicitly distinguishes queued cancellation from delivered-command timeout. |
| State reporting increases background tracking | Reporting is opt-in, lease-bound, transition/heartbeat-based, and contains only coarse playback state. |

## Explicit limitations

- No FCM/push wake-up, remote wipe, permanent installation block, or remote undo.
- No IP geolocation or durable browser/device fingerprinting.
- No Android UI for managing all sessions/devices; management is Web-first.
- No selected place/route IDs in the first playback-state payload.
- Password changes do not automatically revoke all other sessions in this phase.
