## Goal

為 Kestrel Android 與 Web 的高風險 UI 狀態建立可重複的視覺回歸與無障礙驗證，讓後續 Compose/CSS 調整能自動偵測 hierarchy、overflow、focus、label 與 dark-mode regression，而不依賴會清除真機資料的 connected test。

## Context

Web 目前沒有 Playwright/visual-test dependency；Android 已有 Compose UI test dependency，但沒有 screenshot baseline。過去驗收主要靠手動 browser/emulator 截圖，容易在後續變更後失效。此計畫應在 Options、Favorites、Web mobile Library 三個 UI 計畫完成後建立穩定 baselines。

## Unknowns

- Android screenshot runner 要選 JVM-based renderer、官方 Compose screenshot plugin，或 CI emulator instrumentation；第一步必須以 AGP 9.2.1、Kotlin 2.4、Java 26 相容性與不碰實體裝置資料為準做 bounded spike。
- Web MapLibre screenshot 在 CI 是否需要 SwiftShader flags；以現有本機 workaround 與一個 CI spike決定，不預設普通 headless WebGL 一定可靠。

## Non-Goals

- 不在 primary physical device 執行會 reinstall/clear data 的 connected tests。
- 不追求每個元件像素 snapshot；只覆蓋高風險 workspace、狀態與 breakpoint。
- 不以 screenshot 取代 interaction、semantic、unit 或 recovery tests。

## Plan

- [x] 比較 Android screenshot 選項並寫一頁 decision record，實際跑一個 `KestrelCard`/Map status spike；以 Java 26/AGP/Kotlin compatibility、單次 <180 秒、CI 可重現與不需實體裝置作為 acceptance。
- [x] 建立 Android golden cases：Map setup/idle/playing、Favorites empty/list、Options collapsed/expanded，覆蓋 320/常用寬度、light/dark 與大字體；以 committed baselines、deterministic fixtures 與 screenshot task 通過驗證。
- [x] 為 Android 補 semantics tests：primary action label、setup step、disclosure expanded state、overflow accessible name、非單靠顏色的 status text；以 isolated Compose tests 或最低可行 presentation tests 驗證。
- [x] 導入固定版本的 Playwright 與 Web test scripts，建立 dev/test auth fixture與可清理資料；以 `/login`、Map、Library、public Share 在 CI 可重跑為驗證，且不得污染 production/deploy stack。
- [x] 建立 Web screenshot matrix：390×844、1200×792、light/dark、Map/Choose/Edit、Library empty/dense、auth與share；MapLibre case依 spike決定 SwiftShader或非像素 DOM/geometry fallback。
- [x] 加入 Web accessibility assertions：no horizontal overflow、visible focus、dialog label/focus return、44px targets、noncolor status、reduced motion、200% zoom equivalent、RTL與 keyboard shortcuts；以 Playwright assertions 與 bounded screenshots 驗證。
- [x] 將 Android/Web visual jobs接入 CI，分開 cache與 artifact，上限/timeout符合每個 command不超過180秒；以一次 clean CI run及故意改壞 baseline的 red/green proof 驗證。
- [x] 更新 `justfile` 與 README，提供 baseline verify/update 指令，明確標示任何可能清資料的 instrumentation path；以 `just --list`、docs review與 clean checkout smoke驗證。

## Risks

- Pixel baselines可能因字型、GPU、Map tiles不穩定；固定 fonts/locale/data，MapLibre無法 deterministic時以 DOM geometry與 overlay snapshots代替 tile pixels。
- Screenshot update容易掩蓋 regression；baseline update必須輸出 diff artifact並要求人工 review。
- 新 test stack可能讓 CI 超過三分鐘單步限制；拆成可觀察 jobs/tasks並使用 dependency/browser cache。
- Android instrumentation可能安裝測試 APK；預設僅用 CI emulator，若要碰實體裝置必須先取得明確同意與備份。

## Completion Checklist

- [x] Android screenshot方案有相容性 decision record與可重現 golden task；以 clean checkout/CI evidence驗證。
- [x] Android Map、Favorites、Options 的核心狀態具 light/dark、窄寬與大字體 baselines，semantics tests 同時通過。
- [x] Web Playwright matrix覆蓋 auth、Map、Library、Share 的窄/寬與 light/dark，且 interaction/a11y assertions通過。
- [x] MapLibre、font、locale、fixture與時間來源已穩定化或採用明確 fallback，沒有已知 flaky baseline。
- [x] CI 能在每步180秒內驗證並上傳失敗 diff artifacts；以成功 run與一次 red/green proof驗證。
- [x] README/just recipes清楚區分 verify/update與任何 destructive instrumentation，並由 clean checkout smoke驗證。

## Evidence

- Decision record：`docs/design/ui-regression-testing.md`；Android committed references：7；Web committed references：13。
- Local green：Android screenshot validate、focused semantics presentation tests，以及 Web mobile-light/desktop-light/desktop-dark Playwright projects 全數通過。
- Red/green proof：暫時破壞 Options reference 時 `validateDebugScreenshotTest` 失敗，還原後同 task 通過。
- CI workflow 已加入 Android/Web screenshot validation、170 秒 command timeout 與 failure artifacts；clean run [29435714884](https://github.com/narumiruna/kestrel/actions/runs/29435714884) 的 Android、Web、Backend jobs 全數通過。
