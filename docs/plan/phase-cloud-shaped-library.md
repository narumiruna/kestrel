# Phase：Android cloud-shaped Library domain

> 此 phase 先把 Android 本機資料模型改成與未來雲端一致的 `Place / Route / RouteRevision / Waypoint / LibraryItem`。
> 目的不是立刻做 Web/API sync，而是趁目前 0 使用者，把 `Favorite(name as id)` 技術債移除，讓本機模式也使用未來雲端形狀。
>
> 長期產品藍圖見 `docs/plan/location-route-sync-platform.md`。

---

## 1. 動機

目前 Android 的 library 資料存在 `KestrelPrefs.favorites`，核心模型是：

```kotlin
data class Favorite(
    val name: String,
    val lat: Double,
    val lng: Double,
    val route: FavoriteRoute? = null,
    val lastUsedAt: Long? = null,
)
```

這在單機 MVP 可用，但不適合後續同步平台：

1. `name` 是 unique key，rename / 衝突 / share / sync 都脆弱。
2. 單點與路線混在同一個 `Favorite`，domain 語意不清。
3. route 沒有 stable id / revision id，不利於同步判斷。
4. DataStore JSON 不適合保存會增長的 library 與 sync cursor / tombstone。
5. 專案目前 0 使用者，現在重構成本最低。

本 phase 將 Android local library 先改成 cloud-shaped Room domain。未登入時資料仍只在本機，但形狀與未來雲端一致。

---

## 2. 範圍

| 項目 | 是否含於本 phase |
|---|---|
| 新增 Room database | ✅ |
| 新增 Place / Route / RouteRevision / Waypoint / LibraryItem entities | ✅ |
| local UUID identity | ✅ |
| 從 DataStore favorites 一次性 migration 到 Room | ✅ |
| Favorites / Go to 面板改用 Library repository | ✅ |
| Save point / Save route 寫入新 Library domain | ✅ |
| `lastUsedAt`、sort order、Points/Routes tabs 保留 | ✅ |
| Android current revision snapshot | ✅ |
| Web/API/Auth/sync 實作 | ❌ 未來 phase |
| 保存完整 route revision history | ❌ Android MVP 只保存 current revision |
| per-segment speed / pause 播放 | ❌ schema 可預留，播放仍用 route default speed |
| 遠端控制裝置 | ❌ 未來 phase |

---

## 3. 設計原則

1. **Identity 用 UUID，不用 name**
   `name` 只作顯示與搜尋，不再作為 primary key。

2. **本機資料也是 cloud-shaped**
   未登入 local item 與未來 cloud item 使用同一套 Room schema。

3. **DataStore 只放設定**
   保留 last camera、mock state、startup preference、random route preference；library 搬到 Room。

4. **Android 只 cache current revision**
   雲端未來會有完整 revision history；手機端 MVP 只需要能執行最新版本。

5. **UI 先保持既有體驗**
   Favorites、Go to、Apply now、sort、recent、route playback 行為不因 domain 重構而改變。

---

## 4. Android package 規劃

建議新增：

```text
app/src/main/java/dev/narumi/kestrel/core/library/
  LibraryModels.kt          -- domain models / UI-neutral models
  LibraryRepository.kt      -- repository interface + implementation
  LibrarySort.kt

app/src/main/java/dev/narumi/kestrel/core/library/db/
  KestrelDatabase.kt
  PlaceEntity.kt
  RouteEntity.kt
  RouteRevisionEntity.kt
  WaypointEntity.kt
  LibraryItemEntity.kt
  SyncStateEntity.kt        -- 先預留，可簡化
  LibraryDao.kt
  LibraryMigrations.kt

app/src/main/java/dev/narumi/kestrel/core/library/migration/
  FavoriteToLibraryMigrator.kt
```

> Room 依賴已存在於 `gradle/libs.versions.toml` 與 `app/build.gradle.kts`。

---

## 5. 資料模型

### 5.1 Domain model

```kotlin
data class Place(
    val id: String,
    val remoteId: String? = null,
    val name: String,
    val lat: Double,
    val lng: Double,
    val description: String? = null,
    val tags: List<String> = emptyList(),
    val createdAt: Long,
    val updatedAt: Long,
)

data class Route(
    val id: String,
    val remoteId: String? = null,
    val name: String,
    val description: String? = null,
    val defaultSpeedKmh: Double,
    val mode: String,
    val currentRevisionId: String,
    val createdAt: Long,
    val updatedAt: Long,
)

data class RouteRevision(
    val id: String,
    val remoteId: String? = null,
    val routeId: String,
    val revisionNumber: Int,
    val createdAt: Long,
)

data class Waypoint(
    val id: String,
    val routeRevisionId: String,
    val sequence: Int,
    val lat: Double,
    val lng: Double,
    val speedKmh: Double? = null,
    val pauseSeconds: Double? = null,
)

data class LibraryItem(
    val id: String,
    val remoteId: String? = null,
    val kind: LibraryItemKind,
    val placeId: String? = null,
    val routeId: String? = null,
    val sortOrder: Int,
    val lastUsedAt: Long? = null,
    val createdAt: Long,
    val updatedAt: Long,
)

enum class LibraryItemKind { Place, Route }
```

