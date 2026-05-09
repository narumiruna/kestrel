# Kestrel 規劃書

Android 模擬定位（mock GPS）、自動移動、隨機路線生成工具。

## 1. 目標與非目標

### 目標
- F1：在地圖上指定一個座標，將系統位置鎖定於該點。
- F2：定義路徑（多航點）、速度，啟動後自動沿路徑移動。
- F3：以指定的點數與間距，從目前位置（或地圖中心）隨機生成一條路線，再交給 F2 播放。

### 非目標
- 繞過 Play Integrity / SafetyNet 偵測：技術上不可行，且不在合法用途內。
- 不需 root；僅靠 Android 官方 `LocationManager` test provider。
- 不做地圖供應商抽象層的多後端支援；MapLibre 專一。
- **不錄製真實 GPS 軌跡 / 不做 GPX / KML 匯入匯出**：保持單一焦點在 mock + 自動移動。

### 使用情境
- App 開發測試地點相關功能、難以實地驗證的路徑情境、地圖／POI 觀察。

---

## 2. 核心機制

| 項目 | 說明 |
|---|---|
| Mock API | `LocationManager.addTestProvider()` + `setTestProviderLocation()` |
| 啟用條件 | 開發人員選項 → 選取模擬位置應用程式 → 選 Kestrel |
| Root | 不需要 |
| 執行容器 | `ForegroundService`（type=`location`），UI 銷毀後仍可繼續 mock |
| 偵測 | 使用 Play Integrity 的 App 仍可偵測到 mock，是系統行為 |

---

## 3. 功能規格

### F1 修改 GPS 位置（單點）
- 點選地圖任一處 → 設定為當前 mock 位置。
- 可手動輸入經緯度（含貼上 `lat,lng` 文字）。
- 顯示目前狀態：是否啟用、目前座標、上次更新時間。
- 開始 / 停止 控制。

### F2 路徑、速度、自動移動
- **路徑來源**：手動點選航點、F3 隨機生成、收藏的 route favorite。
- **速度設定**：5 / 10 / 15 / 20 km·h⁻¹ 預設；可自訂。
- **移動引擎**：固定 tick（1 Hz）沿線段做線性插值，計算 bearing、distance、ETA。
- **模式**：MVP 只做單次。
- **控制**：開始 / 暫停 / 繼續 / 停止。
- **路徑型態**：MVP 為直線插值；未來可接 OSRM 或 GraphHopper 做沿道路。

### F3 隨機路線生成
- **輸入**：起點（地圖中心或目前位置）、點數量、相鄰點間距（公尺）。
- **走法**：smooth random walk — 起始 bearing 隨機，後續每點在前一 bearing 的 ±N° 內擾動，避免回頭路也避免完全直線。
- **輸出**：航點清單，直接寫進 F2 的 `waypoints` 狀態，使用者可立即按 Play。
- **儲存**：透過既有的 Save route 流程加入收藏。

---

## 4. 系統架構

### 模組分層

```
app/
├─ core/
│  ├─ location/   MockProviderManager, MovementEngine, LocationService,
│  │              RouteGenerator, Geo (haversine / bearing / destination)
│  ├─ data/       DataStore prefs (favorites, lastCamera, mockState,
│  │              startupPreference)
│  └─ map/        MapLibre 元件封裝（MapView in AndroidView）
└─ feature/
   ├─ map/        主畫面：地圖、控制列、隨機路線 dialog
   ├─ favorites/  收藏列表（單點 + 路線）
   └─ options/    啟動行為設定
```

> 一律使用單一 Gradle module（`:app`）下的 package 切分；待規模成長到值得拆 module 再拆。

### 主要元件職責

