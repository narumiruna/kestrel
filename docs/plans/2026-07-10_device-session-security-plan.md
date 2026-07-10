## Goal

完成 Kestrel 的 device / session management security slice：登入使用者可在 Web 檢視自己的 active sessions 與 Android devices、看到 device 最近回報的 mock playback state、撤銷指定 session／其他 sessions／device，且撤銷會立即阻止後續 authenticated API 與 remote commands。

成功條件是 ownership、step-up authentication、session/device linkage、command cancellation 邊界都有 backend tests 與 threat model；Web 可完成管理流程；Android 被撤銷後會清除失效 session，重新登入後可明確重新註冊同一 installation。

## Context

- `Session` 已有 expiry、refresh rotation、`revokedAt` 與 current-session revoke，但沒有 session list、target revoke、client metadata UI 或 revoke-others。
- `Device` 已有 stable `clientDeviceId`、presence、remote-control opt-in 與 command queue，但沒有 linked session、revocation state 或管理 UI。
- `DeviceState` schema 已存在，但 Android / backend 尚未提供 playback-state reporting flow。
- Access token claims 已包含 `userId` 與 `sessionId`，`SessionAuthGuard` 每次 request 都會檢查 server-side session，因此 revoke 可立即生效。
- Web account popover目前只有 password change 與 local-only logout；remote-control device list只用於送 command。
- Roadmap仍把 device/session management 與 remote threat model列為未完成，但 remote-control MVP 已先行 shipped。

## Architecture

- Prisma 擴充 `Session` 的 nullable `ipAddress` / `userAgent`，並在 login / refresh 更新；`lastUsedAt` 維持 bounded activity timestamp，不在每個 request 無條件寫 DB。
- `Device` 新增 nullable `registeredSessionId` 與 `revokedAt`。Backend 從 authenticated access-token claims 寫入 linkage，不接受 client 自行指定 session id。
- 新增 account-security service，集中 same-user lookup、rate-limited step-up password verification、session revoke、linked-device revoke 與 queued-command expiry transaction；step-up 驗證既有 credential，不套用新密碼長度規則，並保留目前 dev default account 的登入相容性；避免 auth 與 remote-control controller 各自實作不同撤銷語意。
- API contract：
  - `GET /auth/sessions`：只回傳目前使用者的 active sessions，包含 `isCurrent`、created/last-used/expires metadata 與 sanitized client metadata，不回傳 token/hash。
  - `POST /auth/sessions/:sessionId/revoke`：撤銷指定 session；撤銷非 current session 時要求 `currentPassword`。
  - `POST /auth/sessions/revoke-others`：要求 `currentPassword`，原子地保留 current session 並撤銷其他 sessions。
  - `POST /devices/:deviceId/revoke`：要求 `currentPassword`，soft-revoke device、關閉 remote control、撤銷 linked session 並 expire 尚未 delivered 的 commands。
  - `POST /devices/:deviceId/state`：Android 以 `clientDeviceId` 回報 `IDLE|SINGLE|ROUTE|PAUSED`；`GET /devices` 回傳最新 state、`revokedAt` 與既有 presence/command summary。
- Revoke session 時，同一 transaction 也 soft-revoke linked devices、關閉 remote control並 expire `QUEUED` commands。已 `DELIVERED` command 可能正在 Android 執行，不能宣稱已取消；維持既有 ACK-timeout 行為並在 threat model / UI 明示此限制。
- 被撤銷 installation 不做永久 hardware block。Android 以新 session 明確重新登入後，register 可清除同一 user + `clientDeviceId` 的 `revokedAt` 並建立新 linkage；舊 revoked session 不可自行恢復 device。
- Android state reporting沿用 remote-control foreground/service leases，只在使用者已 opt-in remote control 且 app foreground 或 Kestrel service active 時回報；監聽 `LocationService.runtimeState` transitions，不做 per-tick writes。
- Web 新增 `/dashboard/account` security page；account popover提供入口。敏感 revoke action使用 current-password confirmation，current-session revoke成功後立即清除 local session。

## Non-Goals

- 不做 admin console、跨 user device 管理、session location geocoding或 browser/device fingerprinting。
- 不做永久 installation denylist、remote wipe、FCM wake-up或保證取消已 delivered/applied command。
- 不在此 slice 將 `DeviceState.selectedPlaceId` / route ids 接到 snapshot-based remote commands；第一版只回報 playback state與 timestamp。
- 不改 password-change 後是否自動 revoke other sessions的既有策略；若產品需要，另開計畫。
- 不新增 Android session/device management UI；管理入口以 Web 為主，Android只處理 state report、revocation與 re-registration lifecycle。

