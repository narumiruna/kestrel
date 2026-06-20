## Goal

在 Web dashboard 加入遠端控制 Android mock 的最小 UI：Places 可送 `Mock on device`，Routes 可送 `Play on device`，使用者能選 device、看到 device online/offline 與 command queued/applied/failed 狀態。

成功條件：登入 Web 後，Places/Routes 頁可列出同帳號 Android devices；對 online 且 remote-control enabled 的 device 發送 place/route command；Web 顯示命令結果或「open Kestrel」提示。

## Context

- Web 已有 Places / Routes dashboard 與 `auth.apiRequest()`。
- Backend remote-control API 由 `docs/plans/2026-06-20_remote-control-backend-command-queue-plan.md` 提供。
- Android executor 由 `docs/plans/2026-06-20_android-remote-command-executor-plan.md` 提供。
- 第一版不做 realtime；Web 可以在建立 command 後短輪詢 command 狀態數次。

## Architecture

- 新增 lightweight hook `useRemoteDevices()`：load devices、refresh、create command、poll command status。
- Places page 在 selected place actions 區加入 `Mock on device`。
- Routes page 在 selected route actions 區加入 `Play on device`。
- Device picker 可先用簡單 `<select>` 或 existing card/button style，不新增 design system abstraction。
- Command payload 由 Web route/place snapshot 建出，不只傳 id。

## Non-Goals

- 不做多人共享 device 控制；只顯示同帳號 devices。
- 不做 command history page。
- 不做 realtime push。
- 不從 Web 調整 Android mock developer setting。

## Plan

- [ ] 在 `web/lib/api` 型別或 dashboard local types 新增 remote-control DTO：`RemoteDevice`、`RemoteCommand`、`CreateRemoteCommandRequest`；驗證方式為 `cd web && npm run typecheck`。
- [ ] 新增 `web/components/dashboard/useRemoteDevices.ts`，封裝 `GET /devices`、`POST /devices/:id/commands`、command status polling；驗證方式為 lint/typecheck 與 hook call sites compile。
- [ ] 在 Places dashboard 的 selected place card 加 `Mock on device` 控制：device picker、submit button、queued/applied/failed/offline status；payload 使用 selected place latitude/longitude snapshot；驗證方式為 `cd web && npm run lint && npm run typecheck`，並手動用 mocked/real backend 建 command。
- [ ] 在 Routes dashboard 的 selected route card 加 `Play on device` 控制：device picker、submit button、status；payload 使用 currentRevision waypoints、defaultSpeedKmh、mode snapshot；route 無 currentRevision 或 waypoint < 2 時 disabled 並顯示 reason；驗證方式為 lint/typecheck 與手動 UI review。
- [ ] 加入 `Stop on device` 作為次要 action（若 backend/Android 已支援 `STOP`），讓使用者能從 Web 停掉 remote mock；驗證方式為 command create smoke 與 UI disabled 狀態。
- [ ] 為 offline/expired 狀態加清楚文案：`Open Kestrel on Android to receive commands`；驗證方式為 manual review。
- [ ] 執行 Web quality gates：`cd web && npm run lint && npm run typecheck`，以及 repo-level `just check && just lint`。

## Risks

- Route command 若只傳 route id，Android sync 延遲會失敗；Web 必須送 route snapshot。
- Device picker 如果沒有 devices，空狀態要指引 Android Options 開啟 remote control。
- Command 成功建立不代表 Android 已執行；UI 必須分開 queued/applied/failed。

## Completion Checklist

- [ ] Web 可列出 devices 並顯示 online/offline 狀態，已由 API smoke 或 mocked backend 驗證。
- [ ] Places `Mock on device` 建立 `SET_POINT` command 並顯示狀態，已由 manual smoke 驗證。
- [ ] Routes `Play on device` 建立 `START_ROUTE` command，waypoint 不足時 disabled 並有原因，已由 manual smoke/UI review 驗證。
- [ ] `STOP` action 若納入第一版，已由 command create smoke 驗證；若 backend/Android 未支援，明確標記 not applicable。
- [ ] Web quality gates 通過：`cd web && npm run lint && npm run typecheck`，repo-level `just check && just lint` 通過。
