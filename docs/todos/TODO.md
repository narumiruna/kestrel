# TODO

依工程量排序的 backlog。打 `[x]` 表示已完成。

## Phase：Go to 面板 + Favorites 整理（A + D）

來源：`docs/plan/phase-quick-jump-and-favorites.md`。

### 實作步驟

- [x] **Schema + prefs 基礎**：加 `lastUsedAt`、`FavoritesSortMode`、相關 `KestrelPrefs` 方法。
- [ ] **Prefs 單元測試**：覆蓋 sort mode、rename 衝突、startup favorite name 同步、reorder、touch。
- [x] **座標解析器**：`parseCoordInput(String): LatLng?` + 單元測試（純座標、Google Maps URL、範圍邊界）。
- [x] **Go to 面板 UI**：`ModalBottomSheet` + 座標欄 + Points / Routes tabs + favorites 列表（sort 套用）。
- [x] **MapScreen 接線**：新 FAB、開啟面板、apply 動作、套用前先停 route / mock。
- [x] **Favorites 頁完整改版**：tabs / sort / overflow menu / rename / Edit coords / Edit route speed-mode / delete / Apply now 已完成。
- [x] **Apply now / lastUsedAt 串起來**：Go to 面板、Favorites 頁 Apply now、Startup 套用都會 `touchFavorite`。
- [x] **Manual 重排 UI**：Manual sort 模式下可用 overflow menu Move up / Move down，接 `reorderFavorite(name, toIndex)` 持久化順序。
- [ ] **手動測試 + detekt baseline 更新**：detekt baseline 已更新；尚缺實機驗證。

### 驗收條件

- [x] 貼 `25.0330, 121.5654` / `25.0330 121.5654` / Google Maps URL 都能解析並跳轉。
- [x] Go to 面板能套用單點 favorite，套完面板關閉、底部 sheet 顯示 Mock this point。
- [x] Go to 面板能套用 route favorite，套完不自動播、speed / mode 已套上。
- [x] route 跑步中按 Go to 套東西，會先停舊 mock / route 再套新。
- [x] Favorites 頁 Points / Routes tabs 切換正常、空狀態文案合理。
- [x] 三種排序模式皆可運作，設定持久化。
- [x] Manual 模式下能重排、順序持久化（目前用 Move up / Move down，非拖曳）。
- [x] Rename / Edit coords / Edit speed-mode / Delete / Apply now 都可運作。
- [x] 套用 favorite 會更新 `lastUsedAt`，Recent 排序順序如預期變化。
- [x] `just check` / `just lint` 通過。

## Quick wins（30 分 – 1 小時）

- [x] **單元測試**：`MovementEngine`（Once/Loop/PingPong 邊界）、`RouteGenerator`（種子可重現、間距 ±誤差）、`Geo`（haversine、bearing、destinationPoint 球面繞回）。純 Kotlin，幾十行覆蓋。
- [ ] **抖動 (jitter)**：`LocationService.pushSample` / `pushLocation` 加 lat/lng ±N m、speed ±5% 隨機擾動。讓 mock 軌跡不像鐵軌。預設可關。
- [x] **收藏 rename**：Favorites 列表加 edit icon，跳輸入框；`KestrelPrefs` 加 `renameFavorite(old, new)`，連帶處理 `StartupPreference.favoriteName`。
- [ ] **通知文案微調 + channel description**：通知列現在 title/text 偏陽春，加 channel description（系統設定才看得到）與更明確的 mode 子標題。
- [ ] **App icon**：目前還是 Android Studio 綠機器人。一個 vector + adaptive icon（前景 / 背景）就能換掉。

## 中工程（一個下午）

- [ ] **CI（GitHub Actions）**：push / PR 跑 `just check` / `just lint` / `:app:assembleDebug`。順便 cache `~/.gradle`。
- [ ] **Generate route 進階參數**：dialog 多兩欄 — 起始 bearing（auto vs 指定度數）、turn variance（目前 hardcode 60°）；可選「seed」讓使用者重現。
- [ ] **Favorite detail + Apply now**：點 Favorites 列項目進到 detail，看完整資訊（座標、route 縮圖、speed、mode），按鈕「Apply to map」直接套用而不必設成預設啟動。
- [x] **移除 legacy DataStore favorites JSON**：cloud-shaped library migration 穩定後，移除 `Favorite` / `FavoriteRoute` schema 與 `favorites_json` legacy helpers。
- [ ] **MapScreen / KestrelMap 拆 sub-composables**：兩個都在 `detekt-baseline.xml` 裡是 LongMethod。拆完可從 baseline 移除。
- [ ] **Release / ProGuard 規則**：能跑的 release variant，先用 `isMinifyEnabled = false` 確認簽名流程，再分階段開 R8。
- [ ] **地圖風格切換**：OSM raster ↔ 自寫淺色 / 深色 vector style。Settings 暴露 toggle。

## 大工程（一天以上）

- [ ] **沿道路移動**：接 OSRM 或 GraphHopper public API 做 routing；Generate route 與 Save route 改成 polyline-on-roads。先不做離線。
- [ ] **多語言**：zh-TW / ja string resources。
- [ ] **Instrumented test in CI**：emulator + service lifecycle / startup mode 套用驗證。

## 已決定不做（plan 文件中歸類為「非目標」）

- 軌跡錄製（GPX / KML 匯入匯出）。
- 繞過 Play Integrity / SafetyNet。
- 多後端地圖抽象層（MapLibre 專一）。
