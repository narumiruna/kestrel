# TODO：地點與路徑同步平台

來源：`docs/plan/location-route-sync-platform.md`。

---

## Phase 0：Android cloud-shaped local library

> 詳細拆解見 `docs/todos/phase-cloud-shaped-library-todo.md`。

- [ ] 新增 Room-based Library domain。
- [ ] DataStore favorites migration 到 Room。
- [ ] Favorites / Go to / Save flows 改接 LibraryRepository。
- [ ] 移除 UI 對 `Favorite.name` identity 的依賴。

---

## Phase 1：API / Auth 基礎

- [ ] 建立 backend workspace（NestJS）。
- [ ] 建立 PostgreSQL local dev setup。
- [ ] 建立 Prisma schema / migration workflow。
- [ ] 建立 `User` table。
- [ ] 實作 username/password 註冊。
- [ ] 密碼 hash 使用 Argon2id 或 bcrypt。
- [ ] 實作 TOTP setup：產生 secret / QR / verify。
- [ ] TOTP secret 加密保存。
- [ ] 實作 recovery codes；DB 只存 hash。
- [ ] 實作 login：password → TOTP → session。
- [ ] 實作短效 access token。
- [ ] 實作 refresh token rotation。
- [ ] 實作 session revoke。
- [ ] 加 password / TOTP / recovery code rate limit。
- [ ] 加 auth audit log（至少 login success/failure）。

---

## Phase 2：Cloud library API

- [ ] 建立 `Place` Prisma model。
- [ ] 建立 `Route` Prisma model。
- [ ] 建立 `RouteRevision` Prisma model。
- [ ] 建立 `LibraryItem` Prisma model。
- [ ] 建立 `Device` / `DeviceState` Prisma model（可先不完整使用）。
- [ ] 實作 Place CRUD API。
- [ ] 實作 Route create/update API。
- [ ] Route update 時建立 immutable `RouteRevision`。
- [ ] 實作 LibraryItem reorder / touch。
- [ ] 實作 soft delete / tombstone 語意。
- [ ] 加 owner-based authorization middleware / guard。
- [ ] API validation：lat/lng、waypoint count、speed、mode。

---

## Phase 3：Sync API

- [ ] 建立 `SyncEvent` Prisma model。
- [ ] 所有 library mutation 寫入 `SyncEvent`。
- [ ] 實作 `GET /sync/bootstrap`。
- [ ] bootstrap 回傳 places / routes latest revisions / library items / cursor。
- [ ] 實作 `GET /sync/changes?since=<cursor>`。
- [ ] changes 回傳 upserts / deletions / next cursor。
- [ ] 定義 cursor 過期時的 error code。
- [ ] 加 sync API integration tests。
- [ ] 寫 API payload versioning 策略。

---

## Phase 4：Next.js Web console

- [ ] 建立 Next.js app。
- [ ] 實作 username/password + TOTP login UI。
- [ ] 實作 session refresh / logout。
- [ ] 建立 authenticated shell layout。
- [ ] 建立 Place list / detail / edit。
- [ ] 建立 Route list / detail。
- [ ] 整合 MapLibre GL JS。
- [ ] 實作 route waypoint 新增 / 刪除 / 拖曳排序。
- [ ] 實作 route default speed / mode 設定。
- [ ] 儲存 route 時呼叫 API 並建立新 revision。
- [ ] 顯示 route latest revision number。

---

## Phase 5：Android cloud sync

- [ ] Android 加 auth token storage（Keystore / encrypted storage）。
- [ ] Android login UI：username/password + TOTP。
- [ ] 實作 API client。
- [ ] 實作 sync bootstrap。
- [ ] 將 bootstrap payload upsert 到 Room。
- [ ] 實作 sync cursor 保存。
- [ ] 實作 foreground/manual refresh。
- [ ] 實作 changes polling。
- [ ] 處理 deletions。
- [ ] cursor 過期時重新 bootstrap。
- [ ] UI 顯示 last synced at / sync error。
- [ ] Android 套用 cloud route 使用 current revision snapshot。

---

## Phase 6：Sharing

- [ ] 建立 `ShareLink` Prisma model。
- [ ] 實作 public latest route share link API。
- [ ] Web 可開啟 / 關閉 share link。
- [ ] Web public route page 可無登入查看 latest revision。
- [ ] 登入使用者可 copy public route 到自己的 library。
- [ ] Copy 時複製當下看到的 revision snapshot。
- [ ] Schema 保留 pinned revision share link。

---

## Phase 7：Sync 強化 / 多手機

- [ ] Web session/device management page。
- [ ] 顯示 Android devices / last seen。
- [ ] 可撤銷 session。
- [ ] DeviceState 回報 API。
- [ ] Android 定期回報 selected route / playback state（先 polling）。
- [ ] 衝突策略文件化：cloud wins / local dirty upload / manual resolution。
- [ ] Android local-only item upload to cloud。
- [ ] Cloud upload 成功後綁定 remote id。

---

## Phase 8：Realtime / remote control（未來）

- [ ] 設計 DeviceCommand model。
- [ ] 設計 command audit log。
- [ ] Android command polling 或 WebSocket client。
- [ ] Web 可選 device。
- [ ] Web 下發 play / pause / stop / change route。
- [ ] Android 執行 command 前處理 mock service lifecycle。
- [ ] Android 回報 command result。
- [ ] 評估手機端是否需要確認遠端控制授權。
- [ ] Realtime preview：device current location / progress。

---

## 安全 / 維運待辦

- [ ] threat model：auth、share link、remote command。
- [ ] secrets management 策略。
- [ ] DB backup / migration rollback 策略。
- [ ] API structured logging。
- [ ] API metrics / health check。
- [ ] CI：backend test / lint / typecheck。
- [ ] CI：web test / lint / typecheck。
- [ ] OpenAPI 文件輸出。
- [ ] TypeScript API client generation。
- [ ] Kotlin API client generation 或手寫 client 規範。
