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

- [x] 建立 backend workspace（NestJS）。
- [x] 建立 PostgreSQL local dev setup。
- [x] 建立 Prisma schema / migration workflow。
- [x] 建立 `User` table。
- [x] 實作 username/password 註冊。
- [x] 密碼 hash 使用 Argon2id 或 bcrypt。
- [x] 實作 TOTP setup：產生 secret / QR / verify。
- [x] TOTP secret 加密保存。
- [x] 實作 recovery codes；DB 只存 hash。
- [x] 實作 login：password → TOTP → session。
- [x] 實作短效 access token。
- [x] 實作 refresh token rotation。
- [x] 實作 session revoke。
- [x] 加 password / TOTP / recovery code rate limit。
- [x] 加 auth audit log（至少 login success/failure）。

---

## Phase 2：Cloud library API

- [x] 建立 `Place` Prisma model。
- [x] 建立 `Route` Prisma model。
- [x] 建立 `RouteRevision` Prisma model。
- [x] 建立 `LibraryItem` Prisma model。
- [x] 建立 `Device` / `DeviceState` Prisma model（可先不完整使用）。
- [x] 實作 Place CRUD API。
- [x] 實作 Route create/update API。
- [x] Route update 時建立 immutable `RouteRevision`。
- [x] 實作 LibraryItem reorder / touch。
- [x] 實作 soft delete / tombstone 語意。
- [x] 加 owner-based authorization middleware / guard。
- [x] API validation：lat/lng、waypoint count、speed、mode。

---

## Phase 3：Sync API

- [x] 建立 `SyncEvent` Prisma model。
- [x] 所有 library mutation 寫入 `SyncEvent`。
- [x] 實作 `GET /sync/bootstrap`。
- [x] bootstrap 回傳 places / routes latest revisions / library items / cursor。
- [x] 實作 `GET /sync/changes?since=<cursor>`。
- [x] changes 回傳 upserts / deletions / next cursor。
- [x] 定義 cursor 過期時的 error code。
- [x] 加 sync API integration tests。
- [ ] 寫 API payload versioning 策略。

---

## Phase 4：Next.js Web console

- [x] 建立 Next.js app。
- [x] 實作 username/password + TOTP login UI。
- [x] 實作 session refresh / logout。
- [x] 建立 authenticated shell layout。
- [x] 建立 Place list / detail / edit。
- [x] 建立 Route list / detail。
- [x] 整合 MapLibre GL JS。
- [ ] 實作 route waypoint 新增 / 刪除 / 拖曳排序。（目前支援點地圖新增、刪除、按鈕重排、拖曳 marker 改座標；尚未做 list drag-and-drop 排序。）
- [x] 實作 route default speed / mode 設定。
- [x] 儲存 route 時呼叫 API 並建立新 revision。
- [x] 顯示 route latest revision number。

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
