# Phase：Go to 面板 + Favorites 整理（A + D）

> 此 phase 解決「定點跳轉不順」與「Favorites 沒法快速套用 / 沒辦法整理」兩個痛點。
> 不在此 phase：waypoint 微調（B）、route 生成迭代（C）— 將另立 phase。

---

## 1. 動機

當前流程下使用者反映的問題：

1. **跳到指定座標**：地圖沒有座標貼上、地址搜尋的入口；只能拖拉地圖到目標、再點一下、再按 Mock this point。
2. **快速套用收藏**：要先去 Options 設成「啟動套用」，沒有「現在就套這個 favorite」的入口。
3. **Favorites 雜亂**：不能改名、不能改坐標、無法區分點與路線、無法依使用頻率調整順序。

對應決策：

- A 引入「Go to 面板」一次處理 #1 和 #2。
- D 重整 Favorites schema 與 UI 一次處理 #3。

---

## 2. 範圍

| 項目 | 是否含於本 phase |
|---|---|
| 座標貼上跳轉（含解析 Google Maps URL） | ✅ |
| Favorites 列表的快速套用入口 | ✅ |
| Favorites 排序（手動 / 最近使用 / 字母） | ✅ |
| Favorites 點 / 路線 tab 分頁 | ✅ |
| 編輯 favorite：rename、改點座標、改 route speed/mode | ✅ |
| 地址 / 地名搜尋（Geocoder / Nominatim） | ❌ 未來 phase |
| `goo.gl` 短網址解析 | ❌ |
| 在地圖上對個別 waypoint 編輯（刪 / 重排） | ❌ B phase |
| Route 生成後的局部 reroll / 增減一點 | ❌ C phase |

---

## 3. A：Go to 面板

### 3.1 入口

地圖右下既有 FAB 群（Generate / My location）多加一顆 small icon button，圖示用 `Icons.Filled.Search` 或 `Icons.Filled.LocationSearching`。順序由上而下：Generate → Go to → My location。

### 3.2 Surface

`ModalBottomSheet`，從畫面下方滑出，蓋過底部既有 `BottomSheetScaffold`。可滾動，可裝較多 favorites。

### 3.3 內容結構

```
┌──────────────────────────────────────┐
│ [drag handle]                         │
│                                       │
│  Paste coordinates or Maps URL        │
│  ┌────────────────────────────┐ [Go]  │
│  │ 25.0330, 121.5654          │       │
│  └────────────────────────────┘       │
│                                       │
│  ── Tabs ──                           │
│  [ Points ] [ Routes ]                │
│                                       │
│  Sort: [Manual ▾]                     │
│                                       │
│  ⭐ Home                  25.0, 121.5 │
│  ⭐ Office                            │
│  ⭐ ... (滾動)                         │
└──────────────────────────────────────┘
```

### 3.4 座標解析

接受以下輸入；任一 match 即抽出 `(lat, lng)`：

| 形式 | 範例 |
|---|---|
| 純數字 + 逗號 | `25.0330, 121.5654` |
| 純數字 + 空白 | `25.0330 121.5654` |
| Google Maps `@lat,lng` | `https://www.google.com/maps/place/.../@25.0330,121.5654,15z/...` |
| Google Maps `q=lat,lng` | `https://www.google.com/maps/?q=25.0330,121.5654` |
| Google Maps `?ll=lat,lng`（舊式） | `https://maps.google.com/?ll=25.03,121.56` |

不支援：`goo.gl` 短網址（要 HTTP redirect resolve，先不做）、DMS 格式。

範圍檢查：lat ∈ [-90, 90]、lng ∈ [-180, 180]，超出則 Go 按鈕灰掉並顯示提示。

### 3.5 行為

| 動作 | 結果 |
|---|---|
| 按 Go 解析座標成功 | 相機飛到該點（zoom 15）、`waypoints` 取代為 `[該點]`、面板關閉、底部 sheet 主按鈕變成「Mock this point」 |
| 點 favorite（單點） | 同上，並更新該 favorite 的 `lastUsedAt` |
| 點 favorite（路線） | 相機飛到起點、`waypoints` 取代、`speedKmh` / `routeMode` 套用、**不**自動播放、面板關閉、`lastUsedAt` 更新 |
| 任一動作觸發時 route 正在跑 | 先停（`LocationService.stop`），再套用，避免 mid-route 切換造成怪行為 |
| 任一動作觸發時 single 正在 mock | 先停（同上），再套用 |

---

## 4. D：Favorites 整理

### 4.1 Schema 變更

```kotlin
@Serializable
data class Favorite(
    val name: String,
    val lat: Double,
    val lng: Double,
    val route: FavoriteRoute? = null,
    val lastUsedAt: Long? = null,         // 新增：每次套用時更新
)

@Serializable
data class FavoritesSortMode(val mode: Mode = Mode.Manual) {
    enum class Mode { Manual, Recent, Alphabetical }
}
```

`KestrelPrefs` 新增：

```kotlin
val favoritesSortMode: Flow<FavoritesSortMode>
suspend fun setFavoritesSortMode(mode: FavoritesSortMode.Mode)
suspend fun renameFavorite(oldName: String, newName: String)
suspend fun updateFavoritePoint(name: String, lat: Double, lng: Double)
suspend fun updateFavoriteRouteParams(name: String, speedKmh: Double, mode: String)
suspend fun reorderFavorite(name: String, toIndex: Int)
suspend fun touchFavorite(name: String)        // 設 lastUsedAt = now
```

> Manual 模式的順序就是 list 中的 index；`reorderFavorite` 把指定 favorite 移到目標 index。

### 4.2 排序模式

UI 上方顯示一個 dropdown / segmented：