## Plan

- [ ] 在 `docs/device-session-security.md` 記錄 threat model與 API contract，明確列出 trust boundaries、same-user ownership、current-password step-up、session/device linkage、re-login reactivation，以及 `DELIVERED` command無法保證取消；以 security review確認沒有把 device id、client id或 access token當成 authorization proof。
- [ ] 更新 `backend/prisma/schema.prisma` 與新增 migration，為 `Session` 加 nullable client metadata、為 `Device` 加 nullable `registeredSessionId` / `revokedAt` relation與必要 indexes；既有 rows不強制 backfill，並以 `cd backend && npm run prisma:generate && npx prisma validate` 及 migration SQL review驗證。
- [ ] 擴充 authenticated-request helper與 auth flow，讓 backend可安全取得 current `sessionId`，login / refresh保存 sanitized IP/user-agent，且 `lastUsedAt` 只在 login、refresh或 bounded stale interval更新；以 `auth.service.spec.ts`、`session-auth.guard.spec.ts` 驗證 metadata、expiry/revocation與 write cadence。
- [ ] 新增 account-security service/controller，實作 session list、target revoke與 revoke-others；非 current revoke必須通過 rate-limited current-password verification，既有密碼驗證不得誤用 12 字元新密碼規則，foreign/missing session使用不洩漏 ownership 的 404，duplicate revoke保持 idempotent；以 focused service/controller tests驗證 current exclusion、ownership、dev default credential、step-up failure與 audit events。
- [ ] 實作 session/device cascade transaction：session revoke會 soft-revoke linked devices、設 `remoteControlEnabled=false` 並將其 `QUEUED` commands標為 `EXPIRED`；保留 terminal commands與已 `DELIVERED` ACK-timeout語意，並以並行 revoke/create/poll tests驗證撤銷後不能新增或取得 command。
- [ ] 擴充 remote-control registration與 device revoke endpoint：register從 authenticated claims綁定 session、revoked device拒絕舊 session的 create/poll/ack、新登入 session可明確 re-register/reactivate同一 installation；以 `remote-control.service.spec.ts` 覆蓋 foreign device、stale session、revoke、queued expiry與 reactivation。
- [ ] 實作 `POST /devices/:deviceId/state` 與 `GET /devices` state response，僅接受 owner + matching `clientDeviceId`、驗證 playback enum並 upsert `DeviceState`；以 controller/service tests覆蓋 ownership、revoked device、invalid payload與 latest-state mapping。
- [ ] 增加 backend e2e security flow：建立同 user兩個 sessions與一個 linked Android device，驗證 list → state report → revoke other session/device → access/poll被拒 → 新 session重新註冊；以 `cd backend && npm run test:e2e` 的新增 spec通過為準。
- [ ] 更新 Android cloud/remote models、API與向前相容 `RemoteControlSettings.registeredSessionId: String? = null`，使 session變更後重新 register；session被 backend revoke時沿用 refresh failure path清除 local cloud session，並以 serialization、`RemoteControlRepositoryTest` 與 auth repository tests驗證 legacy settings、state report、revoke和 re-login recovery。
- [ ] 將 Android `LocationService.runtimeState` transition映射到 backend playback state，沿用 foreground/service poll leases做初次、transition與 bounded heartbeat report，disabled/no-session時不回報；以 fake API/poller tests驗證 `Idle/Single/Route/Paused`、去重與無 per-tick request。
- [ ] 在 `web/lib/api.ts` 加 session/device-security DTO，新增 `/dashboard/account` page顯示 current/other sessions、client metadata、Android online/remote/playback/revoked狀態，並提供 revoke one、revoke others與 revoke device的 password-confirmed actions；以 `cd web && npm run typecheck`、source review與 browser request evidence驗證 payload與 current-session logout分支。
- [ ] 更新 `AuthProvider` / account menu，使一般 Logout best-effort呼叫既有 current-session revoke後一定清除 local storage，並加入 Account security入口；在 browser smoke攔截 successful、offline與 401 revoke responses，確認 request失敗不會把使用者卡在已登入 UI。
- [ ] 使用 `just webtest-up` 在 `http://localhost:3401/dashboard/account` 做真實 backend browser smoke，驗證 desktop `1440×900` 與 mobile `390×844` 的 session/device list、wrong-password error、revoke other、revoke device、revoke current/logout；保留 URL、viewport與 screenshots/interaction evidence，完成後執行 `just webtest-down`。
- [ ] 在取得操作者明確同意並先備份 app-private cloud/remote settings後，用 throwaway account做非破壞性 Android smoke：Web revoke linked device後 Android下一次 auth/poll失效且清除 session，重新登入後同一 installation重新註冊並恢復 state report；不可使用 `just reset`、`pm clear` 或未先說明會 uninstall test APK的 connected instrumentation，並將裝置、日期與 restore結果記錄於本計畫。
- [ ] 更新 `docs/remote-control-api.md`、`docs/plans/2026-05-10_product-roadmap-plan.md` 與 `docs/plans/README.md`，反映 basic remote control已 shipped、device/session management與 threat model已完成、以及仍未提供 push wake/permanent device blocking；以 docs diff與 stale roadmap wording `rg` 檢查驗證。
- [ ] 執行完整 quality gates：`cd backend && npm test && npm run test:e2e && npm run typecheck && npm run lint && npm run build`、`cd web && npm run lint && npm run typecheck && npm run build`、`just android-test && just check && just lint && just android-build`、`git diff --check`，所有命令通過後再做 completion review。

