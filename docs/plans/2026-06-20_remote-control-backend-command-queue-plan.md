## Goal

新增 backend remote-control command queue，讓 Web 可以對同一使用者的 Android device 建立 mock command，Android 可以 poll/ack，且每個 command 有狀態、expiry、錯誤訊息與基本 device presence。

成功條件：authenticated Web 可列出 devices 並建立 `SET_POINT` / `START_ROUTE` / `STOP` command；authenticated Android device 只能 poll 自己的 pending command 並回報 applied/failed；backend tests 覆蓋 ownership、expiry、payload validation、ack idempotency。

## Architecture

- 新增 `RemoteControlModule`，不要塞進 sync module；sync 繼續處理 library data，remote-control 處理即時意圖。
- Prisma 保留現有 `DeviceState`，擴充 `Device` 並新增最小 `RemoteCommand` table。
- `Device` 新增 stable `clientDeviceId` 與 `remoteControlEnabled`；以 `userId + clientDeviceId` upsert，避免重複註冊同一台 Android。
- Command payload 用 JSON snapshot：
  - `SET_POINT`: `{ point: { latitude, longitude } }`
  - `START_ROUTE`: `{ waypoints: [{ latitude, longitude }], speedKmh, mode }`，其中 `mode` 是 API enum `ONCE|LOOP|PING_PONG`
  - `STOP`: `{}`
- Command status：`QUEUED`、`DELIVERED`、`APPLIED`、`FAILED`、`EXPIRED`。
- Poll 採 at-most-once delivery：transaction 內把 `QUEUED` 標成 `DELIVERED` 後才回傳；不重送 `DELIVERED` command，避免 ack 失敗時 route 被重跑。
- Backend 只驗證結構、ownership、基本範圍；Android 負責 mock permission / service 執行結果。

## Non-Goals

- 不導入 WebSocket / SSE / FCM。
- 不把 command 混進 `/sync/changes`，避免 sync cursor 和 transient command queue 耦合。
- 不在第一版支援多 command 並行；每次 poll 最多回傳一批 ordered commands，Android 順序執行並 ack。

## Plan

- [ ] 更新 `backend/prisma/schema.prisma`：`Device` 新增 `clientDeviceId`、`remoteControlEnabled`、`@@unique([userId, clientDeviceId])`；新增 `RemoteCommand` model 與 `RemoteCommandStatus` / `RemoteCommandType` enum，欄位包含 `userId`、`deviceId`、`type`、`payload`、`status`、`errorMessage`、`expiresAt`、`createdAt`、`deliveredAt`、`appliedAt`；驗證方式為 `cd backend && npm run prisma:generate` 與產生 migration diff review。
- [ ] 新增 `backend/src/remote-control` module/controller/service/validation，提供 `POST /devices/register`、`GET /devices`、`POST /devices/:deviceId/commands`、`POST /devices/:deviceId/commands/poll`、`POST /devices/:deviceId/commands/:commandId/ack`；register request 必含 `clientDeviceId` 與 `remoteControlEnabled`；驗證方式為 `AppModule` imports 與 controller tests。
- [ ] 實作 device registration/upsert：同一 user + stable `clientDeviceId` 更新 `name`、`platform=ANDROID`、`appVersion`、`lastSeenAt`、`remoteControlEnabled`；驗證方式為 service test 覆蓋重複 registration 不建立重複 device、toggle off 後 device 不再可控制。
- [ ] 實作 Web create command：檢查 target device belongs to authenticated user、`remoteControlEnabled=true`、remote-control command payload valid、`START_ROUTE.mode` 只接受 `ONCE|LOOP|PING_PONG`、`expiresAt` 預設 60 秒；驗證方式為 service tests 覆蓋 foreign device 403/404、disabled device 400/409、invalid payload 400、valid command queued。
- [ ] 實作 Android poll：只挑該 device 未過期 `QUEUED` commands，transaction 內標記 `DELIVERED` / `deliveredAt` 後回傳，poll 同時更新 `lastSeenAt`；驗證方式為 service tests 覆蓋 expired command 不回傳且標記 `EXPIRED`、已 `DELIVERED` command 不會重送。
- [ ] 實作 Android ack：只允許該 device 對 `DELIVERED` command 回報 `APPLIED` / `FAILED`，保存 error message，ack 已終止 command 時保持 idempotent；驗證方式為 service tests 覆蓋 duplicate ack、ack queued command 拒絕、foreign command 拒絕。
- [ ] 將 device list/status response 轉成 Web 需要的狀態：讀取前先把 stale `QUEUED` / `DELIVERED` command 依 `expiresAt` 標成 `EXPIRED`，`online` 由 `lastSeenAt` 是否在 90 秒內推導，回傳 `remoteControlEnabled` 與最近一筆 `lastCommand`；驗證方式為 controller/service tests 覆蓋 online/offline 邊界與 offline command 過期。
- [ ] 執行 backend quality gates：`cd backend && npm run test -- remote-control && npm run typecheck && npm run lint && npm run build`；若 migration 需要 DB，另跑 `cd backend && npm run prisma:migrate:dev -- --name remote-control-commands` 並檢查產物。

## Risks

- Prisma schema edits 後 TypeScript 不認得新 model；需跑 `npm run prisma:generate`。
- Command table 可能累積；第一版用 expiry + status，後續再加 cleanup job，不阻塞 MVP。
- At-most-once delivery 可能讓 Android poll 後 crash 的 command 變成 `DELIVERED` 後過期；第一版接受，避免 route 因 ack 失敗被重跑。
- Remote mock command 是敏感操作；所有 endpoint 必須走 `SessionAuthGuard` 並以 `userId` constrain query。

## Rollback / Recovery

- Migration rollback：刪除 `remote_commands` table 與新增 enum（若 production 已有資料，先停止 Web/Android remote-control 入口再 rollback）。
- Feature rollback：移除/隱藏 Web buttons 與 Android polling；backend 保留 table 不影響 existing sync/library flows。

## Completion Checklist

- [ ] Prisma migration / generated client 已完成，且 backend build 使用新 Prisma client 無型別錯誤。
- [ ] Remote-control endpoints 已由 controller/service tests 覆蓋 ownership、validation、expiry、delivery、ack、remote-control opt-out。
- [ ] Backend quality gates 通過：`cd backend && npm run test -- remote-control && npm run typecheck && npm run lint && npm run build`。
- [ ] API contract 已在 PR 描述或 docs 中列出 request/response examples，供 Android/Web 實作使用。
