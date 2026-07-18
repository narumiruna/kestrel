## Goal

在 route inspector 去雜訊後，整理 Web Map workspace 的整體 hierarchy，讓 item picker、地圖與 inspector 各自有清楚責任，並降低盒中盒、控制項散落、選取不明與窄版上下文切換成本。成功條件是主要地圖操作保持突出、面板與控制可辨識且可收合、Places／Routes 用詞一致，所有既有 capability 仍有淺層且有標籤的入口。

## Context

- Desktop 同時顯示左 picker、中央 MapLibre、右 inspector，以及散布於四周的 panel、focus、fullscreen、zoom、fit、style controls。
- 左側 selected item 主要靠淡背景／border；大量 card、border、radius 與 shadow 使 selection、interaction boundary、裝飾邊界難以區分。
- UI 同時使用 Places 與 favorites 描述可加入 route 的保存位置，可能讓使用者不確定兩者是否相同。
- `Stage.tsx` 已提供 Map／Choose／Edit mobile modes、左右 panel collapse 與 Focus map；本計畫應改善既有架構，不建立另一套 navigation。
- 本計畫依賴 `2026-07-18_web-route-inspector-declutter-plan.md` 完成或至少先確定其 DOM/scroll ownership，避免兩個 PR 同時改動 route inspector CSS。

## Accepted Control Inventory

| Classification | Elements | Owner / presentation |
| --- | --- | --- |
| Primary | Map canvas direct manipulation; inspector Save | Map remains the visual workspace; Save remains the only primary inspector completion action. |
| Supporting | Places/Routes picker, search, New, zoom, fit, panel visibility, mobile Map/Choose/Edit | Picker owns selection; viewport controls form one labeled group; panel controls stay at their respective edges; mobile mode switch preserves mounted drafts. |
| Contextual | Selected item metadata, waypoint selection, Device, Share, dirty/error state | Keep adjacent to the selected item or inspector action; do not move into global map controls. |
| Advanced | Map appearance and keyboard help | Keep as separately labeled, shallow disclosures; style must not look like a fourth viewport action. |
| Safety/status | Refresh/loading, unsaved changes, validation and save errors | Keep near the affected workspace or Save; never encode status by color alone. |
| Decorative/supporting | Scale bar and map attribution | Keep on the map without competing with controls. |
| Redundant | Simultaneous `Places` and `favorites` terminology for the same `Place[]` records; equal card emphasis on every picker row | Use `Saved places` in user-facing route-builder copy; reserve strong boundary/emphasis for selection and interaction. |

The code confirms that route "favorites" are the same `Place[]` records shown under Places, matched by coordinates in `RouteEditor`; accepted user-facing terminology is therefore **Saved places**. Internal class names may remain stable to avoid unrelated CSS churn.

## Non-Goals

- 不改 Map／Library 的既定責任分工，不把完整 editor 放回 Library。
- 不改 backend、Android、MapLibre provider、route/place schema 或遠端控制行為。
- 不以自動收合面板取代使用者選擇；任何 focus/panel state 都必須可逆並保留 draft。
- 不移除 keyboard help、Scale、map style、fit、zoom、fullscreen、Share、Device 或 account controls。

## Plan

