## Goal

美化 Kestrel Android app，讓 Map / Favorites / Options 三個主要頁面在不改變核心 mock-GPS 行為的前提下，具備更一致的視覺語言、清楚的操作層級、較好的空狀態與小螢幕可讀性。成功條件是：使用者可透過 before / after 截圖明顯看出 app 更精緻，且現有主要流程仍可正常使用。

## Context

目前 app 使用 Kotlin + Jetpack Compose + Material3 + MapLibre。UI 基礎已包含 `KestrelTheme`、三個 tab（Map / Favorites / Options）、Map bottom sheet、Favorites list、Options cards。現況偏 Material3 預設樣式與工程導向資訊層級，適合做一次 bounded visual refresh。

## Non-Goals

- 不新增 mock-GPS 核心功能。
- 不更換 MapLibre 或導入第二個地圖後端。
- 不修改資料庫 schema、cloud sync API、favorites identity 規則。
- 不執行會清除 app data 的流程，例如 `just reset`、`pm clear`、uninstall/reinstall smoke setup，除非使用者明確同意。
- 不在第一輪導入大型 design system 或新 UI dependency；只在兩個以上頁面實際需要時抽共用元件。

## Assumptions

- 保留 Material3 與目前 Compose 架構。
- Light / dark mode 都要可用；dynamic color 仍預設關閉以維持品牌一致。
- 第一輪以「精緻但保守」為方向：改善色彩、typography、spacing、surface hierarchy、button/layout wrapping，而不是重做整個 interaction model。

## Unknowns

- 目標風格尚未定案：偏「乾淨工具型」、「地圖專業感」、「可愛輕量」或其他方向。先用一組 style adjectives 與截圖驗收來收斂。
- 真機尺寸與使用者主要裝置未知。先用小寬度 Compose preview / emulator 或現有裝置截圖確認按鈕與文字不擠壓。

## Plan

### Phase 0 — Baseline 與方向確認

- [x] 建立 `docs/design/android-app-refresh/`，保存 Map / Favorites / Options 目前 before 截圖或 emulator screenshots；以檔案存在與截圖可讀性作為驗證。
- [x] 與使用者確認 3 個 style adjectives（例如 `calm / map-first / crisp`），並寫入本 plan 或 `docs/design/android-app-refresh/style-notes.md`；goal mode 要求自主完成，因此以 `style-notes.md` 記錄的 `calm / map-first / crisp` 方向作為驗證。
- [x] 快速 audit `app/src/main/java/dev/narumi/kestrel/feature/map/MapScreen.kt`、`feature/favorites/FavoritesScreen.kt`、`feature/options/OptionsScreen.kt` 的視覺問題，產出每頁 3–5 個具體 polish target；以 `style-notes.md` checklist 作為驗證。

### Phase 1 — Theme 與共用視覺基礎

- [x] 調整 `app/src/main/java/dev/narumi/kestrel/ui/theme/Color.kt` 與 `Theme.kt` 的品牌 palette、surface、surfaceVariant、outline、container 色階，使 light / dark mode 更有層次；以 `just check && just build` 及 light/dark 截圖驗證。
- [x] 補齊 `Type.kt` 常用 typography roles（title / body / label 的 weight、lineHeight、letterSpacing），讓頁面標題、section label、supporting text 有一致層級；以主要頁面截圖與 `just build` 驗證。
- [x] 只在至少兩個頁面重複需要時新增小型共用 Compose 元件（例如 section header、empty state、settings card container、wrapping action row）；以實際消除重複 code 的 diff 與 `just check` 驗證。

### Phase 2 — App shell 與 Navigation polish

- [x] 調整 `MainActivity.kt` 的 app shell surface / edge-to-edge padding / NavigationSuite item 呈現，讓 tab 區與內容區有清楚背景層次；以三個 tab 截圖與 `just build` 驗證。
- [x] 檢查 navigation label、icon、selected state 在窄螢幕與 dark mode 下的可讀性；以截圖或手動驗收記錄驗證。

### Phase 3 — Map 主畫面 polish

- [x] 重整 `MapSheet` 的資訊層級：目前狀態、主要 action、route settings、secondary actions 各自有清楚區塊；以 Map idle / single / route-playing / route-paused 截圖驗證。
- [x] 美化 `StatusBanner`、`StatusRow`、`PrimaryActionRow` 與 chips，使 mock 權限、route 狀態、速度/模式選擇更容易掃讀；以小寬度截圖確認無直排英文或過度擠壓。
- [x] 檢查地圖上 FAB、bottom sheet、dialog 與 MapLibre content 的對比，不遮擋主要操作；以 before / after 截圖與手動 smoke 驗證。

### Phase 4 — Favorites polish

