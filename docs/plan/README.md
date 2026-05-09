# Kestrel 規劃書

Android 模擬定位（mock GPS）、自動移動、軌跡記錄工具。

## 1. 目標與非目標

### 目標
- F1：在地圖上指定一個座標，將系統位置鎖定於該點。
- F2：定義路徑（多航點）、速度、模式（單次／循環／來回），啟動後自動沿路徑移動。
- F3：記錄座標序列為軌跡（含時間、速度、方位），可匯出與重播。

### 非目標
- 繞過 Play Integrity / SafetyNet 偵測：技術上不可行，且不在合法用途內。
- 不需 root；僅靠 Android 官方 `LocationManager` test provider。
- 不做地圖供應商抽象層的多後端支援；MapLibre 專一。

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
- **路徑來源**：手動點選航點、匯入 GPX/KML、複製自歷史軌跡。
- **速度設定**：步行 5、騎車 20、開車 60 km·h⁻¹ 預設；自訂值。
- **抖動（jitter）**：可選，加入小幅度隨機偏移與速度波動，降低機械感。
- **移動引擎**：固定 tick（建議 1 Hz）沿線段做線性插值，計算 bearing、distance、ETA。
- **模式**：單次、循環、來回（A→B→A）。
- **控制**：開始 / 暫停 / 繼續 / 停止 / 跳到下一航點。
- **路徑型態**：MVP 為直線插值；未來可接 OSRM 或 GraphHopper 做沿道路。

### F3 記錄與軌跡
- 錄製真實 GPS 或目前 mock 輸出。
- 軌跡列表：名稱、時間、距離、平均速度、來源（REAL / MOCK）。
- 重播：將任一軌跡作為 F2 的路徑來源。
- 匯出 / 匯入：GPX、KML、JSON。

---

## 4. 系統架構

### 模組分層

```
app/
├─ core/
│  ├─ location/   MockProviderManager, MovementEngine, LocationService
│  ├─ data/       Room (routes, tracks), GpxKmlIo, repositories
│  └─ map/        MapLibre 元件封裝（MapView in AndroidView）
└─ feature/
   ├─ map/        主畫面：地圖、控制列、即時狀態
   ├─ routes/     路徑列表 / 編輯 / 匯入
   ├─ tracks/     錄製 / 重播 / 匯出
   └─ settings/   權限與「選為模擬位置 App」引導
```

> 一律使用單一 Gradle module（`:app`）下的 package 切分；待規模成長到值得拆 module 再拆。

### 主要元件職責

| 元件 | 職責 |
|---|---|
| `MockProviderManager` | 包 `LocationManager` 的 test provider 生命週期；提供 `setLocation(LatLng, speed, bearing, accuracy)` |
| `MovementEngine` | 純 Kotlin、不依 Android Framework；輸入路徑+速度+模式，輸出 `Flow<MockSample>` |
| `LocationService` | Foreground Service；橋接 `MovementEngine` 與 `MockProviderManager`，處理通知與生命週期 |
| `TrackRecorder` | 訂閱真實或 mock 位置流，寫入 Room；批次 flush 降 IO |
| `GpxKmlIo` | 純函式式匯入匯出（Streaming，避免大檔案 OOM） |

### 資料模型（Room）

```kotlin
@Entity Route(
  id: Long, name: String, createdAt: Instant
)
@Entity Waypoint(
  id: Long, routeId: Long, order: Int, lat: Double, lng: Double
)
@Entity TrackSession(
  id: Long, name: String, startedAt: Instant, endedAt: Instant?,
  source: Source  // REAL or MOCK
)
@Entity TrackPoint(
  id: Long, sessionId: Long, time: Instant,
  lat: Double, lng: Double, speed: Float, bearing: Float, accuracy: Float
)
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
   （可選）TrackRecorder.write(sample)
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
4. 健康檢查：偵測是否已被選為 mock app，未通過則顯示提醒。

### 主畫面（地圖）
- 中央地圖（MapLibre）。
- 底部控制列：模式切換（單點 / 路徑）、開始 / 停止、速度。
- 浮動狀態：當前 mock 座標、執行中徽章。

### 路徑編輯
- 點選地圖加航點、長按拖曳、刪除、排序。
- 顯示總距離、預估耗時。
- 儲存為 `Route`。

### 軌跡
- 列表卡片含縮圖（用 MapLibre static snapshot 或自繪 path）。
- 詳細頁：地圖預覽、統計、匯出按鈕、「以此為路徑播放」。

---

## 9. 實作里程碑

| Phase | 範圍 | 驗收條件 |
|---|---|---|
| **P0** | Gradle 整理：`minSdk` 由 35 降至 29、加入 `libs.versions.toml` 條目、建立模組 package 骨架 | 編譯通過、空殼 service 可啟動 |
| **P1** | `MockProviderManager` + `LocationService` + 通知 + 單點 mock；不含 UI | 由測試 / 假頁面觸發後，系統地圖看到位置移動 |
| **P2** | 地圖 UI、權限引導、健康檢查、點選設位置 | 端到端 happy path 可用 |
| **P3** | `MovementEngine`（直線插值）+ 多航點 + 速度 + 暫停/繼續 | 可沿路徑自動移動 |
| **P4** | Room schema + `TrackRecorder` + GPX 匯出 / 匯入 | 軌跡可錄、可存、可讀回 |
| **P5** | 軌跡重播 + 模式（循環 / 來回）+ 抖動 | 重播任一軌跡作為 mock 來源 |
| **P6** | 設定、UX 打磨、ProGuard 規則、release build | 可裝可用之 release apk |

> 每個 Phase 結束時補充對應的單元測試（特別是 `MovementEngine`，純 Kotlin 易測）與 instrumentation test（service 生命週期）。

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

---

## 12. 風險與限制

| 風險 | 說明 | 因應 |
|---|---|---|
| Play Integrity 偵測 | 銀行、部分遊戲會拒絕 mock | 文件清楚標示限制，不主打規避 |
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
