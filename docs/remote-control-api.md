# Remote Control API

All endpoints require the existing bearer access token. Android must register with a stable `clientDeviceId`; Web never receives that client id. Session/device ownership, revocation, step-up authentication, and delivered-command limits are defined in [`device-session-security.md`](device-session-security.md).

Endpoint paths below are backend-relative. When using the web console origin, call them through the `/api/backend/*` proxy, for example `/api/backend/devices`.

## Register Android device

`POST /devices/register`

```json
{
  "clientDeviceId": "android-installation-id",
  "name": "Pixel 9",
  "appVersion": "0.2.0",
  "remoteControlEnabled": true
}
```

Upserts by `(userId, clientDeviceId)`, sets `platform=ANDROID`, links the device to the verified current session, clears an earlier revocation only for that new valid session, updates `lastSeenAt`, and returns a `RemoteDevice` (Android should persist the returned `id` and use it as `:deviceId` for poll/state/ack). Setting `remoteControlEnabled=false` expires queued commands for that device.

## List devices

`GET /devices`

```json
{
  "devices": [
    {
      "id": "device-id",
      "name": "Pixel 9",
      "platform": "ANDROID",
      "appVersion": "0.2.0",
      "remoteControlEnabled": true,
      "revokedAt": null,
      "lastSeenAt": "2026-06-20T08:00:00.000Z",
      "createdAt": "2026-06-20T08:00:00.000Z",
      "online": true,
      "state": {
        "playbackState": "ROUTE",
        "lastReportedAt": "2026-06-20T08:00:00.000Z"
      },
      "lastCommand": null
    }
  ],
  "serverTime": "2026-06-20T08:00:00.000Z"
}
```

Revoked devices remain visible with `revokedAt`, `remoteControlEnabled=false`, and `online=false` once presence becomes stale. They cannot receive commands until Android explicitly signs in again and re-registers.

## Report Android playback state

`POST /devices/:deviceId/state`

```json
{
  "clientDeviceId": "android-installation-id",
  "playbackState": "PAUSED"
}
```

`playbackState` must be `IDLE`, `SINGLE`, `ROUTE`, or `PAUSED`. Only an enabled, non-revoked, same-user device with the matching client id may report state. The endpoint updates device presence and returns:

```json
{
  "state": {
    "playbackState": "PAUSED",
    "lastReportedAt": "2026-06-20T08:00:05.000Z"
  }
}
```

## Revoke Android device

`POST /devices/:deviceId/revoke`

```json
{ "currentPassword": "existing account password" }
```

Requires current-password step-up. Revocation disables remote control, revokes the session that registered the device, and expires queued commands. A delivered command may still finish and remains subject to ACK timeout.

## Create command from Web

`POST /devices/:deviceId/commands`

```json
{
  "type": "START_ROUTE",
  "payload": {
    "waypoints": [
      { "latitude": 25.033, "longitude": 121.5654 },
      { "latitude": 25.0478, "longitude": 121.5319 }
    ],
    "speedKmh": 20,
    "mode": "LOOP"
  }
}
```

`payload` is required. Payloads:

- `SET_POINT`: `{ "point": { "latitude": 25.033, "longitude": 121.5654 } }`
- `START_ROUTE`: `{ "waypoints": [...], "speedKmh": 20, "mode": "ONCE|LOOP|PING_PONG" }`
- `STOP`: `{}`

`expiresAt` is optional; default and maximum are 60 seconds from creation (applies while status is `QUEUED`). Once a command is `DELIVERED`, it is no longer expired by `expiresAt`; instead the server waits for an ACK and marks it `EXPIRED` if the ACK is not received within the ACK-timeout window. Disabled devices reject command creation.

Response:

```json
{
  "id": "command-id",
  "deviceId": "device-id",
  "type": "START_ROUTE",
  "payload": {
    "waypoints": [
      { "latitude": 25.033, "longitude": 121.5654 },
      { "latitude": 25.0478, "longitude": 121.5319 }
    ],
    "speedKmh": 20,
    "mode": "LOOP"
  },
  "status": "QUEUED",
  "errorMessage": null,
  "expiresAt": "2026-06-20T08:01:00.000Z",
  "deliveredAt": null,
  "appliedAt": null,
  "createdAt": "2026-06-20T08:00:00.000Z"
}
```

## Poll from Android

`POST /devices/:deviceId/commands/poll`

```json
{ "clientDeviceId": "android-installation-id" }
```

Returns queued commands after marking them `DELIVERED`. Already delivered commands are not returned again. Disabled devices receive an empty batch and any queued commands are expired.

```json
{
  "commands": [
    {
      "id": "command-id",
      "deviceId": "device-id",
      "type": "STOP",
      "payload": {},
      "status": "DELIVERED",
      "errorMessage": null,
      "expiresAt": "2026-06-20T08:01:00.000Z",
      "deliveredAt": "2026-06-20T08:00:05.000Z",
      "appliedAt": null,
      "createdAt": "2026-06-20T08:00:00.000Z"
    }
  ],
  "serverTime": "2026-06-20T08:00:05.000Z"
}
```

## Ack from Android

`POST /devices/:deviceId/commands/:commandId/ack`

```json
{
  "clientDeviceId": "android-installation-id",
  "status": "FAILED",
  "errorMessage": "Kestrel is not selected as the mock location app"
}
```

`status` must be `APPLIED` or `FAILED`. Duplicate terminal ACKs are idempotent. Response is the updated command.
