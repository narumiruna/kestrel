# AGENTS.md

## 適用範圍與專案概況

本檔適用於整個 Kestrel 儲存庫；更接近工作目錄的 `AGENTS.md` 優先。不要修改 `node_modules/`、建置輸出或其他第三方／產生檔。

Kestrel 是不需 root 的 Android 模擬定位應用程式，並包含雲端同步與遠端控制平台：

- `app/`：Kotlin、Jetpack Compose、Material 3、MapLibre Native。
- `backend/`：NestJS、Prisma、PostgreSQL。
- `web/`：Next.js、React、Radix Themes、MapLibre GL。
- `docs/`：操作、安全性、API 與實作計畫。

## 作業授權

- 回答、說明、檢視、診斷或規劃時，先檢查並回報；除非使用者要求，否則不要實作。
- 變更、建置或修正時，進行範圍明確的本機修改，並執行相關且非破壞性的檢查。
- 外部寫入、push／merge／release／deploy、正式環境操作、資料庫異動、實體裝置狀態變更，以及刪除或覆寫資料前，必須取得明確同意。
- 每個指令或工具呼叫最多執行 180 秒；預估較久時，拆成可觀察、可中止的步驟。

## 主要結構

- `app/src/main/java/dev/narumi/kestrel/`
  - `core/data/`：DataStore Preferences 與序列化結構。
  - `core/library/`：Room 本機資料庫與資料庫同步模型。
  - `core/cloud/`：登入、同步、裝置與遠端控制。
  - `core/location/`：座標、路線引擎、`LocationService` 與 mock provider。
  - `core/map/`：MapLibre Compose 封裝與地圖樣式。
  - `feature/map/`、`feature/favorites/`、`feature/options/`：三個主要頁籤。
- `backend/src/`：驗證、帳號安全、資料庫、圖書館、分享、同步與遠端控制。
- `backend/prisma/`：Prisma schema 與不可省略的版本化 migration。
- `web/app/`：Next.js App Router 頁面與 API proxy；共用元件位於 `web/components/`。
- `docs/plans/`：進行中計畫；已完成或取代的計畫放在 `docs/plans/archived/`。

## 工具與指令

優先使用 `justfile` 已有的 recipe。Android／Gradle 統一使用 Java 26；CI 的 Backend 與 Web 使用 Node.js 22。首次執行或 lockfile 更新後，先在對應工作區執行 `npm ci`。

| 工作 | 指令 |
|---|---|
| Android debug APK | `just android-build`（或 `just build`） |
| Android 格式檢查 | `just android-check` |
| Android Detekt | `just android-lint` |
| Android JVM 單元測試 | `just android-test`（或 `just test`） |
| Android Compose 截圖驗證 | `just android-ui` |
| Android + Web 自動格式化 | `just format` |
| Android + Web 格式／lint 檢查 | `just check`、`just lint` |
| Backend 全套檢查 | `cd backend && npm run lint && npm run test && npm run test:e2e && npm run typecheck && npm run build` |
| Prisma client | `cd backend && npm run prisma:generate` |
| Web 型別與建置 | `cd web && npm run typecheck && npm run build` |
| 本機雲端服務 | `just cloud-up`、`just cloud-down` |
| 安裝 Git hooks／檢查全部追蹤檔 | `just hooks`、`just hooks-all` |

注意：

- `just format`、`just check`、`just lint` 不涵蓋 Backend；Backend 格式化另用 `cd backend && npm run format`。
- `just build` 只建置 Android，不代表三個工作區都已驗證。
- 小型 Android 修改可先用 `./gradlew :app:testDebugUnitTest --tests '<完整測試類別名稱>'` 跑最窄測試，完成前再跑 `just android-test`。
- 純 Kotlin 測試放 `app/src/test/`；需要 Android Context 的測試放 `app/src/androidTest/`。
- 瀏覽器行為與畫面使用 Chrome DevTools 驗證，不要使用 Playwright。驗證截圖放在儲存庫外，不要把新的或更新後的二進位影像檔納入 Git 變更。

## 程式碼與資料規則

### Android

