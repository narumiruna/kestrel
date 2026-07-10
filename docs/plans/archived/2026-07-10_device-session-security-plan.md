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

- [x] 在 `docs/device-session-security.md` 記錄 threat model與 API contract，明確列出 trust boundaries、same-user ownership、current-password step-up、session/device linkage、re-login reactivation，以及 `DELIVERED` command無法保證取消；security review確認 device/client ids只是 identifiers，authorization仍由 bearer session + owner lookup提供。
- [x] 更新 `backend/prisma/schema.prisma` 與 migration `20260710120000_device_session_security`；`npm run prisma:generate`、`npx prisma validate`通過，且 fresh `kestrel-webtest` PostgreSQL log確認 migration successfully applied。
- [x] 擴充 authenticated-request helper與 auth flow保存 sanitized IP/user-agent並維持 login/refresh activity timestamp；由 `auth-request.spec.ts`、`auth.service.spec.ts`、`session-auth.guard.spec.ts`驗證。
- [x] 新增 account-security service/controller實作 session list、target revoke與 revoke-others；focused tests覆蓋 owner scope、current exclusion、dev `admin` credential、step-up failure/success audit與 idempotency。
- [x] 實作 session/device cascade transaction與 queued-command expiry；`session-revocation.service.spec.ts`及 concurrent device-revoke lock regression test驗證，delivered commands保留 ACK-timeout語意。
- [x] 擴充 remote-control registration/device revoke：server claims綁定 session，舊 session被拒，新 session可 re-register；`remote-control.service.spec.ts`與 account-security e2e覆蓋 foreign/stale/revoke/reactivation。
- [x] 實作 `POST /devices/:deviceId/state` 與 `GET /devices` state/revoked response；controller/service tests覆蓋 owner + client id、disabled/revoked拒絕、invalid payload與 latest state。
- [x] 新增 `backend/test/account-security.e2e-spec.ts`，驗證 list → state report → revoke session/device → old access/poll拒絕 → new session re-register；`npm run test:e2e` 3 suites / 7 tests通過。
- [x] 更新 Android models/API與向前相容 `registeredSessionId`；serialization、repository unit tests驗證 legacy settings、session change re-register、401清 session與 state report。
- [x] 將 `LocationService.runtimeState` transition映射到 coarse playback state並沿用 poll leases；unit tests覆蓋 Idle/Single/Route/Paused，runtime flow只在 transitions emit，heartbeat受 5 s / 15 s poll cadence約束而非 per-tick。
- [x] 新增 Web `/dashboard/account` sessions/devices management UI與 DTO；`npm run typecheck`、production build及 browser request evidence驗證 current/other/device actions。
- [x] 更新 `AuthProvider` / account menu：Logout先清 local credentials再 best-effort server revoke；browser smoke分別攔截 successful、offline rejection與 401 responses，三種情況皆導向 `/login`且 local storage為空。
- [x] 在 real `kestrel-webtest` backend驗證 `http://localhost:3401/dashboard/account`：desktop `1440×900`與 mobile `390×844`皆無 horizontal overflow，wrong-password、revoke other/device/current、loading/error/empty/revoked states皆通過；screenshots列於 Completion Evidence，stack已用 compose down停止。
- [x] Not applicable to operator-owned data：改用 fresh disposable API 35 ARM emulator `emulator-5556`，未觸碰已連線的實機或其 app data；單一 instrumentation smoke備份/恢復 emulator初始設定，驗證 revoke清 session、re-login同 installation re-register及 IDLE state report，結果 `OK (1 test)`，之後已刪除 AVD與 system image。
- [x] 更新 `docs/remote-control-api.md`、product roadmap與 plans README，反映 shipped security slice、state/revoke contract及 push/permanent-blocking限制；stale wording `rg`無結果。
- [x] 完整 quality gates於 2026-07-10通過：backend 105 unit + 7 e2e / typecheck / lint / build、Web lint / typecheck / build、Android unit / spotless / detekt / assembleDebug，以及 `git diff --check`。

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

## Completion Evidence

- Implementation commits: `9155751` (core backend/Android/Web slice), `a9dead0` (security hardening, docs, e2e, emulator smoke harness), and `ef860cd` (concurrent revoke regression coverage).
- Fresh migration/deploy evidence: `kestrel-webtest` applied `20260710120000_device_session_security`; backend started with all account-security and device-state routes mapped.
- Browser evidence at `http://localhost:3401/dashboard/account`:
  - desktop `1440×900`: `/var/folders/1z/_34kfpzn7q37z3rk3t15jtgh0000gn/T/pi-chrome-devtools-screenshot-9e8759a7-132c-41df-8eb3-8d7feb201c1c.png`;
  - mobile `390×844`: `/var/folders/1z/_34kfpzn7q37z3rk3t15jtgh0000gn/T/pi-chrome-devtools-screenshot-36533558-3183-4fcf-8191-d705e9b4a3f8.png`;
  - measured horizontal overflow `0` at both viewports; mobile grid `358px`; real backend actions and mocked loading/error/empty/logout-failure states passed.
- Android device lifecycle evidence: disposable API 35 ARM emulator, manually installed debug + androidTest APKs, `RemoteControlDeviceSmokeTest#deviceRevocationClearsSessionAndReloginReregisters`, result `OK (1 test)` in `0.64 s`; no `just reset`, `pm clear`, physical-device install, or physical data change occurred.
- Final command evidence: backend `16` suites / `105` tests and e2e `3` suites / `7` tests; Web lint/typecheck/build route included `/dashboard/account`; Android unit tests, spotless, detekt, debug build; all successful on 2026-07-10.

## Completion Checklist

- [x] Threat model與 API contract已由 `docs/device-session-security.md` review證明涵蓋 ownership、step-up、session linkage、remote-command cancellation boundary與 reactivation規則。
- [x] Session list/revoke/revoke-others只作用於 authenticated owner，current session辨識正確且 response無 tokens/hashes/client id；focused tests與 account-security e2e通過。
- [x] Device revoke會關閉 remote control、撤銷 linked session、expire queued commands並阻止舊 session create/poll/ack；concurrency/service/e2e tests通過，delivered-command限制已文件化。
- [x] Android可回報 `IDLE|SINGLE|ROUTE|PAUSED`，被 revoke後清除失效 session，新登入後可重新註冊同一 installation；unit tests與 disposable-emulator device smoke通過。
- [x] Web `/dashboard/account` 可管理 sessions/devices，wrong-password、current logout、empty/loading/error/revoked states在 `1440×900`與 `390×844` smoke中可用，並有上述 screenshots/metrics證據。
- [x] 一般 Web logout會 best-effort revoke server session且無論 success、offline或 401結果都清除 local credentials；browser interception evidence通過。
- [x] Roadmap、plans index與 remote-control API docs已更新，且 stale remote/session wording `rg`無結果。
- [x] Backend、Web、Android與 repository quality gates全部通過；日期、commands、counts與 implementation commits記錄於 Completion Evidence。