| 元件 | 職責 |
|---|---|
| `MockProviderManager` | 包 `LocationManager` 的 test provider 生命週期；提供 `setLocation(LatLng, speed, bearing, accuracy)` |
| `MovementEngine` | 純 Kotlin、不依 Android Framework；輸入路徑+速度，advance(deltaSeconds) 推進，輸出當前 `MockSample` |
| `RouteGenerator` | 純 Kotlin；輸入起點 + 點數量 + 間距，輸出 smooth random walk 航點清單 |
| `LocationService` | Foreground Service；驅動 `MovementEngine` 與 `MockProviderManager`，處理通知、Single keepalive、狀態持久化與系統重啟復原 |
| `KestrelPrefs` | DataStore Preferences 包裝，序列化 favorites / mockState / startupPreference / lastCamera |

### 資料模型（DataStore Preferences）

```kotlin
data class CameraSnapshot(lat: Double, lng: Double, zoom: Double)

data class Favorite(name: String, lat: Double, lng: Double, route: FavoriteRoute? = null)
data class FavoriteRoute(lats: DoubleArray, lngs: DoubleArray, speedKmh: Double)

data class MockState(mode: Idle | Single | Route, single: SinglePointState?, route: RouteState?)
data class StartupPreference(mode: Last | Current | Favorite, favoriteName: String? = null)
```

### 服務生命週期

```
User → 開啟移動 → LocationService.start(intent: route+speed+mode)
        ↓
   Foreground Notification 顯示
        ↓
   MovementEngine emits MockSample @ 1Hz
        ↓
   MockProviderManager.setLocation(...)
        ↓
User → 停止 / 路徑結束（單次） → Service stop
```

---

## 5. 相依規劃

新增至 `gradle/libs.versions.toml`：

| 類別 | 套件 |
|---|---|
| 地圖 | `org.maplibre.gl:android-sdk` |
| 持久化 | `androidx.room:room-runtime/ktx/compiler`（KSP） |
| 非同步 | `org.jetbrains.kotlinx:kotlinx-coroutines-android` |
| 序列化 | `org.jetbrains.kotlinx:kotlinx-serialization-json` |
| 權限 | `com.google.accompanist:accompanist-permissions` |
| Lifecycle | `androidx.lifecycle:lifecycle-viewmodel-compose` |

**暫不引入**：Hilt（注入點少時用建構子注入即可）、Retrofit（無網路 API）、WorkManager（移動以前景服務驅動）。

---

## 6. 權限與 Manifest

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.INTERNET"/> <!-- tile 下載 -->

<service
  android:name=".core.location.LocationService"
  android:exported="false"
  android:foregroundServiceType="location"/>