## Risks

- Device revoke若只改 device row而不撤銷 linked session，lost device仍可重新啟用；以 server-derived session linkage與原子 revoke避免。
- 已 `DELIVERED` command可能在 revoke同時已開始執行；UI與 threat model必須說明 revoke阻止未送達/後續 command，但不是 remote undo。
- Session metadata包含個人資訊；限制長度、只回給 owner、不記錄 token/header，且不做地理推斷。
- 每 request更新 `lastUsedAt`會增加 DB writes；採 bounded更新或 login/refresh activity語意並由測試鎖定。
- Device reactivation規則過寬會讓舊 stolen session恢復控制；只有通過 guard的新 session可清除 revoke，舊 linked session在同一 transaction被撤銷。
- Physical Android驗證會暫時替換 cloud session/remote settings；必須先取得同意、備份並驗證 restore，禁止清 app data。

## Rollback / Recovery

- Web入口可先隱藏，既有 current-session revoke與 remote-control endpoints保持相容。
- Migration新增欄位皆 nullable；rollback前先停用 account-security endpoints，再移除 foreign key/index/columns，不刪除既有 sessions、devices或 command history。
- 若 Android state reporting造成耗電或 request volume問題，可停用 reporter而保留 session/device revoke；remote command polling不依賴 `DeviceState`。
- 若 reactivation有安全疑慮，可暫時讓 revoked device維持不可恢復，要求建立新的 `clientDeviceId`，但必須同步更新 threat model與 UI說明。

## Completion Checklist

- [ ] Threat model與 API contract已由 `docs/device-session-security.md` review證明涵蓋 ownership、step-up、session linkage、remote-command cancellation boundary與 reactivation規則。
- [ ] Session list/revoke/revoke-others只作用於 authenticated owner，current session辨識正確且敏感資料不出現在 response；由 focused backend tests與 `npm run test:e2e` 證明。
- [ ] Device revoke會關閉 remote control、撤銷 linked session、expire queued commands並阻止舊 session create/poll/ack；由 backend concurrency/service tests證明，且 delivered-command限制已文件化。
- [ ] Android可回報 `IDLE|SINGLE|ROUTE|PAUSED`，被 revoke後清除失效 session，新登入後可重新註冊同一 installation；由 Android unit tests與經明確同意的非破壞性 device smoke記錄證明。
- [ ] Web `/dashboard/account` 可管理 sessions/devices，wrong-password、current logout、empty/loading/error/revoked states在 `1440×900` 與 `390×844` 瀏覽器 smoke中可用，並有 URL/viewport/screenshots證據。
- [ ] 一般 Web logout會 best-effort revoke server session且無論網路結果都清除 local credentials；由 mocked failure/success測試或 browser evidence證明。
- [ ] Roadmap、plans index與 remote-control API docs已更新，且不再聲稱 remote commands尚未設計；由 docs diff與 `rg` stale wording檢查證明。
- [ ] Backend、Web、Android與 repository quality gates全部通過，證據為計畫中記錄的 commands、日期與 implementing commit hash。
