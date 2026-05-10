# 產品計畫：地點與路徑同步平台

> 目的：讓使用者在 Web 上登入帳號，建立 / 編輯地點與路徑，並同步到 Android 手機執行 mock location 或 route playback。
>
> 本文件是長期產品與架構藍圖；近期 Android 地基重構見 `docs/plan/phase-cloud-shaped-library.md`。

---

## 1. 動機

目前 Kestrel 是單機 Android mock-GPS app，地點與路徑儲存在本機 DataStore favorites。這能滿足單機測試，但有幾個限制：

1. **路徑編輯不適合手機小螢幕**：waypoint 排序、速度、模式、分享權限都更適合在 Web 地圖編輯器處理。
2. **多裝置不一致**：同一帳號多支手機需要共用路線庫，但每台手機又可能有自己的目前選用路線與執行狀態。
3. **本機 favorite schema 太薄**：目前以 `name` 當 unique key，不適合雲端同步、分享、版本管理與刪除同步。
4. **未來遠端控制需要地基**：即時改變裝置 mock location / route 是 Phase 2+，但資料模型需先保留 device 與 command 的擴充空間。

---

## 2. 產品目標

建立一個 cloud-first 的地點與路徑平台：

- Web 是控制台：建立、編輯、分享 place / route。
- Android 是執行端：同步 library、套用單點、播放 route。
- 同帳號多手機共用同一份 library，但每台裝置可有自己的 selection / session / 執行狀態。
- MVP 先做資料同步，不做即時遠端控制。

### 非目標（MVP）

- 不做 realtime remote control。
- 不做手機端完整 route waypoint 編輯器。
- 不做完整 route revision UI（只保留資料模型與 latest revision）。
- 不做 GPX / KML 匯入匯出（沿用專案既有非目標）。
- 不繞過 Play Integrity / SafetyNet。

---

## 3. 已決策

| 主題 | 決策 |
|---|---|
| 第一版重點 | 同步資料優先，不做即時遠端控制 |
| Source of truth | Cloud-first；雲端是 canonical library |
| 多手機 | 帳號級 library + 裝置級 selection / state |
| Android 編輯能力 | MVP 先同步 / 執行；之後可新增「Save current point to cloud」；route 編輯留 Web |
| 後端 | 自建 API：NestJS + PostgreSQL + Prisma |
| Auth | 自建 username/password + 必須 TOTP |
| OTP | TOTP app-based OTP；需 recovery codes |
| Session | 首次登入 password + TOTP；之後 access token + refresh token rotation |
| Route speed | Schema 支援 waypoint/segment metadata；Android MVP 先使用 route-level default speed |
| Domain model | 雲端拆成 Place / Route / Waypoint；LibraryItem 表示使用者清單 / 排序 / 最近使用 |
| Route revision | Route 有 immutable revision；MVP UI 只顯示 latest |
| Share link | MVP 分享 latest route；schema 預留 pinned revision |
| Sync | 第一次 bootstrap 全量，之後 cursor-based incremental changes |
| Android local model | 全部統一成 cloud-shaped Library domain；local 只是未同步資料 |
| Android route cache | 只保存 current revision snapshot |

---

## 4. 核心使用情境

### 4.1 Web 編輯 → Android 同步 → 手機播放

1. 使用者登入 Web。
2. 在 Web MapLibre editor 建立 route、調整 waypoints、設定 default speed / mode。
3. Web 儲存 route，後端產生新的 `RouteRevision`。
4. Android 登入同帳號後 sync changes。
5. Android Favorites / Go to 顯示 cloud library。
6. 使用者在手機上套用 route 並播放。

### 4.2 本機資料上雲

1. 使用者在 Android 未登入時建立 local place / route。
2. 登入後 app 提示「Upload local library to cloud」。
3. local item 上傳成功後取得 remote id，轉為 cloud-owned/synced item。
4. 同名衝突不再用 name 判斷 identity；name 只是顯示欄位。

### 4.3 公開分享 route

1. Owner 在 Web 對 route 開啟 public latest share link。
2. 訪客可透過 link 查看目前 latest revision。
3. 登入使用者可 copy 當下看到的 revision snapshot 到自己的帳號。
4. Schema 預留未來「share this revision」。

---

## 5. 系統架構