- **Manual**（預設）：list 索引序，可拖曳重排（drag handle）
- **Recent**：以 `lastUsedAt` 由新到舊；從未用過的排到最後（用建立順序當 tiebreaker）
- **Alphabetical**：以 `name` 字典序

排序模式持久化到 prefs，跨重啟保留。Go to 面板與 Favorites 頁共享同一個排序設定。

### 4.3 Tabs

Favorites 頁與 Go to 面板都顯示兩個 tab：

- **Points**：`route == null` 的 favorites
- **Routes**：`route != null` 的 favorites

每個 tab 的空狀態給一句說明（e.g.「長按地圖以儲存點」/「Save route 後出現在這裡」）。

### 4.4 編輯 UI

Favorites 列表每個 row 加一個 overflow icon，下拉選：

| 操作 | 適用 | UI |
|---|---|---|
| Rename | 點 + 路線 | 簡單輸入框 dialog |
| Edit coordinates | 點 | dialog：兩種輸入「Paste coords」「Use current map center」 |
| Edit speed/mode | 路線 | dialog：複用 MapSheet 的 chip 選擇器 |
| Delete | 點 + 路線 | 確認 dialog（已有） |
| Apply now | 點 + 路線 | 等同 Go to 面板的點選行為，並切回 Map tab |

> 名稱衝突：`addFavorite` 目前是 name unique（重名會覆蓋）。Rename 時要檢查目標名稱不可與其他 favorite 重複。

### 4.5 觸發 `lastUsedAt` 更新

- Go to 面板點某 favorite
- Favorites 頁的「Apply now」
- Startup preference 套用（如果使用者選 Favorite 啟動）

---

## 5. 互動 / 跨組件影響

| 改動點 | 影響 |
|---|---|
| `MapScreen.kt` 新 FAB | 既有 FAB Column 從 2 顆變 3 顆；可能要評估 `Generate FAB` 是否仍保留（與 Sheet 內 Generate 按鈕功能重複）— 暫保留以維持單頁完成 generate 的便利性 |
| `MapScreen` 多一個 `showGoToSheet` state 與 `ModalBottomSheet` |  |
| `BottomSheetScaffold` 與 `ModalBottomSheet` 同存 | Material3 支援，但要實測手勢衝突 |
| `KestrelPrefs` 新增方法、Schema | DataStore Preferences 是純 JSON 字串，schema 變化用 `ignoreUnknownKeys = true` 可向前相容；舊 favorites 沒有 `lastUsedAt` 會解析成 `null`，符合預期 |
| `FavoritesScreen.kt` | 從單一 list 改為 TabRow + LazyColumn、加 sort dropdown、加 overflow menu |
| `StartupPreference` 套用流程 | 套用時呼叫 `touchFavorite(name)` |

---

## 6. 實作步驟（順序）

1. **Schema + prefs 基礎**：加 `lastUsedAt`、`FavoritesSortMode`、相關 KestrelPrefs 方法 + 單元測試
2. **座標解析器**：純 Kotlin function `parseCoordInput(String): LatLng?` + 單元測試（涵蓋上節五種 case + 邊界）
3. **Go to 面板 UI**：ModalBottomSheet + 座標欄 + 兩 tab + favorites 列表（sort 套用）
4. **MapScreen 接線**：新 FAB、開啟面板、apply 動作（含先停 route 的邏輯）
5. **Favorites 頁改版**：TabRow、sort dropdown、overflow menu、編輯 dialog 們
6. **Apply now / lastUsedAt 串起來**：Favorites 頁、Go to 面板、Startup 套用三處都呼叫 `touchFavorite`
7. **手動測試 + detekt baseline 更新**

每步都應該能單獨編譯通過、可手動驗證。建議拆 2–3 個 PR：(1) schema + 解析器 + 測試；(2) Go to 面板 + 接線；(3) Favorites 頁改版。

---

## 7. 待決 / 風險

| 項 | 描述 | 應對 |
|---|---|---|
| ModalBottomSheet 與 BottomSheetScaffold 手勢衝突 | 兩層 sheet 同存時，下方 sheet 可能誤觸手勢 | 實機驗證；必要時開啟 modal 時把下方 sheet 收回 PartiallyExpanded |
| Favorites name 作為 ID 仍嫌脆弱 | rename 時要小心；未來若引入 id-based 引用會更穩 | 本 phase 不改，但備案：未來加 `id: String` 欄位（UUID） |
| `isMockAllowed()` 在套 favorite 時可能為 false | 套了 waypoints 但無法 mock | 沿用既有 StatusBanner 流程；面板套用本身不需 mock 權限，只在按 Mock 才需要 |
| 三顆 FAB 視覺重 | 右下從 2 顆變 3 顆 | 維持 small FAB；之後如要再加要重新檢視 |
| Generate FAB 與 Sheet 內按鈕功能重複 | 既有問題，本 phase 不解決 | 留待 C phase 一併重新檢視 |

---

## 8. 驗收條件

- [ ] 貼 `25.0330, 121.5654` / `25.0330 121.5654` / Google Maps URL 都能跳轉
- [ ] Go to 面板能套用某個單點 favorite，套完面板自動關、底部 sheet 顯示 Mock this point
- [ ] Go to 面板能套用某個 route favorite，套完不自動播、speed/mode 都已套上
- [ ] route 跑步中按 Go to 套東西，會先停舊 mock 再套新
- [ ] Favorites 頁兩個 tab 切換正常、空狀態文案合理
- [ ] 三種排序模式皆可運作，重啟保留設定
- [ ] Manual 模式下能拖曳重排、順序持久化
- [ ] Rename / Edit coords / Edit speed-mode / Delete / Apply now 都可運作
- [ ] 套用 favorite 會更新 `lastUsedAt`，Recent 排序順序如預期變化
- [ ] `just check` / `just lint` 通過