- [x] 先建立 desktop/mobile control inventory，為每個 Map workspace element標記 primary、supporting、contextual、advanced 或 redundant，並把接受的 grouping 與 terminology 寫入本計畫；已對照 `Stage.tsx`、`map/page.tsx`、`ZoomStack.tsx`、picker/inspector components 與現有 Playwright screenshots，inventory 如上且沒有無 owner 的 action。
- [x] 在 Playwright 增加 Map workspace regression：panel controls 的 accessible name/state、Focus map 的可逆性、draft/selection 在 collapse 與 mobile Map／Choose／Edit 切換後保留、所有 map controls 可達；已記錄缺少 `aria-pressed`／semantic control groups／tablet mode 的 red，並以 desktop-light/mobile-light focused tests green 驗證。
- [x] 整合 map controls 的視覺分組：panel visibility 控制保留在各自 panel edge，zoom/fit 形成 `Map viewport` fieldset，appearance 成為獨立 `Map appearance` fieldset；已由 pointer panel-focus round trip、`?` keyboard help、Escape menu return、title/aria assertions 與 `map-workspace-polished`／`map-workspace-compact-desktop` screenshots 驗證。現有產品沒有 fullscreen capability，因此未虛構該 action。
- [x] 強化左 picker 的 selection hierarchy：active item 使用左側 accent bar、check mark、字重與 `aria-pressed`，未選 rows 改為 open list styling 並移除 card/shadow 強度；已由 focus-ring assertion、50-item fixture 與 light/dark `map-picker-dense` baselines 驗證。
- [x] 簡化 workspace containers：以 scoped `map-workspace.css` 降低 floating panel shadow/border、移除 picker row card chrome，保留 inspector disclosure、form、modal 與 sticky action 的必要邊界；已由 before/after committed baselines、dense picker focus screenshot 與 focus box-shadow assertion 驗證。
- [x] 統一 `Places`／`favorites` 用詞：程式確認 picker 接收相同 `Place[]`，所有 user-facing route-add、search、hint 與 empty copy 已採 `Saved places`，內部 class/component names 保留避免 CSS churn；已由 TS/TSX copy audit、saved-place append 與 empty-state Playwright tests 驗證。
- [x] 檢查 metadata、selected、focus 與 map-overlay 文字在 cream palette／dark project：scoped muted token 改為 `#72583f`，在 `#fff9ec` 上計算 contrast ≥ 4.5；selected 同時具 check/bar/`aria-pressed`，focus 具可見 ring；light/dark dense screenshots 與 scoped axe 均無 violations。Cartographer 依既有產品決策在 dark project 仍採固定 cream paper palette。
- [x] 微調 responsive workspace：Map／Choose／Edit 的單一 contextual panel 模式擴至 ≤1023px 並保留 mounted draft；1024–1150px 採 240px picker／340px inspector，1024px viewport 保留 ≥380px 中央 gap；已由 390×844、768×1024、1024×768、1440×900 snapshots/interactions 及既有 200% text、長 CJK/English assertions 驗證。
- [x] 執行 browser與quality gates：`/dashboard/map?kind=routes` 覆蓋 focus/dense/mobile/tablet，`/dashboard/map?kind=places` 覆蓋 compact desktop；committed evidence 為 `map-workspace-polished-*`、`map-workspace-compact-desktop-*`、`map-workspace-tablet-*` 與 `map-workspace-mobile-light.png`。`just check`, `just lint`, Web typecheck/build 與完整 Playwright（26 passed／25 expected project skips）已通過，最終以 `git diff --check` 複驗。

## Risks

- 將 controls 聚類可能改變熟悉的位置；保留 icon、label、shortcut 與可預期 panel edge，並以 task smoke 比較操作步數。
- 減少 borders/shadows 可能讓 interactive boundaries 不清楚；hover、focus、selected 與 modal scope 必須仍有非顏色單一線索。
- Tablet 若自動隱藏面板可能造成上下文消失；優先使用可見 collapse affordance，除非 viewport 無法容納才採明確 responsive default，且不覆寫使用者當次選擇。
- terminology 改動會影響 tests、help copy 與使用者既有認知；只在 domain evidence 確認同義時統一。

## Completion Checklist

- [x] Picker、map、inspector 的責任與 action priority 已由 accepted control inventory、DOM hierarchy 與 desktop/tablet/mobile screenshots 驗證。
- [x] Panel、viewport、appearance controls 已形成可辨識 semantic/visual 群組，且 keyboard、title tooltip、accessible name/state 與 help shortcut均由 Playwright/DOM review 驗證。
- [x] 左 picker 的 selected/focus 狀態在 light/dark 與 50-item dense list 中清楚但不依賴單一顏色，已由 check/bar/`aria-pressed`、screenshots、focus smoke 與 4.5+:1 metadata contrast evidence 驗證。
- [x] Nested decorative containers 已減少，interaction/modal/sticky boundaries 仍明確，已由 before/after browser review、scoped CSS 與 focus-ring assertions 驗證。
- [x] Places／favorites terminology已依產品語意統一為 user-facing `Saved places`，已由 TS/TSX copy audit、append 與 empty flow驗證。
- [x] Desktop、tablet、mobile、200% text 與長內容均保留 map usability、selection、draft、dirty state 與可逆 panel modes，已由指定 viewport screenshots/interactions 驗證。
- [x] Light/dark project accessibility review沒有新增 axe violation、低於門檻的重要文字對比或 color-only status，已由 automated contrast/axe 與人工 screenshot review驗證。
- [x] 所有 required quality gates 已由 `just check`, `just lint`, Web typecheck/build/UI tests 與 `git diff --check` 的成功輸出驗證。
