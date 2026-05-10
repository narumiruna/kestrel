# TODO：Phase Android cloud-shaped Library domain

來源：`docs/plan/phase-cloud-shaped-library.md`。

---

## 0. 準備 / 盤點

- [x] 盤點所有 `KestrelPrefs.favorites` 使用點。
- [x] 盤點所有以 favorite `name` 作操作 key 的 UI / 方法。
- [x] 盤點 `StartupPreference.favoriteName` 使用點。
- [x] 決定 Room database name / version 起點。
- [x] 決定 UUID 產生方式。

### Phase 0 盤點結果（2026-05-09）

- `KestrelPrefs.favorites` 主要使用點：
  - `feature/map/MapScreen.kt`
  - `feature/favorites/FavoritesScreen.kt`
  - `feature/options/OptionsScreen.kt`
  - `core/data/Preferences.kt`（legacy favorites methods）
- 目前以 favorite `name` 作 key 的操作：
  - `Preferences.addFavorite/removeFavorite/renameFavorite/reorderFavorite/touchFavorite`
  - `MapScreen` 套用/儲存與 startup fallback lookup
  - `FavoritesScreen` rename/delete/reorder/apply
  - `OptionsScreen` startup favorite 選取
- `StartupPreference.favoriteName` 使用點：
  - `core/data/Preferences.kt`
  - `feature/map/MapScreen.kt`
  - `feature/options/OptionsScreen.kt`
  - `feature/favorites/FavoritesScreen.kt`
- Room 初始決策：
  - database name：`kestrel.db`
  - schema version 起點：`1`
- UUID 初始決策：
  - 使用 `UUID.randomUUID().toString()`

### 目前進度註記（2026-05-10）

- Room schema 基礎已建立於 `core/library/db/`。
- DAO 基礎 query / insert transaction / update / delete API 已補齊。
- `just build` 已通過 Room KSP / debug APK build。

---

## 1. Room schema 基礎

- [x] 新增 `core/library/db/` package。
- [x] 新增 `KestrelDatabase`。
- [x] 新增 `PlaceEntity`。
- [x] 新增 `RouteEntity`。
- [x] 新增 `RouteRevisionEntity`。
- [x] 新增 `WaypointEntity`。
- [x] 新增 `LibraryItemEntity`。
- [x] 新增 `SyncStateEntity`（可先預留最小 key/value）。
- [x] 新增 enum / converter：library item kind。
- [x] 新增 enum / converter：sync status（可先預留）。
- [x] 新增 JSON converter：tags list。
- [x] 建立 Room indices：remote id、route id、revision id、sort order。
- [x] 建立 foreign key / cascade 規則。

---

## 2. DAO

- [x] 新增 `LibraryDao`。
- [x] Query：observe all library items with content。
- [x] Query：observe points only。
- [x] Query：observe routes only。
- [x] Query：get item by id。
- [x] Insert：place + library item transaction。
- [x] Insert：route + revision + waypoints + library item transaction。
- [x] Update：rename place / route。
- [x] Update：place coordinates。
- [x] Update：route default speed / mode。
- [x] Update：touch item lastUsedAt。
- [x] Update：reorder item sortOrder。
- [x] Delete：remove library item + content policy。
- [x] Query：startup library item by id。

---

## 3. Domain models / mappers

- [x] 新增 `core/library/LibraryModels.kt`。
- [x] 新增 `Place` domain model。
- [x] 新增 `Route` domain model。
- [x] 新增 `RouteRevision` domain model。
- [x] 新增 `Waypoint` domain model。
- [x] 新增 `LibraryItem` domain model。
- [x] 新增 `LibraryItemWithContent`。
- [x] 新增 entity → domain mapper。
- [x] 新增 domain → entity helper。
- [x] Mapper 單元測試。

---

## 4. Repository

- [x] 新增 `LibraryRepository` interface。
- [x] 新增 Room-backed implementation。
- [x] `items: Flow<List<LibraryItemWithContent>>`。
- [x] `sortMode: Flow<FavoritesSortMode>` 可暫時沿用 DataStore sort mode。
- [x] `addPlace(...)`。
- [x] `addRoute(...)`。
- [x] `renameItem(itemId, newName)`。
- [x] `updatePlace(placeId, lat, lng)`。
- [x] `updateRouteParams(routeId, speedKmh, mode)`。
- [x] `removeItem(itemId)`。
- [x] `reorderItem(itemId, toIndex)`。
- [x] `touchItem(itemId)`。
- [x] `setSortMode(mode)`。
- [x] Repository tests（至少 mapper/reorder/touch 可純測）。

---

## 5. DataStore migration

- [x] DataStore 新增 `library_room_migrated` marker。
- [x] `StartupPreference` 新增 `libraryItemId: String?`，保留 `favoriteName` 向前相容。
- [x] 新增 `FavoriteToLibraryMigrator`。
- [x] 單點 favorite → `Place + LibraryItem`。
- [x] Route favorite → `Route + RouteRevision + Waypoints + LibraryItem`。
- [x] 保留原本 favorite 順序為 `sortOrder`。
- [x] 保留 `lastUsedAt`。
- [x] 保留 route `speedKmh` / `mode`。
- [x] 以第一個 waypoint 作 route display 起點。
- [x] Migration 後 resolve `StartupPreference.favoriteName` → `libraryItemId`。
- [x] Migration 成功後寫 marker。
- [x] Migration 失敗時不可清除原 DataStore favorites。
- [x] Migration 測試：point、route、startup favorite、空 favorites。

