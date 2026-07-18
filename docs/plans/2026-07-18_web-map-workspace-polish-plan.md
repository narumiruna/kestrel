## Goal

在 route inspector 去雜訊後，整理 Web Map workspace 的整體 hierarchy，讓 item picker、地圖與 inspector 各自有清楚責任，並降低盒中盒、控制項散落、選取不明與窄版上下文切換成本。成功條件是主要地圖操作保持突出、面板與控制可辨識且可收合、Places／Routes 用詞一致，所有既有 capability 仍有淺層且有標籤的入口。

## Context

- Desktop 同時顯示左 picker、中央 MapLibre、右 inspector，以及散布於四周的 panel、focus、fullscreen、zoom、fit、style controls。
- 左側 selected item 主要靠淡背景／border；大量 card、border、radius 與 shadow 使 selection、interaction boundary、裝飾邊界難以區分。
- UI 同時使用 Places 與 favorites 描述可加入 route 的保存位置，可能讓使用者不確定兩者是否相同。
- `Stage.tsx` 已提供 Map／Choose／Edit mobile modes、左右 panel collapse 與 Focus map；本計畫應改善既有架構，不建立另一套 navigation。
- 本計畫依賴 `2026-07-18_web-route-inspector-declutter-plan.md` 完成或至少先確定其 DOM/scroll ownership，避免兩個 PR 同時改動 route inspector CSS。

## Non-Goals

- 不改 Map／Library 的既定責任分工，不把完整 editor 放回 Library。
- 不改 backend、Android、MapLibre provider、route/place schema 或遠端控制行為。
- 不以自動收合面板取代使用者選擇；任何 focus/panel state 都必須可逆並保留 draft。
- 不移除 keyboard help、Scale、map style、fit、zoom、fullscreen、Share、Device 或 account controls。

## Plan

- [ ] 先建立 desktop/mobile control inventory，為每個 Map workspace element標記 primary、supporting、contextual、advanced 或 redundant，並把接受的 grouping 與 terminology 寫入本計畫；以 code review 對照 `Stage.tsx`、`map/page.tsx`、cartographer components 與實際 screenshots，確認沒有無 owner 的 action 後再實作。
- [ ] 在 Playwright 增加 Map workspace regression：panel controls 的 accessible name/state、Focus map 的可逆性、draft/selection 在 collapse 與 mobile Map／Choose／Edit 切換後保留、所有 map controls 可達；以 focused `desktop-light`／`mobile-light` tests 先紅後綠驗證。
- [ ] 整合 map controls 的視覺分組：panel visibility 控制靠近各自 panel edge，viewport controls（zoom/fit/fullscreen）形成一組，map appearance 保持一個清楚標示的次要入口；不移除既有 aria label、tooltip 或 keyboard shortcut；以 pointer/keyboard smoke 與 `1440×900`、`1024×768` screenshots 驗證。
- [ ] 強化左 picker 的 selection hierarchy：用單一 accent cue、字重與 spacing 表示 active item，降低未選 rows 的 card/shadow 強度，保留 route/place 核心 metadata 且不增加 CTA；以 selected、unselected、hover、focus、50-item dense fixture 的 screenshot/contrast review 驗證。
- [ ] 簡化 workspace containers：盤點 `FieldNotebook`、`IndexCard`、section、form control 的 nested border/radius/shadow，只在 selection、interactive boundary、modal scope 或 sticky layer 保留邊界，其他以 spacing、alignment、background hierarchy 取代；以 before/after screenshots 及 focus ring 不被裁切的 geometry checks 驗證。
- [ ] 統一 `Places`／`favorites` 用詞：若 favorites 即 saved Places，所有 route-add、empty state、search 與 help copy 採 `Saved places` 或產品既有 accepted term；若程式 evidence 顯示概念不同，保留兩詞並在入口補一句關係說明；以 `rg` copy audit 與 Places→Route append browser smoke 驗證。
- [ ] 檢查 metadata、disabled、selected、focus 與 map-overlay 文字在 cream palette／dark theme 的對比，修正低對比 token而不增加無功能色彩；以 axe、計算後的 WCAG contrast evidence、light/dark screenshots 驗證，重要狀態不得只靠顏色。
- [ ] 微調 responsive workspace：維持 mobile 單一主要 region 的 Map／Choose／Edit 模式，確保 selected identity、dirty state 與 Save 在切換後不遺失；在 tablet 避免兩側面板把地圖壓成不可操作窄欄；以 `390×844`、`768×1024`、`1024×768`、`1440×900`、200% text 與長 CJK/English labels 驗證。
- [ ] 執行 browser與quality gates並記錄 URL、viewport、state、screenshot path；至少檢查 `/dashboard/map?kind=routes`、`/dashboard/map?kind=places` 及 Focus map/mobile modes，並以 `just check`, `just lint`, `cd web && npm run typecheck`, `cd web && npm run build`, `cd web && npm run test:ui`, `git diff --check` 全數通過驗證。

## Risks

- 將 controls 聚類可能改變熟悉的位置；保留 icon、label、shortcut 與可預期 panel edge，並以 task smoke 比較操作步數。
- 減少 borders/shadows 可能讓 interactive boundaries 不清楚；hover、focus、selected 與 modal scope 必須仍有非顏色單一線索。
- Tablet 若自動隱藏面板可能造成上下文消失；優先使用可見 collapse affordance，除非 viewport 無法容納才採明確 responsive default，且不覆寫使用者當次選擇。
- terminology 改動會影響 tests、help copy 與使用者既有認知；只在 domain evidence 確認同義時統一。

## Completion Checklist

- [ ] Picker、map、inspector 的責任與 action priority 已由 control inventory、DOM hierarchy 與 accepted screenshots 驗證。
- [ ] Panel、viewport、appearance controls 已形成可辨識群組，且 keyboard、tooltip、accessible name、state 與 shortcut 均由 Playwright/DOM review 驗證。
- [ ] 左 picker 的 selected/focus 狀態在 light/dark 與 dense list 中清楚但不依賴單一顏色，已由 screenshots、focus smoke 與 contrast evidence 驗證。
- [ ] Nested decorative containers 已減少，interaction/modal/sticky boundaries 仍明確，已由 before/after browser review 與 focus-ring geometry checks 驗證。
- [ ] Places／favorites terminology 已依產品語意統一或明確區分，已由 copy audit 與 saved-place-to-route flow 驗證。
- [ ] Desktop、tablet、mobile、200% text 與長內容均保留 map usability、selection、draft、dirty state 與可逆 panel modes，已由指定 viewport screenshots/interactions 驗證。
- [ ] Light/dark accessibility review沒有新增 axe violation、低於門檻的重要文字對比或 color-only status，已由 automated與人工 evidence 驗證。
- [ ] 所有 required quality gates 已由 `just check`, `just lint`, Web typecheck/build/UI tests 與 `git diff --check` 的成功輸出驗證。
