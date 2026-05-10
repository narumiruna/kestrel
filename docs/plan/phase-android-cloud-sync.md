# Phase：Android cloud sync

> 此 phase 把 Android 從「只有本機 cloud-shaped library」推進到「能登入 cloud、拉下遠端 library、保存 session、顯示 sync 狀態」。
> 本 phase 先做資料同步與登入，不做 local-only item upload、衝突解決 UI、realtime remote control。
>
> 長期產品藍圖見 `docs/plan/location-route-sync-platform.md`。

---

## 1. 動機

前一個 phase 已把 Android library 形狀改成 `Place / Route / RouteRevision / LibraryItem`，但目前仍完全是 local-only：

1. Web 已可編輯 place / route，但 Android 還看不到遠端資料。
2. backend 已有 auth、library API、sync API，但 Android 尚未接線。
3. 使用者需要在手機上登入同一帳號後，直接套用 Web 建好的 cloud route。
4. `SyncStateEntity`、`remoteId`、`syncStatus` 已預留，現在應開始真的使用它們。

---

## 2. 範圍

| 項目 | 是否含於本 phase |
|---|---|
| Android auth session storage（Keystore / encrypted storage） | ✅ |
| username/password + TOTP / recovery code login UI | ✅ |
| API client（auth + sync） | ✅ |
| bootstrap 全量同步 | ✅ |
| changes 增量同步 | ✅ |
| sync cursor 保存 | ✅ |
| foreground / manual refresh | ✅ |
| deletions / cursor expired handling | ✅ |
| UI 顯示 last synced at / sync error | ✅ |
| Map / Favorites / Go to 使用 current revision snapshot | ✅ |
| local-only item upload to cloud | ❌ Phase 7 |
| conflict resolution UI | ❌ Phase 7 |
| device state reporting | ❌ Phase 7 |
| realtime command / remote control | ❌ Phase 8 |

---

## 3. 設計原則

1. **Cloud 是 canonical，Android 只做 cache**
   Room 是本機快取與 execution source，不是最終真相。

2. **登入與 sync 分層**
   auth/session、HTTP client、sync orchestration、Room upsert 分開，避免都塞進 Composable。

3. **current revision snapshot 即 execution source**
   route playback 一律讀 `Route.currentRevisionId` 對應的 waypoint snapshot；不保存歷史 revision UI。

4. **local-only item 不在本 phase 自動上傳**
   未登入或既有 local-only items 先保留在 Room；cloud sync 只拉 remote → local cache。

5. **安全優先於方便**
   refresh token 不存明文；至少要用 Keystore 保護的加密儲存。

---

## 4. Android package 規劃

建議新增：

```text
app/src/main/java/dev/narumi/kestrel/core/cloud/
  CloudModels.kt             -- auth / sync DTOs
  CloudSessionStore.kt       -- Keystore-backed encrypted storage
  CloudApiClient.kt          -- HTTP + JSON client
  CloudAuthRepository.kt     -- login / refresh / logout facade
  CloudSyncRepository.kt     -- bootstrap / changes orchestration
```

既有模組會擴充：

```text
core/data/Preferences.kt     -- cloud API base URL 等輕量設定
core/library/db/LibraryDao.kt -- remoteId lookup, upsert, sync_state helpers
feature/options/OptionsScreen.kt -- login / logout / sync status / manual refresh UI
feature/map/MapScreen.kt / FavoritesScreen.kt -- 顯示 synced cache（大多可沿用）
```

---

## 5. 資料與狀態模型

### 5.1 Session storage

```kotlin
data class CloudSession(
    val accessToken: String,
    val accessTokenExpiresAt: Long,
    val refreshToken: String,
    val sessionId: String,
    val userId: String,
    val username: String,
)
```

保存策略：

- `refreshToken` 與 `accessToken` 一起保存，但整個 payload 先 JSON serialize 再用 Android Keystore AES-GCM 加密。
- 儲存介質可用 SharedPreferences / DataStore 任一；本 phase 重點是 **Keystore-backed encryption**。
- 登出時清除本機 session；remote revoke 失敗不阻止 local clear。

### 5.2 Sync state

`sync_state` 至少保存：

```text
cloud_sync_cursor
cloud_last_synced_at
cloud_last_error
cloud_user_id
```

用途：

- `cloud_sync_cursor`：下次 changes polling 起點。
- `cloud_last_synced_at`：UI 顯示。
- `cloud_last_error`：UI 顯示最近錯誤。
- `cloud_user_id`：若登入帳號改變，可先清空 synced cache 再 bootstrap。

