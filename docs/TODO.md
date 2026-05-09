# TODO

依工程量排序的 backlog。打 `[x]` 表示已完成。

## Quick wins（30 分 – 1 小時）

- [ ] **單元測試**：`MovementEngine`（Once/Loop/PingPong 邊界）、`RouteGenerator`（種子可重現、間距 ±誤差）、`Geo`（haversine、bearing、destinationPoint 球面繞回）。純 Kotlin，幾十行覆蓋。
- [ ] **抖動 (jitter)**：`LocationService.pushSample` / `pushLocation` 加 lat/lng ±N m、speed ±5% 隨機擾動。讓 mock 軌跡不像鐵軌。預設可關。
- [ ] **收藏 rename**：Favorites 列表加 edit icon，跳輸入框；`KestrelPrefs` 加 `renameFavorite(old, new)`，連帶處理 `StartupPreference.favoriteName`。
- [ ] **通知文案微調 + channel description**：通知列現在 title/text 偏陽春，加 channel description（系統設定才看得到）與更明確的 mode 子標題。
- [ ] **App icon**：目前還是 Android Studio 綠機器人。一個 vector + adaptive icon（前景 / 背景）就能換掉。

## 中工程（一個下午）

- [ ] **CI（GitHub Actions）**：push / PR 跑 `just check` / `just lint` / `:app:assembleDebug`。順便 cache `~/.gradle`。
- [ ] **Generate route 進階參數**：dialog 多兩欄 — 起始 bearing（auto vs 指定度數）、turn variance（目前 hardcode 60°）；可選「seed」讓使用者重現。
- [ ] **Favorite detail + Apply now**：點 Favorites 列項目進到 detail，看完整資訊（座標、route 縮圖、speed、mode），按鈕「Apply to map」直接套用而不必設成預設啟動。
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
