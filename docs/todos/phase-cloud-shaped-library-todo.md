# TODO：Phase Android cloud-shaped Library domain

來源：`docs/plan/phase-cloud-shaped-library.md`。

---

## 0. 準備 / 盤點

- [ ] 盤點所有 `KestrelPrefs.favorites` 使用點。
- [ ] 盤點所有以 favorite `name` 作操作 key 的 UI / 方法。
- [ ] 盤點 `StartupPreference.favoriteName` 使用點。
- [ ] 決定 Room database name / version 起點。
- [ ] 決定 UUID 產生方式。

---

## 1. Room schema 基礎

- [ ] 新增 `core/library/db/` package。
- [ ] 新增 `KestrelDatabase`。
- [ ] 新增 `PlaceEntity`。
- [ ] 新增 `RouteEntity`。
- [ ] 新增 `RouteRevisionEntity`。
- [ ] 新增 `WaypointEntity`。
- [ ] 新增 `LibraryItemEntity`。
- [ ] 新增 `SyncStateEntity`（可先預留最小 key/value）。
- [ ] 新增 enum / converter：library item kind。
- [ ] 新增 enum / converter：sync status（可先預留）。
- [ ] 新增 JSON converter：tags list。
- [ ] 建立 Room indices：remote id、route id、revision id、sort order。
- [ ] 建立 foreign key / cascade 規則。

---

## 2. DAO

- [ ] 新增 `LibraryDao`。
- [ ] Query：observe all library items with content。
- [ ] Query：observe points only。
- [ ] Query：observe routes only。
- [ ] Query：get item by id。
- [ ] Insert：place + library item transaction。
- [ ] Insert：route + revision + waypoints + library item transaction。
- [ ] Update：rename place / route。
- [ ] Update：place coordinates。
- [ ] Update：route default speed / mode。
- [ ] Update：touch item lastUsedAt。
- [ ] Update：reorder item sortOrder。
- [ ] Delete：remove library item + content policy。
- [ ] Query：startup library item by id。

---

## 3. Domain models / mappers

- [ ] 新增 `core/library/LibraryModels.kt`。
- [ ] 新增 `Place` domain model。
- [ ] 新增 `Route` domain model。
- [ ] 新增 `RouteRevision` domain model。
- [ ] 新增 `Waypoint` domain model。
- [ ] 新增 `LibraryItem` domain model。
- [ ] 新增 `LibraryItemWithContent`。
- [ ] 新增 entity → domain mapper。
- [ ] 新增 domain → entity helper。
- [ ] Mapper 單元測試。

---

## 4. Repository

- [ ] 新增 `LibraryRepository` interface。
- [ ] 新增 Room-backed implementation。
- [ ] `items: Flow<List<LibraryItemWithContent>>`。
- [ ] `sortMode: Flow<FavoritesSortMode>` 可暫時沿用 DataStore sort mode。
- [ ] `addPlace(...)`。
- [ ] `addRoute(...)`。
- [ ] `renameItem(itemId, newName)`。
- [ ] `updatePlace(placeId, lat, lng)`。
- [ ] `updateRouteParams(routeId, speedKmh, mode)`。
- [ ] `removeItem(itemId)`。
- [ ] `reorderItem(itemId, toIndex)`。
- [ ] `touchItem(itemId)`。
- [ ] `setSortMode(mode)`。
- [ ] Repository tests（至少 mapper/reorder/touch 可純測）。

---

## 5. DataStore migration

- [ ] DataStore 新增 `library_room_migrated` marker。
- [ ] `StartupPreference` 新增 `libraryItemId: String?`，保留 `favoriteName` 向前相容。
- [ ] 新增 `FavoriteToLibraryMigrator`。
- [ ] 單點 favorite → `Place + LibraryItem`。
- [ ] Route favorite → `Route + RouteRevision + Waypoints + LibraryItem`。
- [ ] 保留原本 favorite 順序為 `sortOrder`。
- [ ] 保留 `lastUsedAt`。
- [ ] 保留 route `speedKmh` / `mode`。
- [ ] 以第一個 waypoint 作 route display 起點。
- [ ] Migration 後 resolve `StartupPreference.favoriteName` → `libraryItemId`。
- [ ] Migration 成功後寫 marker。
- [ ] Migration 失敗時不可清除原 DataStore favorites。
- [ ] Migration 測試：point、route、startup favorite、空 favorites。

