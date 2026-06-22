## Goal

在 Web dashboard 加入遠端控制 Android mock 的最小 UI：Places 可送 `Mock on device`，Routes 可送 `Play on device`，使用者能選 device、看到 device online/offline 與 command queued/delivered/applied/failed/expired 狀態。

成功條件：登入 Web 後，Places/Routes 頁可列出同帳號 Android devices；對 online 且 remote-control enabled 的 device 發送 place/route command；Web 顯示命令結果或「open Kestrel」提示。

## Context

- Web 已有 Places / Routes dashboard 與 `auth.apiRequest()`。
- Backend remote-control API 由 `docs/remote-control-api.md` 提供；實作記錄在 `docs/plans/archived/2026-06-20_remote-control-backend-command-queue-plan.md`。
- Android executor 由 `docs/plans/2026-06-20_android-remote-command-executor-plan.md` 提供。
- 第一版不做 realtime；Web 可以在建立 command 後短輪詢 command 狀態數次。

## Architecture

- 新增 lightweight hook `useRemoteDevices()`：load devices、refresh、create command、poll command status。
- Places page 在 selected place actions 區加入 `Mock on device`。
- Routes page 在 selected route actions 區加入 `Play on device`。
- Device picker 可先用簡單 `<select>` 或 existing card/button style，不新增 design system abstraction。
- Command payload 由 Web route/place snapshot 建出，不只傳 id；route mode 使用 API enum `ONCE|LOOP|PING_PONG`，Android 端再映射到 `MovementEngine.Mode`。

## Non-Goals

- 不做多人共享 device 控制；只顯示同帳號 devices。
- 不做 command history page。
- 不做 realtime push。
- 不從 Web 調整 Android mock developer setting。

## Plan

- [x] 在 `web/lib/api.ts` 型別或 dashboard local types 新增 remote-control DTO：`RemoteDevice`（含 `remoteControlEnabled`）、`RemoteCommandStatus`（`QUEUED|DELIVERED|APPLIED|FAILED|EXPIRED`）、`RemoteCommand`、`CreateRemoteCommandRequest`；已由 `cd web && npm run typecheck` 驗證。
- [x] 新增 `web/components/dashboard/useRemoteDevices.ts`，封裝 `GET /devices`、`POST /devices/:id/commands`、command status polling；送 command 前只允許 `online && remoteControlEnabled` device；已由 `cd web && npm run lint && npm run typecheck`、`just check && just lint` 驗證。
- [x] 在 Places dashboard 的 selected place card 加 `Mock on device` 控制：device picker、submit button、queued/delivered/applied/failed/expired/offline status；payload 使用 selected place latitude/longitude snapshot；已由 mocked browser smoke 建立 `SET_POINT` command 並看到 `DELIVERED` / `APPLIED` 狀態。
- [x] 在 Routes dashboard 的 selected route card 加 `Play on device` 控制：device picker、submit button、status；payload 使用 currentRevision waypoints、`speedKmh`（取自 route 的 defaultSpeedKmh）、`mode` API enum snapshot（`ONCE|LOOP|PING_PONG`）；route 無 currentRevision 或 waypoints < 2 時 disabled 並顯示 reason；已由 mocked browser smoke 建立 `START_ROUTE` command，並以一個 waypoint 的 mocked route 驗證 disabled reason。
- [x] 加入 `Stop on device` 作為次要 action（若 backend/Android 已支援 `STOP`），讓使用者能從 Web 停掉 remote mock；已由 mocked browser smoke 建立 `STOP` command 並看到 `DELIVERED` / `APPLIED` 狀態。
- [x] 為 offline/delivered/expired 狀態加清楚文案：`Open Kestrel on Android to receive commands`、`Command delivered; waiting for result`；已由 source review 與 mocked browser smoke 驗證 delivered 文案。
- [x] 執行 Web quality gates：`cd web && npm run lint && npm run typecheck`，以及 repo-level `just check && just lint`。

## Risks

- Route command 若只傳 route id，Android sync 延遲會失敗；Web 必須送 route snapshot。
- Device picker 如果沒有 devices，空狀態要指引 Android Options 開啟 remote control。
- Command 成功建立不代表 Android 已執行；UI 必須分開 queued/delivered/applied/failed/expired。

## Validation

- `cd web && npm run lint` ✅
- `cd web && npm run typecheck` ✅
- `just check` ✅
- `just lint` ✅
- Mocked browser smoke on local Next dev server (`http://localhost:3301`) ✅: seeded a Web session and mocked `/api/backend/*`, verified device picker `1/1 ready`, Places `Mock on device` created `{"type":"SET_POINT","payload":{"point":{"latitude":25.033,"longitude":121.5654}}}` and reached `APPLIED`, Routes `Play on device` created `{"type":"START_ROUTE","payload":{"mode":"PING_PONG","speedKmh":20,"waypoints":[...]}}` and reached `APPLIED`, `Stop on device` created `{"type":"STOP","payload":{}}` and reached `APPLIED`, and a one-waypoint saved route disabled `Play on device` with `Add at least 2 waypoints before playing this route.`
- Real backend browser smoke on Docker dev stack (`http://localhost:3301` → `http://localhost:3300`) ✅: created a fresh smoke user, saved place/route, and registered a synthetic Android device through the backend; the real Web UI showed `1/1 ready`, Places `Mock on device` created a backend `SET_POINT` command with `{"point":{"latitude":25.033,"longitude":121.5654}}`, Routes `Play on device` created a backend `START_ROUTE` command with `{"mode":"PING_PONG","speedKmh":20,"waypoints":[{"latitude":25.033,"longitude":121.5654},{"latitude":25.0478,"longitude":121.5319}]}`, `Stop on device` created `{"type":"STOP","payload":{}}`, and all three commands reached `APPLIED` after synthetic device poll/ack.

## Completion Checklist

- [x] Web 可列出 devices 並顯示 online/offline 與 remote-control enabled/disabled 狀態，已由 mocked backend smoke 驗證。
- [x] Places `Mock on device` 建立 `SET_POINT` command 並顯示 queued/delivered/applied/failed/expired 狀態，已由 manual smoke 驗證。
- [x] Routes `Play on device` 建立 `START_ROUTE` command，mode 使用 `ONCE|LOOP|PING_PONG` API enum，waypoints 不足時 disabled 並有原因，已由 manual smoke/UI review 驗證。
- [x] `STOP` action 已納入第一版，且已由 command create smoke 驗證。
- [x] Web quality gates 通過：`cd web && npm run lint && npm run typecheck`，repo-level `just check && just lint` 通過。