---

## 6. API client 行為

### 6.1 auth

- `POST /auth/login`
  - username/password + `totpCode`
  - 或 username/password + `recoveryCode`
- `POST /auth/refresh`
- `POST /auth/session/revoke`

### 6.2 sync

- `GET /sync/bootstrap`
- `GET /sync/changes?since=<cursor>`

### 6.3 refresh 策略

- access token 401 → 嘗試 refresh 一次 → 成功後重試原 request。
- refresh 失敗 → 清掉 session，UI 回到 signed-out state。

---

## 7. Room upsert 規則

### 7.1 remote → local identity 對應

所有 remote entity 用 `remoteId` 對應到本機 row：

- `Place.remoteId`
- `Route.remoteId`
- `RouteRevision.remoteId`
- `LibraryItem.remoteId`

若找不到既有 `remoteId`：建立新的 local UUID。

### 7.2 bootstrap

bootstrap 是 full snapshot，因此：

1. 依 `remoteId` upsert places / routes / current revisions / libraryItems。
2. route 的 current revision waypoint 以 snapshot 為準，覆蓋本機該 revision 的 waypoint rows。
3. 若發現 `cloud_user_id` 與本次登入 user 不同，先清空所有 `syncStatus == Synced` 的 rows，再做 bootstrap。
4. local-only rows 保留，不自動上傳。

### 7.3 changes

- `UPSERT`：重新拉 payload 對應 rows 並 upsert。
- `DELETE`：依 `entityType + remoteId` 刪除本機 synced row。
- `SYNC_CURSOR_EXPIRED`：清掉 cursor，重新 bootstrap。

---

## 8. UI 規劃

## 8.1 Options 頁新增 Cloud 區塊

至少包含：

- API base URL
- signed out 時：username / password / TOTP or recovery code login form
- signed in 時：username、session 狀態、last synced at、last error
- 按鈕：Login / Logout / Sync now

> MVP 先把 cloud 管理放在 Options，避免先做整頁 navigation / account center。

### 8.2 foreground / manual refresh

- app 啟動後若有 session 且 cursor 為空 → bootstrap
- app 回 foreground 且已有 session → 觸發 changes sync
- 使用者可在 Options 手動按 `Sync now`

---

## 9. 實作步驟（建議 PR 切法）

1. **auth 基礎**
   - `CloudSessionStore`
   - `CloudApiClient` auth endpoints
   - Options login/logout UI
2. **sync bootstrap**
   - sync DTOs
   - Room remoteId lookup / upsert helpers
   - bootstrap → Room + cursor / status 保存
3. **changes sync + 狀態 UI**
   - changes endpoint
   - deletions / cursor expired handling
   - foreground/manual refresh + last synced / error UI
4. **execution 驗收**
   - 確認 Map / Favorites / Go to 對 cloud route 讀 current revision snapshot

---

## 10. 風險 / 待決

| 項目 | 風險 | 應對 |
|---|---|---|
| Android 本機沒有 HTTP client | 要選擇依賴或手寫 client | MVP 可先用 `HttpURLConnection` + kotlinx.serialization；之後再換 OkHttp/Ktor |
| session storage 設計太重 | 引入大套加密依賴會拖慢 | 先用 Android Keystore + AES-GCM 自行封裝 |
| synced row 與 local-only row 共存 | UI 可能出現重複概念 item | 本 phase 接受；upload / merge 留到 Phase 7 |
| logout 後 cache 策略 | 要不要清空 synced data | 預設保留 cache 但不可 refresh；若切換 user，bootstrap 前清掉舊 synced cache |
| route revision 多次 upsert | waypoint snapshot 與 currentRevisionId 易不一致 | transaction 內先 upsert revision / waypoints，再更新 route.currentRevisionId |

---

## 11. 驗收條件

- [x] 使用者可在 Android 以 username/password + TOTP 登入。
- [x] refresh token 以 Keystore-backed encrypted storage 保存。
- [x] `Sync now` 可成功 bootstrap cloud places / routes 到 Room。
- [x] Favorites / Go to 可看到 Web 建立的 cloud library。
- [x] route 會使用 cloud current revision snapshot 執行。
- [x] changes sync 可抓到 Web 新增 / 修改 / 刪除。
- [x] cursor 過期時會自動 fallback 到 bootstrap。
- [x] Options 頁可看到 last synced at / 最近 sync error。