### 5.2 Room entities

Room entities 可比 domain 多 sync metadata：

```text
PlaceEntity
  id                  -- local UUID primary key
  remote_id?
  name
  lat
  lng
  description?
  tags_json
  sync_status         -- LOCAL_ONLY / SYNCED / DIRTY / DELETED（可預留）
  created_at
  updated_at

RouteEntity
  id
  remote_id?
  name
  description?
  default_speed_kmh
  mode
  current_revision_id
  sync_status
  created_at
  updated_at

RouteRevisionEntity
  id
  remote_id?
  route_id
  revision_number
  created_at

WaypointEntity
  id
  route_revision_id
  sequence
  lat
  lng
  speed_kmh?
  pause_seconds?

LibraryItemEntity
  id
  remote_id?
  kind
  place_id?
  route_id?
  sort_order
  last_used_at?
  sync_status
  created_at
  updated_at

SyncStateEntity
  key
  value
```

MVP 可先不用完整 `sync_status` 流程，但欄位可預留，避免未來 migration 太多。

---

## 6. Migration：DataStore Favorite → Room Library

### 6.1 一次性 migration marker

DataStore 新增一個設定 key：

```text
library_room_migrated = true/false
```

啟動時：

1. 若 `library_room_migrated != true`：讀取 `KestrelPrefs.favorites`。
2. 對每個 favorite 建立 cloud-shaped local rows。
3. migration 成功後標記 `library_room_migrated = true`。
4. 暫時不刪 DataStore favorites，作為 rollback / debug；但 UI 不再讀它。

### 6.2 單點 favorite

```text
Favorite(route == null)
  → Place(id = uuid, name, lat, lng)
  → LibraryItem(kind = PLACE, place_id, sort_order, last_used_at)
```

### 6.3 Route favorite

```text
Favorite(route != null)
  → Route(id = uuid, name, default_speed_kmh, mode, current_revision_id)
  → RouteRevision(id = uuid, route_id, revision_number = 1)
  → Waypoint rows from FavoriteRoute.lats/lngs
  → LibraryItem(kind = ROUTE, route_id, sort_order, last_used_at)
```

Route 的 `lat/lng` 可視為起點或 legacy display 欄位，不再成為 canonical route location；route 起點由 revision 的第一個 waypoint 決定。

### 6.4 Startup preference migration

目前 `StartupPreference.favoriteName` 以 name 指向 favorite。需要改成 stable id：

```kotlin
data class StartupPreference(
    val mode: Mode = Mode.Last,
    val libraryItemId: String? = null,
    val favoriteName: String? = null, // transitional / backward compatible
)
```

Migration 時若找到同名 favorite，寫入對應 `libraryItemId`。`favoriteName` 可保留一段時間以向前相容。

---

## 7. Repository API 草案

```kotlin
interface LibraryRepository {
    val items: Flow<List<LibraryItemWithContent>>
    val sortMode: Flow<FavoritesSortMode>

    suspend fun addPlace(
        name: String,
        lat: Double,
        lng: Double,
        description: String? = null,
        tags: List<String> = emptyList(),
    ): String

    suspend fun addRoute(
        name: String,
        waypoints: List<LatLng>,
        defaultSpeedKmh: Double,
        mode: String,
        description: String? = null,
    ): String

    suspend fun renameItem(itemId: String, newName: String)
    suspend fun updatePlace(placeId: String, lat: Double, lng: Double)
    suspend fun updateRouteParams(routeId: String, speedKmh: Double, mode: String)
    suspend fun removeItem(itemId: String)
    suspend fun reorderItem(itemId: String, toIndex: Int)
    suspend fun touchItem(itemId: String)
    suspend fun setSortMode(mode: FavoritesSortMode.Mode)
}
```

`LibraryItemWithContent` 提供 UI 足夠資訊：

```kotlin
data class LibraryItemWithContent(
    val item: LibraryItem,
    val name: String,
    val kind: LibraryItemKind,
    val place: Place? = null,
    val route: Route? = null,
    val currentRevision: RouteRevision? = null,
    val waypoints: List<Waypoint> = emptyList(),
)
```

---

## 8. UI / 行為影響

