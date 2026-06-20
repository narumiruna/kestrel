# Remote Control API

All endpoints require the existing bearer access token. Android must register with a stable `clientDeviceId`; Web never receives that client id.

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

Upserts by `(userId, clientDeviceId)`, sets `platform=ANDROID`, updates `lastSeenAt`, and returns a `RemoteDevice`.

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
      "lastSeenAt": "2026-06-20T08:00:00.000Z",
      "createdAt": "2026-06-20T08:00:00.000Z",
      "online": true,
      "lastCommand": null
    }
  ],
  "serverTime": "2026-06-20T08:00:00.000Z"
}
```

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

Payloads:

- `SET_POINT`: `{ "point": { "latitude": 25.033, "longitude": 121.5654 } }`
- `START_ROUTE`: `{ "waypoints": [...], "speedKmh": 20, "mode": "ONCE|LOOP|PING_PONG" }`
- `STOP`: `{}`

`expiresAt` is optional; default is 60 seconds from creation. Disabled devices reject command creation.

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

Returns queued commands after marking them `DELIVERED`. Already delivered commands are not returned again.

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
