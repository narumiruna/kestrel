# AGENTS.md

專案：Kestrel — Android mock-GPS app。Kotlin + Jetpack Compose + Material3 + MapLibre Native。

## 常用指令

優先用 `justfile`，不要直接打 gradle。

| 工作 | 指令 |
|---|---|
| build debug APK | `just build` |
| build + install + relaunch | `just br`（或 `just`） |
| 自動格式化（spotless + ktlint） | `just format` |
| 驗證格式化（不寫檔） | `just check` |
| detekt 靜態分析 | `just lint` |
| 重生 detekt baseline | `just lint-baseline` |
| 安裝 prek git hooks | `just hooks` |
| 跑全部 hooks | `just hooks-all` |
| 重置 app data（清 prefs / favorites / mock state） | `just reset` |
| logcat（過濾 Kestrel / MapLibre / LocationService） | `just log` / `just logf` |
| dump DataStore prefs（hex preview） | `just prefs` |

單元測試目前沒 just recipe；用 `JAVA_HOME=… ./gradlew :app:testDebugUnitTest`。如果要跑頻繁就在 justfile 加一條。

## 程式碼結構

- `app/src/main/java/dev/narumi/kestrel/`
  - `core/data/` — DataStore Preferences、`@Serializable` schema（`Preferences.kt`）
  - `core/location/` — `LatLng`、`Geo`、`MovementEngine`、`RouteGenerator`、`LocationService`、`MockProviderManager`、`CoordParser`
  - `core/map/` — `KestrelMap`（MapLibre Compose wrapper）、`MapStyle`
  - `feature/map/` — `MapScreen.kt`（主畫面，含底部 sheet）
  - `feature/favorites/`、`feature/options/`、`feature/settings/`、`feature/routes/`、`feature/tracks/`
  - `MainActivity.kt` — `NavigationSuiteScaffold`，三個 tab：Map / Favorites / Options
- `app/src/test/java/...` — JUnit 純 Kotlin 單元測試（Android Context 不能 instantiate；那種放 `androidTest/`）
- `.agents/docs/plan/` — phase 設計文件（先寫文件再實作；風格見 `phase-quick-jump-and-favorites.md`）
- `.agents/docs/TODO.md` — 依工程量分類的 backlog

## Style 與工具

- 格式化：spotless + ktlint。trailing comma 必加。Edit 後若 hook fail，跑 `just format` 再 commit。
- 靜態分析：detekt（`detekt.yml` + `detekt-baseline.xml`）。重點規則：
  - `ReturnCount` max = 4 — 函式最多 4 個 return；超過要重構（多用 elvis chain）
  - `LongMethod` threshold = 80
  - `MagicNumber`、`MaxLineLength`、`WildcardImport` 都關掉
  - `FunctionNaming` 對 `@Composable` / `@Preview` 不檢查（PascalCase OK）
- DataStore schema 變更要保持向前相容：`Json { ignoreUnknownKeys = true }` 已開；新欄位用 `T? = null` 預設。
- pre-commit hooks（prek）：spotless、end-of-files、trailing whitespace、merge conflicts、mixed line endings。NEVER `--no-verify`。

## 領域注意事項

- Mock GPS 需要 dev options 開「Select mock location app」指到本 app；UI 用 `StatusBanner` 顯示是否有權限。
- `LocationService` 是 foreground service；切換 mock 模式之前要先 `LocationService.stop()`，不然可能 mid-route 殘留。
- `MovementEngine` 三種模式：Once / Loop / PingPong。`RouteGenerator` 用種子可重現。
- Favorites 以 `name` 當 unique key；`addFavorite` 同名會覆蓋。Rename 時要檢查目標名稱衝突。

## 工作流程

- 大改動先寫 phase 文件到 `.agents/docs/plan/`，再拆 PR 實作。文件結構參考 `phase-quick-jump-and-favorites.md`：動機 / 範圍 / 設計 / 互動影響 / 實作步驟 / 風險 / 驗收條件。
- `.agents/docs/TODO.md` 的 quick wins 適合零碎時間做；做完打 `[x]`。
- Git：不要 `git add -A`，只 stage 改動的檔案。Commit message 用 conventional 風格 + `Co-Authored-By` trailer。push 之前先 `just check && just lint`。

## 不要做

- 不要繞過 Play Integrity / SafetyNet。
- 不要引入第二個地圖後端（專一用 MapLibre）。
- 不要做軌跡錄製 / GPX KML 匯入匯出（已決定不做）。
