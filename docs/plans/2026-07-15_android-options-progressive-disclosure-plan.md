## Goal

降低 Android `Options` 畫面的同時資訊量，讓使用者先看見目前設定摘要與最常用的啟動行為，再以一層具名展開操作進入 Map links、Mock playback、Random route、Cloud sync 與 Web remote control；所有現有能力、狀態與錯誤復原都必須保留。

## Context

目前 `OptionsScreen.kt` 依序完整呈現所有設定卡片，Cloud 登入、同步、remote control、playback write interval 與 random route defaults 會形成很長的單頁。主要任務是確認或修改 app 行為，而不是同時編輯每個進階欄位。

### Action priority

- **Primary:** 目前啟動位置與各 section 的設定摘要。
- **Secondary:** 展開並修改單一 section、儲存該 section。
- **Contextual/safety:** Cloud 錯誤、sync conflict、登入狀態與 remote-control readiness，發生時不可被收合隱藏。
- **Advanced:** API base URL、playback persistence cadence、random-route defaults。

## Architecture

- 保持 `OptionsScreen` 擁有 DataStore flows 與 section 狀態；展開/收合不得重建 repository 或重置尚未送出的 Cloud 表單。
- 建立可重用但範圍有限的 expandable options card，header 永遠顯示 title、摘要與清楚的 `Change` / `Done` 控制。
- Expansion state 使用 `rememberSaveable`；Cloud action loading/error/conflict state 必須留在 disclosure 外層或被 hoist，避免收合造成工作遺失。

## Non-Goals

- 不修改 DataStore schema、Cloud API、sync/remote-control 行為或預設值。
- 不把所有設定塞進單一模糊的 `Advanced` 區塊。
- 不新增第二套 navigation framework。

## Plan

- [x] 建立 Options section inventory，為 Startup、Map links、Playback、Random route、Cloud sync、Remote control 定義一行可辨識摘要與預設展開規則；以 `docs/` 設計表或純 presentation model 測試驗證每個狀態都有摘要。
- [x] 實作具 `expanded`、`onExpandedChange`、summary 與 semantics 的共用 Options disclosure card；以 Compose source review、`just android-check` 與窄寬 preview 驗證 target、label、focus/read order。
- [x] 將 Startup 保持直接可見，將 Map links、Playback 與 Random route 改為一層展開，並確保輸入值在收合/展開後不重置；以 focused JVM presentation tests 與手動 state transition 驗證。
- [x] 重構 Cloud/Remote section，使 signed-in/out、sync progress/error、conflict、remote readiness 永遠可理解，API URL 與登入/進階 controls 才收合；以 sign-in form draft、loading、error、conflict、enabled/disabled transition 驗證。
- [x] 驗收 320dp/常用手機寬度、大字體、dark mode、長文字與 TalkBack reading order；以 emulator/preview 截圖及不清資料的手動紀錄驗證。
- [x] 執行 `just android-check && just android-test && just android-build && just android-lint`；所有命令需在 180 秒內分段完成。

## Risks

- 條件式 composition 可能清掉 Cloud login draft；必須先確認 state ownership，再隱藏內容。
- 收合狀態可能藏住 sync conflict 或錯誤；安全/復原訊息必須能自動展開或留在 header 附近。
- 摘要若只顯示 `Configured` 會失去辨識價值；摘要需包含實際模式、秒數或登入/啟用狀態。

## Completion Checklist

- [x] Options 首屏只保留 Startup 與每個 section 的可辨識摘要，且每項進階能力一層可達；以 composable source、截圖與入口 inventory 驗證。
- [x] 展開/收合不會遺失 Cloud 表單或設定輸入，並以 transition 測試/手動紀錄驗證。
- [x] Loading、error、conflict、signed-out、remote-disabled 等重要狀態不會被 false simplicity 隱藏；以 state matrix 驗證。
- [x] 大字體、窄寬、dark mode 與 TalkBack reading order 可用；以 preview/emulator evidence 驗證。
- [x] Android formatting、tests、build、Detekt 全數通過，並附上 command output evidence。

## Evidence

- `OptionsSection.kt` 與 `OptionsPresentationTest.kt` 覆蓋六個 section、summary safety precedence 與 Startup-only default expansion。
- 七張 Compose screenshot references 包含 320dp、large text、dark mode 與 Options 收合/展開；source semantics 依畫面順序提供 Change/Done 與 Expanded/Collapsed state。
- 2026-07-15：`just android-check`、`just android-test`、`just android-ui`、`just android-build`、`just android-lint` 全數通過。