```

`ACCESS_MOCK_LOCATION` 自 Android 6 起對 runtime 無作用（mock 由「開發人員選項 → 選取模擬位置應用程式」管理），但**仍需在 manifest 宣告**，否則 App 不會出現在 Settings 的 mock 候選清單中。

---

## 7. 地圖（MapLibre）

- Compose 整合：`AndroidView { MapView(context) }` 包一層；自寫 minimal wrapper 即可。
- Tile 來源（MVP）：OSM 公共 tile；發佈前切換至 MapTiler / 自架。
- 風格：以 raster 起手，後期可換 vector style JSON。

---

## 8. UX 流程

### 第一次啟動
1. 介紹頁（說明用途）。
2. 權限引導：精確位置（前景＋背景視需要）、通知。
3. 「選為模擬位置 App」引導：用 `Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)` 帶到開發人員選項；附圖文步驟。
4. **關閉 Google 位置精確度**引導：「設定 → 位置 → 位置服務 → Google 位置精確度（位置情報の精度）」關閉。Google Play Services 的 FusedLocationProvider 會用 Wi-Fi / 基地台融合補位，即使 GPS+NETWORK 已被 mock，仍會把位置拉回真實。關閉後 FLP 才會純信 mock 過的 GPS_PROVIDER 與 NETWORK_PROVIDER。
5. 健康檢查：偵測是否已被選為 mock app，未通過則顯示提醒。

### 主畫面（地圖）
- 中央地圖（MapLibre）。
- 底部控制列：模式切換（單點 / 路徑）、開始 / 停止、速度。
- 浮動狀態：當前 mock 座標、執行中徽章。

### 路徑編輯
- 點選地圖加航點，長按存收藏，Save route 把整條路徑存收藏。
- 「Generate route」按鈕：dialog 輸入點數量與間距 → 從相機中心生成隨機走線 → 取代當前 waypoints。

### 收藏管理
- 收藏列表（Favorites tab）顯示單點與路線（含 N waypoints · X km/h）。
- 啟動行為（Options tab）：Last / Current / 任一收藏。

---

## 9. 實作里程碑

| Phase | 範圍 | 驗收條件 |
|---|---|---|
| **P0** | Gradle 整理：`minSdk` 由 35 降至 29、加入 `libs.versions.toml` 條目、建立模組 package 骨架 | 編譯通過、空殼 service 可啟動 |
| **P1** | `MockProviderManager` + `LocationService` + 通知 + 單點 mock；不含 UI | 由測試 / 假頁面觸發後，系統地圖看到位置移動 |
| **P2** | 地圖 UI、權限引導、健康檢查、點選設位置 | 端到端 happy path 可用 |
| **P3** | `MovementEngine`（直線插值）+ 多航點 + 速度 + 暫停/繼續 | 可沿路徑自動移動 |
| **P4** | DataStore prefs（favorites + lastCamera + mockState + startupPreference）、StartupSheet → Options tab、收藏管理、通知 actions、被殺後復原 | 重開 App / Service 殺重啟皆能恢復 mock |
| **P5** | UI 美化（dynamic color、FlowRow、empty states、Material icons）、tooling（Spotless + ktlint + detekt + prek hooks） | `just check` / `just lint` 全綠 |
| **P6** | `RouteGenerator` 與 Generate route dialog | 指定點數 / 間距能立刻生成可播放的路徑 |
| **P7** | 設定、UX 打磨、ProGuard 規則、release build | 可裝可用之 release apk |

> 每個 Phase 結束時補充對應的單元測試（特別是 `MovementEngine` 與 `RouteGenerator`，純 Kotlin 易測）與 instrumentation test（service 生命週期）。

---

## 10. 已決議事項

- 語言：Kotlin。
- UI：Jetpack Compose。
- 地圖：**MapLibre Native**。
- 模擬機制：Android 官方 `addTestProvider`，不走 root / Xposed。
- DI：暫不引入 Hilt。
- Tile：MVP 用 OSM 公共 tile，release 前切換。

---

## 11. 待決事項

- 沿道路移動（OSRM / GraphHopper）何時導入；牽涉是否要打包離線地圖資料。
- Tile 提供商正式選擇（MapTiler vs Stadia vs 自架）。
- 是否提供 quick tile 離線快取（影響儲存空間策略）。
- App icon / 品牌設計。
- 是否要加入循環 / 來回 / 抖動模式（先前規劃為 P5，已暫時移出範圍）。

---

## 12. 風險與限制

| 風險 | 說明 | 因應 |
|---|---|---|
| Play Integrity 偵測 | 銀行、部分遊戲會拒絕 mock | 文件清楚標示限制，不主打規避 |
| GMS Wi-Fi / Cell 融合 | 即使 GPS+NETWORK 都 mock 了，Google 位置精確度開啟時 FLP 仍以 Wi-Fi / 基地台覆寫 | 引導使用者到「設定 → 位置 → 位置服務 → Google 位置精確度」關閉 |
| OEM 客製差異 | 小米 / 華為等可能影響 test provider | 多裝置實機驗證；issue tracker 收集 |
| 前景通知不可隱藏 | 系統限制 | 設計簡潔通知，提供快速停止按鈕 |
| `minSdk` 過高 | 35 限縮可用裝置 | P0 降至 29 |
| OSM tile 流量政策 | 公共 tile 不可重度使用 | release 前切自家 / 商業供應商 |

---

## 13. 參考

- [Android LocationManager.addTestProvider](https://developer.android.com/reference/android/location/LocationManager#addTestProvider)
- [Foreground services (location type)](https://developer.android.com/develop/background-work/services/fgs/service-types#location)
- [MapLibre Native Android](https://maplibre.org/maplibre-native/android/)
- [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