---

## 6. Save flows 改寫

- [x] MapScreen save point 改呼叫 `LibraryRepository.addPlace`。
- [x] MapScreen save route 改呼叫 `LibraryRepository.addRoute`。
- [x] Save route 建立 revisionNumber = 1。
- [x] Save route waypoints 依序寫入 `WaypointEntity.sequence`。
- [x] 移除新增時依賴 favorite name 覆蓋的行為。
- [x] 同名時允許或提示；不得用 name 當 identity。

---

## 7. Go to 面板改接 LibraryRepository

- [x] Go to sheet items 改讀 `LibraryItemWithContent`。
- [x] Points tab 使用 `LibraryItemKind.Place`。
- [x] Routes tab 使用 `LibraryItemKind.Route`。
- [x] Apply point 使用 `Place.lat/lng`。
- [x] Apply route 使用 current revision waypoints。
- [x] Apply route 使用 `Route.defaultSpeedKmh` / `Route.mode`。
- [x] Apply 後呼叫 `touchItem(itemId)`。
- [x] Recent sort 改用 `LibraryItem.lastUsedAt`。
- [x] Manual sort 改用 `LibraryItem.sortOrder`。
- [x] 空狀態文案維持。

---

## 8. FavoritesScreen 改接 LibraryRepository

- [x] 列表改讀 `LibraryItemWithContent`。
- [x] Rename 改用 `itemId`。
- [x] Edit coordinates 改用 `placeId`。
- [x] Edit speed/mode 改用 `routeId`。
- [x] Delete 改用 `itemId`。
- [x] Apply now 改用 `itemId` 並 touch。
- [x] Move up / Move down 改用 `itemId`。
- [x] UI 顯示同名 item 時有輔助資訊（座標 / waypoint count）。
- [x] 確認 Points / Routes tabs 切換正常。

---

## 9. StartupPreference 改接 libraryItemId

- [x] Options UI 選 favorite 時保存 `libraryItemId`。
- [x] 啟動套用 favorite 時改用 `libraryItemId` 查 LibraryRepository。
- [x] 若 `libraryItemId` 找不到，fallback 到 `favoriteName` migration / 顯示失效。
- [x] 套用 startup item 時 touch `LibraryItem.lastUsedAt`。
- [x] StartupPreference serialization 向前相容。

---

## 10. Legacy cleanup

- [x] UI 不再直接讀 `KestrelPrefs.favorites`。
- [x] UI 操作不再呼叫 `addFavorite/removeFavorite/renameFavorite` 等 legacy methods。
- [x] `Favorite` / `FavoriteRoute` 暫時保留給 migration。
- [x] `KestrelPrefs.favorites` 標註 deprecated 或限制為 migration-only。
- [x] TODO 加上未來移除 DataStore favorites JSON 的項目。
- [x] 確認 detekt baseline 是否可減少或需更新。

---

## 11. 測試

- [x] Mapper tests。
- [x] Migration tests：空資料。
- [x] Migration tests：單點 favorite。
- [x] Migration tests：route favorite。
- [x] Migration tests：lastUsedAt / sort order。
- [x] Migration tests：startup favoriteName → libraryItemId。
- [x] Repository tests：add place。
- [x] Repository tests：add route / waypoints order。
- [x] Repository tests：rename 不改 id。
- [x] Repository tests：touch。
- [x] Repository tests：reorder。
- [x] 手動測試：既有本機 favorites migration。
- [x] 手動測試：Go to apply point / route。
- [x] 手動測試：Favorites edit / delete / apply now。
- [x] 手動測試：app restart 後資料仍存在。

---

## 12. 驗收條件

- [x] 首次啟動會把既有 DataStore favorites migrate 到 Room。
- [x] Migration 後 Points / Routes 數量與原本一致。
- [x] Go to 面板可套用 migrated point。
- [x] Go to 面板可套用 migrated route，speed / mode 正確。
- [x] Save point 會建立 `Place + LibraryItem`，重啟後仍存在。
- [x] Save route 會建立 `Route + RouteRevision + Waypoints + LibraryItem`，重啟後仍存在。
- [x] Rename 不改變 item identity；startup reference 不會斷。
- [x] Recent sorting 使用 `LibraryItem.lastUsedAt`。
- [x] Manual sorting 使用 `LibraryItem.sortOrder`，重啟後保留。
- [x] Startup favorite 改用 `libraryItemId`，舊 `favoriteName` 可 migration。
- [x] UI 不再直接依賴 `Favorite.name` 作操作 key。
- [x] `just check` 通過。
- [x] `just lint` 通過。

---

## 13. 後續清理 / 非本 phase

- [x] 移除 legacy DataStore favorites JSON（2026-05-10：刪除 `Favorite`/`FavoriteRoute`、`FAVORITES`/`LIBRARY_ROOM_MIGRATED` keys、deprecated 操作 methods、`StartupPreference.favoriteName`、`FavoriteToLibraryMigrator` 與其 test、`LibraryRepository.ensureMigrated`/`resolveLegacyStartupPreference`/`updateStartupPreference`，`LibraryDao.findLibraryItemIdByName`/`countLibraryItems`，UI fallback 路徑）。
- [ ] 加 Android sync remote id binding。
- [ ] 加 dirty/local-only upload state。
- [ ] 加完整 route revision history lazy load。
- [ ] 加 per-segment speed / pause playback。