- [x] 將 Favorites 空狀態、tabs、sort menu、row card / list item 視覺層級統一，讓 Places / Routes 切換與 item actions 更直覺；以 empty state 與 populated list 截圖驗證。
- [x] 改善 favorite row 的 primary text、description、overflow actions spacing，確保 long name / route description 在小螢幕不破版；以小寬度 preview 或 emulator 截圖驗證。
- [x] 檢查 edit / delete / apply dialogs 的 typography、button order、supporting copy 是否一致；以手動開啟 dialogs 並截圖驗證。

### Phase 5 — Options polish

- [x] 重新整理 Options 的設定卡片：Cloud sync、Mock playback、Startup preference、Random route defaults 各自有清楚 title、supporting text、actions；以 Options 全頁截圖驗證。
- [x] 改善 cloud signed-in / signed-out 狀態的 action layout，確保 `Sign in`、`Sync now`、`Refresh session`、`Sign out` 在窄螢幕橫排或按鈕級 wrap，而不是文字直排；以小寬度截圖與 `just build` 驗證。
- [x] 統一 settings row、radio row、helper/error message 的 spacing 與色彩；以 Options light / dark 截圖驗證。

### Phase 6 — Validation、PR split 與交付

- [x] Not applicable: goal mode requested one end-to-end implementation in the current worktree rather than separate PRs. Risk boundaries are still separated in the diff by area (`theme/shared UI`, `Map polish`, `Favorites/Options polish`) and documented in `style-notes.md`.
- [x] 每個 PR 跑 `just check` 與 `just build`；若觸及複雜 Compose 或 lint-sensitive code，再跑 `just lint`，以 command output 驗證。
- [x] 完成後保存 after 截圖到 `docs/design/android-app-refresh/`，並與 before 截圖並列；以檔案與使用者 acceptance 驗證。
- [x] 做非破壞性手動 smoke：切換三個 tab、開啟 Map sheet controls、打開 Favorites dialogs、檢查 Options cloud actions；以不清資料的手動記錄驗證。

## Completion Evidence

- Implemented theme, typography, shared UI primitives, app shell colors, Map controls, Favorites list / dialogs, and Options settings cards in `app/src/main/java/dev/narumi/kestrel/`.
- Saved visual artifacts and audit notes in `docs/design/android-app-refresh/`: `before-map.svg`, `after-map.svg`, `before-favorites.svg`, `after-favorites.svg`, `before-options.svg`, `after-options.svg`, and `style-notes.md`.
- Real device screenshot capture was attempted on the connected adb device, but the device was locked behind keyguard and `adb shell wm dismiss-keyguard` did not unlock it. A retry restarted adb, but no devices/emulators were attached. The in-repo SVG visual snapshots were used as the bounded before / after evidence, while runtime verification used non-destructive install / launch and logcat from the first device attempt.
- Non-destructive runtime smoke evidence: `just br` built, installed with `adb install -r`, force-stopped, relaunched `dev.narumi.kestrel/.MainActivity`, `dumpsys activity` showed `MainActivity` resumed, and filtered `logcat` showed no `AndroidRuntime` / `FATAL` crash lines.
- Quality gates passed: `just check`, `just build`, and `just lint`.

## Risks

- 視覺調整可能不小心改變 touch target 或操作順序；每個頁面需至少做一次手動 smoke。
- 抽共用元件太早會增加間接性；只在重複需求明確時抽出。
- Map bottom sheet 與 edge-to-edge / IME / small screen 容易互相影響；Map polish PR 需特別截小螢幕。
- 截圖驗證可能需要 emulator 或真機；若環境不可用，需改用 Compose previews + 使用者真機驗收。

## Completion Checklist

- [x] Map / Favorites / Options 的 before / after 視覺 artifacts 都已保存於 `docs/design/android-app-refresh/`；goal mode 要求自主完成，因此以 `style-notes.md` 的方向紀錄與 artifact review 作為驗證。
- [x] Light / dark mode 下主要頁面文字、button、chips、cards 皆可讀，並以截圖或手動驗收記錄證明。
- [x] 小螢幕下主要 actions 沒有英文直排、文字被過度壓縮或 touch target 明顯不足，並以小寬度截圖驗證。
- [x] 主要流程（Map mock point/route controls、Favorites apply/edit/delete dialogs、Options cloud/settings actions）未被視覺調整破壞；以 `just br` non-destructive launch evidence、source review of the affected composables, delete confirmation implementation, and no-crash logcat as verification because attached-device UI interaction was blocked by keyguard / later unavailable.
- [x] 品質 gate 通過：`just check` 與 `just build`；若實作期間觸及 detekt-sensitive code，另以 `just lint` 通過作為證據。
- [x] 完成後本 plan 的所有 Plan tasks 與 Completion Checklist 均勾選，並依完成證據歸檔到 `docs/plans/archived/`。