- 使用 Spotless + ktlint；保留 trailing comma。Detekt 的重要限制為 `ReturnCount` 最多 4、`LongMethod` 最多 80 行。
- DataStore 序列化結構必須向前相容：維持 `Json { ignoreUnknownKeys = true }`，新增欄位使用可為 null 且有預設值的形式（例如 `T? = null`）。
- Place、Route 與圖書館項目以穩定 ID（例如 `libraryItemId`）識別；`name` 只供顯示且可重複。
- UI 判斷 mock 執行狀態時，收集 `LocationService.runtimeState`；不要從 Compose 的區域 `remember` 狀態反推服務狀態。
- 以單一動作取代執行中的 mock；不要先呼叫 `LocationService.stop()` 再立刻呼叫 `setLocation()` 或 `startRoute()`，以免 foreground service 發生 start-id 競爭。
- `MovementEngine` 的模式為 `Once`、`Loop`、`PingPong`；`RouteGenerator` 的種子輸入必須可重現結果。

### Backend 與資料庫

- 修改 `backend/prisma/schema.prisma` 時，同步新增可檢閱的 migration，執行 `npm run prisma:generate` 與相關 Backend 檢查；不要手動改寫既有 migration。
- Prisma migration 沒有自動 down migration。正式環境 migration、還原或 `prisma migrate resolve` 必須依 `docs/operations.md`，並先取得同意與可驗證備份。
- 驗證、session、refresh token、TOTP、同步與遠端指令屬安全敏感路徑；保留重試安全性、冪等性、撤銷與到期語意。
- 日誌不得包含 Authorization header、request body、query string、密碼、refresh token、TOTP、精確位置 payload 或其他祕密。

### Web 與 UI／UX

- Web UI 一律使用 Radix UI 官方套件：Primitives（`radix-ui`）處理底層互動元件、Colors（`@radix-ui/colors`）管理色彩、Themes（`@radix-ui/themes`）建立元件與版面、Icons（`@radix-ui/react-icons`）提供圖示。不要混入第二套 UI 元件、primitive、色彩或圖示套件；Radix 已有對應圖示時，不要自行繪製重複的 SVG。
- Android 與 Web 都只使用 MapLibre；不要新增第二個地圖後端。
- 降低單一畫面的資訊與操作密度，清楚呈現主要任務與下一步。以漸進揭露收納次要、低頻或進階功能，但入口仍須容易發現、命名清楚且結果可預期。
- 新增 CTA、導覽或模式切換前，先確認既有流程是否已提供相同能力；不要用功能重複或額外點擊換取表面簡化。
- Web 地圖 marker 的定位由 MapLibre 管理；不要以全域 `button` 樣式或 `position` 覆寫 marker 的尺寸與絕對定位。

## 破壞性與外部操作

- `just reset`、`pm clear`、uninstall、可能重裝應用程式的流程，以及 connected instrumentation，可能清除手機上的 favorites、preferences 與 mock state。執行前明確說明風險並取得同意；需要保留資料時先用 `adb shell run-as` 備份 DataStore。
- `just br`／`just install`／`just run` 會改變連線裝置狀態；不要在未確認目標裝置與使用者意圖時執行。
- 正式部署只能使用 `compose.deploy.yaml`；`compose.dev.yaml` 含 watch process、開發用祕密與原始碼 bind mount，不得用於正式環境。
- Android release 必須具備四個 `KESTREL_RELEASE_*` 環境變數；不得削弱簽章檢查或發布未簽章 APK。

## 工作流程與 Git

- 大型、跨工作區或有 migration／安全性／生命週期風險的變更，先新增或更新 `docs/plans/<主題>-plan.md`。計畫至少包含目標（Goal）、計畫（Plan）與完成檢核（Completion Checklist）；完成後勾選並移至 `archived/`。
- 不要為了關閉計畫而把未完成項目移到 backlog 或其他計畫；只有使用者明確要求時才能重新劃分範圍。
- 只 stage 預定檔案，不要使用 `git add -A`。不得使用 `--no-verify`。
- Commit message 使用 Conventional Commits；除非使用者明確要求，不要加入 `Co-Authored-By` 或其他代理程式署名。
- Push 前執行所有受影響工作區的相關檢查；`just check && just lint` 不能取代 Backend 測試、型別檢查與建置。

## 產品與安全界線

- 不要繞過 Play Integrity 或 SafetyNet。
- 不要實作軌跡錄製，或 GPX／KML 匯入匯出。
- Mock GPS 仍要求使用者在 Android 開發人員選項中選取 Kestrel；不要宣稱能規避系統或第三方偵測。

## 專案記憶

`docs/MEMORY.md` 不會自動載入。進行非簡單的除錯、設計、工作流程或安全性修改前先讀取；以目前程式碼與設定為準。只記錄可重用且已驗證的 `GOTCHA` 或持久偏好 `TASTE`，保持簡短，不寫任務歷程、推測、憑證或其他機密。