| 區域 | 改動 |
|---|---|
| Go to 面板 | 從 `KestrelPrefs.favorites` 改讀 `LibraryRepository.items` |
| FavoritesScreen | 以 `LibraryItemWithContent` 顯示 Points / Routes tabs |
| Save point | 建立 `Place + LibraryItem` |
| Save route | 建立 `Route + RouteRevision + Waypoints + LibraryItem` |
| Apply point | 使用 `Place.lat/lng` |
| Apply route | 使用 `Route.currentRevision` waypoints + `Route.defaultSpeedKmh` + `Route.mode` |
| Recent sorting | `LibraryItem.lastUsedAt` |
| Manual sorting | `LibraryItem.sortOrder` |
| Rename | 改 `Place.name` 或 `Route.name`，不影響 identity |
| Startup favorite | 改用 `libraryItemId` |

### 名稱衝突

因為 name 不再是 identity，技術上允許同名。但為了 UI 清楚，MVP 可選擇：

- 新增 / rename 時提示同名，但允許；或
- 暫時禁止同類型同名。

建議：**允許同名，但在列表上以座標 / waypoint count 輔助辨識**。這能避免把 name 重新變成隱性 ID。

---

## 9. 實作步驟

1. **Room schema 基礎**
   - 新增 entities、DAO、database。
   - 建立 domain mapper。
   - 加純 Kotlin / Room DAO 測試（可先用 instrumented 或 Robolectric；若專案尚無 Robolectric，可先測 mapper）。

2. **Repository 與 migration**
   - 實作 `LibraryRepository`。
   - 實作 DataStore favorites → Room migration。
   - DataStore 加 migration marker。

3. **Save flows 改寫**
   - Save point 寫 `Place + LibraryItem`。
   - Save route 寫 `Route + RouteRevision + Waypoint + LibraryItem`。

4. **Go to 面板改接 LibraryRepository**
   - Points / Routes tabs 保持。
   - Apply point / route 行為保持。
   - touch 更新 `LibraryItem.lastUsedAt`。

5. **FavoritesScreen 改接 LibraryRepository**
   - Rename / Edit coords / Edit speed-mode / Delete / Apply now / Move up-down 全部改用 id。

6. **StartupPreference 改用 libraryItemId**
   - schema 向前相容。
   - migration 從 favoriteName resolve 到 libraryItemId。

7. **清理 legacy paths**
   - UI 不再讀 `KestrelPrefs.favorites`。
   - `Favorite` / `FavoriteRoute` 可暫時保留給 migration 與 backward compatibility。
   - TODO 加上未來移除 legacy DataStore favorites 的項目。

8. **驗證與格式化**
   - `just format`
   - `just check`
   - `just lint`
   - 實機確認 migration 與 apply route。

---

## 10. 風險與應對

| 風險 | 描述 | 應對 |
|---|---|---|
| 改動面大 | Favorites / Go to / MapScreen / Options 都依賴 favorite | 先建立 repository adapter，再逐頁切換 |
| StartupPreference 斷裂 | 舊資料用 favoriteName | transitional 欄位 + migration resolve |
| Route 起點顯示差異 | 舊 Favorite 有 lat/lng，Route canonical 改由 waypoint 決定 | migration route 使用第一個 waypoint 作顯示起點 |
| Room migration 未來複雜 | schema 還會演進 | database version 從 1 開始，所有 schema 變更寫 migration |
| 同名 item UX | 允許同名可能難辨識 | 列表補充座標、waypoint count、更新時間 |

---

## 11. 驗收條件

- [ ] 首次啟動會把既有 DataStore favorites migrate 到 Room。
- [ ] Migration 後 Points / Routes 數量與原本一致。
- [ ] Go to 面板可套用 migrated point。
- [ ] Go to 面板可套用 migrated route，speed / mode 正確。
- [ ] Save point 會建立 `Place + LibraryItem`，重啟後仍存在。
- [ ] Save route 會建立 `Route + RouteRevision + Waypoints + LibraryItem`，重啟後仍存在。
- [ ] Rename 不改變 item identity；startup reference 不會斷。
- [ ] Recent sorting 使用 `LibraryItem.lastUsedAt`。
- [ ] Manual sorting 使用 `LibraryItem.sortOrder`，重啟後保留。
- [ ] Startup favorite 改用 `libraryItemId`，舊 `favoriteName` 可 migration。
- [ ] UI 不再直接依賴 `Favorite.name` 作操作 key。
- [ ] `just check` / `just lint` 通過。

---

## 12. 後續 Phase 連接點

完成本 phase 後，下一步可接：

1. **API/Auth phase**：建立 NestJS + PostgreSQL + username/password + TOTP。
2. **Android sync phase**：Room entities 加 remote id / sync cursor / dirty state 流程。
3. **Web editor phase**：Web 產生的 route revision payload 可直接映射到 Android Room model。
4. **Remote control phase**：DeviceState / selected route 可引用 stable route id + revision id。