---

## 6. Save flows 改寫

- [ ] MapScreen save point 改呼叫 `LibraryRepository.addPlace`。
- [ ] MapScreen save route 改呼叫 `LibraryRepository.addRoute`。
- [ ] Save route 建立 revisionNumber = 1。
- [ ] Save route waypoints 依序寫入 `WaypointEntity.sequence`。
- [ ] 移除新增時依賴 favorite name 覆蓋的行為。
- [ ] 同名時允許或提示；不得用 name 當 identity。

---

## 7. Go to 面板改接 LibraryRepository

- [ ] Go to sheet items 改讀 `LibraryItemWithContent`。
- [ ] Points tab 使用 `LibraryItemKind.Place`。
- [ ] Routes tab 使用 `LibraryItemKind.Route`。
- [ ] Apply point 使用 `Place.lat/lng`。
- [ ] Apply route 使用 current revision waypoints。
- [ ] Apply route 使用 `Route.defaultSpeedKmh` / `Route.mode`。
- [ ] Apply 後呼叫 `touchItem(itemId)`。
- [ ] Recent sort 改用 `LibraryItem.lastUsedAt`。
- [ ] Manual sort 改用 `LibraryItem.sortOrder`。
- [ ] 空狀態文案維持。

---

## 8. FavoritesScreen 改接 LibraryRepository

- [ ] 列表改讀 `LibraryItemWithContent`。
- [ ] Rename 改用 `itemId`。
- [ ] Edit coordinates 改用 `placeId`。
- [ ] Edit speed/mode 改用 `routeId`。
- [ ] Delete 改用 `itemId`。
- [ ] Apply now 改用 `itemId` 並 touch。
- [ ] Move up / Move down 改用 `itemId`。
- [ ] UI 顯示同名 item 時有輔助資訊（座標 / waypoint count）。
- [ ] 確認 Points / Routes tabs 切換正常。

---

## 9. StartupPreference 改接 libraryItemId

- [ ] Options UI 選 favorite 時保存 `libraryItemId`。
- [ ] 啟動套用 favorite 時改用 `libraryItemId` 查 LibraryRepository。
- [ ] 若 `libraryItemId` 找不到，fallback 到 `favoriteName` migration / 顯示失效。
- [ ] 套用 startup item 時 touch `LibraryItem.lastUsedAt`。
- [ ] StartupPreference serialization 向前相容。

---

## 10. Legacy cleanup

- [ ] UI 不再直接讀 `KestrelPrefs.favorites`。
- [ ] UI 操作不再呼叫 `addFavorite/removeFavorite/renameFavorite` 等 legacy methods。
- [ ] `Favorite` / `FavoriteRoute` 暫時保留給 migration。
- [ ] `KestrelPrefs.favorites` 標註 deprecated 或限制為 migration-only。
- [ ] TODO 加上未來移除 DataStore favorites JSON 的項目。
- [ ] 確認 detekt baseline 是否可減少或需更新。

---

## 11. 測試

- [ ] Mapper tests。
- [ ] Migration tests：空資料。
- [ ] Migration tests：單點 favorite。
- [ ] Migration tests：route favorite。
- [ ] Migration tests：lastUsedAt / sort order。
- [ ] Migration tests：startup favoriteName → libraryItemId。
- [ ] Repository tests：add place。
- [ ] Repository tests：add route / waypoints order。
- [ ] Repository tests：rename 不改 id。
- [ ] Repository tests：touch。
- [ ] Repository tests：reorder。
- [ ] 手動測試：既有本機 favorites migration。
- [ ] 手動測試：Go to apply point / route。
- [ ] 手動測試：Favorites edit / delete / apply now。
- [ ] 手動測試：app restart 後資料仍存在。

---

## 12. 驗收條件

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
- [ ] `just check` 通過。
- [ ] `just lint` 通過。

---

## 13. 後續清理 / 非本 phase

- [ ] 移除 legacy DataStore favorites JSON。
- [ ] 加 Android sync remote id binding。
- [ ] 加 dirty/local-only upload state。
- [ ] 加完整 route revision history lazy load。
- [ ] 加 per-segment speed / pause playback。