```text
Next.js Web Console
  ├─ MapLibre GL JS editor
  ├─ Auth UI: username/password + TOTP
  └─ Share pages
        │
        ▼
NestJS API
  ├─ Auth/session/token service
  ├─ Library CRUD service
  ├─ Route revision service
  ├─ Share link service
  ├─ Sync bootstrap/changes service
  └─ Future: device command service
        │
        ▼
PostgreSQL + Prisma
        │
        ▼
Android App
  ├─ Room cloud-shaped local library
  ├─ Sync repository
  ├─ Existing mock execution: LocationService / MovementEngine
  └─ Map / Favorites / Go to UI
```

### MVP 技術選型

| 模組 | 技術 |
|---|---|
| Web | Next.js + React + MapLibre GL JS |
| API | NestJS |
| DB | PostgreSQL |
| ORM / migration | Prisma |
| Auth | 自建 username/password + TOTP + JWT/refresh session |
| Android | Kotlin + Jetpack Compose + Room + MapLibre Native |
| Sync | REST：bootstrap + changes polling |
| Realtime | Phase 2+，WebSocket / SSE |

---

## 6. 資料模型草案

### 6.1 Identity / Auth

```text
User
  id
  username
  password_hash
  totp_secret_encrypted
  totp_enabled_at
  created_at
  updated_at

RecoveryCode
  id
  user_id
  code_hash
  used_at
  created_at

Session
  id
  user_id
  device_id?
  refresh_token_hash
  expires_at
  revoked_at
  last_used_at
  created_at
```

Auth 要求：

- 密碼使用強 hash（Argon2id 或 bcrypt，優先 Argon2id）。
- TOTP secret 加密保存。
- recovery codes 只顯示一次，DB 只存 hash。
- password / OTP / recovery code 嘗試都要 rate limit。
- access token 短效；refresh token 長效且 rotation。

### 6.2 Device

```text
Device
  id
  user_id
  name
  platform           -- ANDROID / WEB / OTHER
  app_version?
  last_seen_at
  created_at

DeviceState        -- MVP 可先只保留 schema，不一定完整 UI
  id
  device_id
  selected_place_id?
  selected_route_id?
  selected_route_revision_id?
  playback_state    -- IDLE / SINGLE / ROUTE / PAUSED
  last_reported_at
```

### 6.3 Library

```text
Place
  id
  user_id
  name
  latitude
  longitude
  description?
  tags              -- json/string[]
  created_at
  updated_at
  deleted_at?

Route
  id
  user_id
  name
  description?
  default_speed_kmh
  mode              -- ONCE / LOOP / PING_PONG
  current_revision_id
  is_public
  created_at
  updated_at
  deleted_at?

RouteRevision
  id
  route_id
  revision_number
  payload           -- immutable snapshot: waypoints + route settings
  created_by
  created_at

Waypoint snapshot in RouteRevision.payload
  sequence
  latitude
  longitude
  speed_kmh?        -- future per-segment/waypoint override
  pause_seconds?    -- future

LibraryItem
  id
  user_id
  kind              -- PLACE / ROUTE
  place_id?
  route_id?
  sort_order
  pinned
  last_used_at?
  created_at
  updated_at
  deleted_at?
```

### 6.4 Sharing

```text
ShareLink
  id
  owner_id
  route_id
  route_revision_id?   -- null = latest link; non-null = pinned revision (future)
  token
  permission           -- PUBLIC_READ
  expires_at?
  disabled_at?
  created_at
```

MVP：只做 `route_revision_id = null` 的 latest public share link。

### 6.5 Sync

```text
SyncEvent
  id                  -- monotonic cursor source
  user_id
  entity_type         -- PLACE / ROUTE / ROUTE_REVISION / LIBRARY_ITEM / DEVICE_STATE
  entity_id
  operation           -- UPSERT / DELETE
  payload?            -- optional denormalized small payload
  created_at
```

所有會影響 Android library 的 mutation 都寫入 `SyncEvent`。

---

## 7. Sync API 草案

### 初次同步

```http
GET /sync/bootstrap
Authorization: Bearer <access_token>
```

回傳：

