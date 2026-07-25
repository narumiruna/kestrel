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
- `docs/plans/` — 目前規劃與 backlog；新增計畫用 `*-plan.md`，完成後再更新 checkbox

## Style 與工具

- Android / Gradle 統一使用 Java 26；本機設定 `JAVA_HOME`，CI / release workflow 也必須固定 Java 26。
- 格式化：spotless + ktlint。trailing comma 必加。Edit 後若 hook fail，跑 `just format` 再 commit。
- 靜態分析：detekt（`detekt.yml` + `detekt-baseline.xml`）。重點規則：
  - `ReturnCount` max = 4 — 函式最多 4 個 return；超過要重構（多用 elvis chain）
  - `LongMethod` threshold = 80
  - `MagicNumber`、`MaxLineLength`、`WildcardImport` 都關掉
  - `FunctionNaming` 對 `@Composable` / `@Preview` 不檢查（PascalCase OK）
- DataStore schema 變更要保持向前相容：`Json { ignoreUnknownKeys = true }` 已開；新欄位用 `T? = null` 預設。
- pre-commit hooks（prek）：spotless、end-of-files、trailing whitespace、merge conflicts、mixed line endings。NEVER `--no-verify`。

## UI/UX 原則

- 優先降低單一畫面的資訊與操作密度，讓主要任務與下一步清楚可辨；避免同時呈現過多元素、CTA 或功能，以減少使用者的認知負荷。
- 這不代表刪除或弱化功能。保留完整能力，並以漸進揭露（progressive disclosure）將次要、低頻或進階操作收納到符合情境的位置，例如次級頁面、overflow menu、dialog 或可展開區塊。
- 被收納的功能仍須容易發現、理解與使用：入口命名清楚、位置符合使用情境、導覽結果可預期。不可為追求極簡而讓功能難找，或增加不必要的操作步驟。
- 新增畫面元素或操作入口前，先確認現有導覽或操作是否已涵蓋相同目的；避免重複 CTA 與功能重疊。

## 領域注意事項

- Mock GPS 需要 dev options 開「Select mock location app」指到本 app；UI 用 `StatusBanner` 顯示是否有權限。
- `LocationService` 是 foreground service；切換 mock 模式之前要先 `LocationService.stop()`，不然可能 mid-route 殘留。
- `MovementEngine` 三種模式：Once / Loop / PingPong。`RouteGenerator` 用種子可重現。
- Favorites / library items 以 stable `libraryItemId` 為 identity；`name` 只作顯示，可同名。

## 工作流程

- 任何單一執行任務（command / tool call）都不可超過 3 分鐘；預估較久的工作必須拆成可觀察、可中斷的步驟，每一步設定不超過 180 秒的 timeout。
- 大改動先寫/更新 `docs/plans/<topic>-plan.md`，再拆 PR 實作。Plan 必須有 Goal / Plan / Completion Checklist；做完同步 checkbox。
- `docs/plans/2026-05-10_engineering-backlog-plan.md` 的小項目適合零碎時間做；做完打 `[x]`。
- Git：不要 `git add -A`，只 stage 改動的檔案。Commit message 用 conventional 風格 + `Co-Authored-By` trailer。push 之前先 `just check && just lint`。

## 不要做

- 不要繞過 Play Integrity / SafetyNet。
- 不要引入第二個地圖後端（專一用 MapLibre）。
- 不要做軌跡錄製 / GPX KML 匯入匯出（已決定不做）。

## MEMORY.md

- `docs/MEMORY.md` is not auto-loaded. Check it before non-trivial debugging or design work when prior project context may matter.
- Keep entries short and reusable.
- `MEMORY.md` must use `## GOTCHA` and `## TASTE` sections.
- After a non-trivial error or discovery, add one concise entry if it will help future work.
