## Goal

讓 Web dashboard 可以遠端要求 Android app 執行 mock point 或 mock route，第一版採「Cloud command queue + Android foreground polling」完成端到端控制。

成功條件：Web 選一個已登入且啟用 remote control 的 Android device 後，可以對 place 送出 `SET_POINT`、對 route 送出 `START_ROUTE`，Android app 在前景或 mock service active 時接收命令並套用到既有 `LocationService`，Web 能看到 device online/offline 與 command `QUEUED` / `DELIVERED` / `APPLIED` / `FAILED` / `EXPIRED` 狀態。

## Context

- Android 已有 `LocationService.setLocation()`、`LocationService.startRoute()`、`pause()`、`resume()`、`stop()`；不需要新增 mock engine。
- Backend 已有 authenticated Web / Android cloud session、`Device` / `DeviceState` schema、sync API，但目前沒有 command queue 或 device registration flow。
- Web dashboard 已能管理 places/routes；Android cloud sync 已能拉 places/routes，但 remote command 第一版應傳 snapshot payload，避免 Android 尚未 sync 到最新 route 時無法執行。
- 不使用 FCM / WebSocket 作為第一版；輪詢足夠，少一個外部服務與部署風險。

## Architecture

1. Backend 建立 remote-control module：device registration、device list/status、command create、Android poll、Android ack/state report。
2. Web 只建立 command，不直接碰 Android；command payload 包含 point/route snapshot，route mode 使用 `ONCE|LOOP|PING_PONG` API enum。
3. Android 登入 cloud 後以 stable `clientDeviceId` 註冊 device；remote control opt-in 開啟時，在前景或 mock service active 狀態下 polling pending command。
4. Backend poll 採 at-most-once delivery：`QUEUED` → `DELIVERED` 後才回傳，避免 ACK 失敗造成 route 重跑；status/device reads 只用 `expiresAt` 過期未送達的 `QUEUED` command，`DELIVERED` 等 Android ack 或獨立 ack timeout。
5. Android 收到 command 後用 result-aware facade 呼叫既有 `LocationService` API atomic replace mock；確認 runtime state 後才 ack `APPLIED`，失敗則 ack `FAILED`。
6. Web 以短輪詢或 refresh 顯示 command/device 狀態，不要求 real-time。

## Non-Goals

- 不做 FCM 背景喚醒；app 被殺掉時 Web 只顯示 device offline / open Kestrel。
- 不做 WebSocket / SSE realtime。
- 不讓 Web 直接取得 mock-location 權限或繞過 Android mock app 設定。
- 不從 Web 建立新的 route authoring 模型；只對既有 place/route 發命令。

## Plan

- [ ] 實作 `docs/plans/2026-06-20_remote-control-backend-command-queue-plan.md`，提供 authenticated command queue API；驗證方式為 backend unit tests、`cd backend && npm run test && npm run typecheck && npm run lint && npm run build`。
- [ ] 實作 `docs/plans/2026-06-20_android-remote-command-executor-plan.md`，讓 Android opt-in、註冊 device、poll/ack command、呼叫 `LocationService`；驗證方式為 Android unit tests（`just android-test`）、`just check && just lint`、非破壞性 manual smoke。
- [ ] 實作 `docs/plans/2026-06-20_web-remote-control-ui-plan.md`，在 Web places/routes 加 device picker 與 mock/play buttons；驗證方式為 `cd web && npm run lint && npm run typecheck`、manual smoke。
- [ ] 做端到端 smoke：Web `Mock on device` place → Android mock dot/foreground notification 進入 single point；Web `Play on device` route → Android route playing；驗證方式為測試 device 畫面、backend command 狀態、必要時 filtered `just logf`。不可使用 `just reset` 或清 app data。
- [ ] 更新 README 或 PR 描述記錄第一版限制：remote control requires Android app foreground or active Kestrel service, command expires after bounded time, Google/web cannot wake killed app；驗證方式為文件 diff 或 PR description。

## Risks

- Android app 被系統殺掉時 polling 不會跑；第一版接受，用 Web offline/expired 文案處理。
- Web command payload 如果只放 remote route id，Android sync 延遲會造成失敗；用 route snapshot 降低耦合。
- Remote mock 是敏感能力；必須有 Android opt-in、same-user device ownership check、stable client device identity、command expiry、ack/failure audit。

## Completion Checklist

- [ ] Backend command queue API 已由 backend tests/typecheck/lint/build 驗證，且涵蓋 client device id、remote-control opt-out、delivery、expiry。
- [ ] Android remote executor 已由 Android tests/check/lint 與非破壞性 device smoke 驗證，且只在 result-aware 狀態確認後 ack `APPLIED`。
- [ ] Web remote control UI 已由 web lint/typecheck 與 manual smoke 驗證，且只對 online + enabled device 送 command。
- [ ] Web → backend → Android 的 `SET_POINT` 與 `START_ROUTE` 端到端流程已在測試 device 驗證。
- [ ] 第一版限制與安全模型已記錄在 PR 描述或文件中。