```json
{
  "places": [],
  "routes": [
    {
      "id": "...",
      "name": "Route A",
      "defaultSpeedKmh": 10.0,
      "mode": "ONCE",
      "currentRevision": {
        "id": "...",
        "revisionNumber": 3,
        "waypoints": []
      }
    }
  ],
  "libraryItems": [],
  "syncCursor": "12345",
  "serverTime": "..."
}
```

### 增量同步

```http
GET /sync/changes?since=<cursor>
```

回傳：

```json
{
  "changes": [],
  "deletions": [],
  "nextCursor": "12399",
  "serverTime": "..."
}
```

規則：

- cursor 遺失 / 過期 → Android 重新 bootstrap。
- MVP 可用手動 refresh + app foreground polling。
- Phase 2 realtime 可把 SyncEvent 推送到 WebSocket / SSE，但資料語意不變。

---

## 8. Android 整合方向

Android 端改為 cloud-shaped local library：

- 新增 Room DB 保存 `PlaceEntity`、`RouteEntity`、`RouteRevisionEntity`、`WaypointEntity`、`LibraryItemEntity`、`SyncStateEntity`。
- local 未登入資料與 cloud 資料使用同一套 schema。
- local item 有 stable UUID；登入後可 upload 並綁定 remote id。
- DataStore 回歸設定用途：last camera、mock state、startup preference、auth/session metadata pointer；不再作為 library canonical storage。
- 現有 UI 改吃 `LibraryItemUiModel`，不再依賴 `Favorite.name` 作 identity。
- Android MVP 只 cache current route revision；歷史 revision 由 Web / API 管理。

---

## 9. Web 功能範圍

### MVP

- username/password + TOTP 登入。
- Place CRUD。
- Route CRUD。
- MapLibre route editor：新增 / 刪除 / 重排 waypoint。
- Route-level default speed / mode。
- Public latest share link。
- 查看 public route。
- 登入後 copy public route 到自己的 library。

### Phase 2+

- per-segment speed / pause UI。
- route revision history / diff / restore。
- pinned revision share link。
- realtime device preview。
- remote control：play / pause / stop / change route / jump waypoint。

---

## 10. 里程碑

| Phase | 目標 | 內容 |
|---|---|---|
| 0 | Android cloud-shaped local library | Room domain、DataStore migration、UI 改接 Library repository |
| 1 | API/Auth 基礎 | NestJS、Prisma、PostgreSQL、username/password、TOTP、session |
| 2 | Web library CRUD | Next.js、Place/Route/Waypoint editor、MapLibre GL JS |
| 3 | Android sync | login、bootstrap、changes polling、cloud library cache |
| 4 | Sharing | public latest route link、copy route |
| 5 | Sync 強化 | tombstone、conflict handling、device session management |
| 6 | Realtime / remote control | device state、command queue、WebSocket/SSE |

---

## 11. 風險與應對

| 風險 | 描述 | 應對 |
|---|---|---|
| Auth 安全範圍變大 | 自建 username/password + TOTP 需要完整防護 | 強 hash、rate limit、refresh rotation、recovery codes、audit log |
| Android 重構影響既有 UI | `Favorite` → cloud-shaped domain 會碰 Map/Favorites/Options | 先做 Room + repository adapter，再逐步切 UI |
| Sync 語意過早複雜 | bootstrap + changes 比全量拉取多工程 | 用 SyncEvent 換取後續 deletion/realtime 的穩定性 |
| Route revision payload 設計錯誤 | waypoint metadata 未來擴充困難 | payload versioning，Android 忽略 unknown fields |
| 遠端控制安全 | Web 可控制 mock location 需明確授權 | MVP 不做；Phase 2 加 device selection、command audit、手機端確認策略 |

---

## 12. 驗收條件（產品級 MVP）

- [x] 使用者可在 Web 以 username/password + TOTP 登入。
- [x] Web 可建立 / 編輯 place。
- [x] Web 可建立 / 編輯 route waypoints、default speed、mode。
- [x] Android 可登入同帳號。
- [x] Android 首次 bootstrap 後看得到 Web 建立的 places / routes。
- [x] Web 修改 route 後產生新 revision，Android changes sync 後取得最新版。
- [x] Android 可套用單點並 mock。
- [x] Android 可播放同步下來的 route。
- [ ] Web 可產生 public latest share link。
- [ ] 登入使用者可 copy public route 到自己的 library。
