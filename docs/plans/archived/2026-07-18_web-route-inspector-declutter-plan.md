## Goal

降低 Web Map／Routes 右側 inspector 的視覺與操作負擔，同時保留 route identity、waypoint 精確編輯、favorites、新增／排序、speed、playback mode、description、Share、Device、dirty recovery 與 Save 能力。成功條件是使用者進入既有 route 後，能先看見並操作 Waypoints，整個 inspector 只有一個垂直捲動區，而且 Save 是唯一主要動作。

## Context

- `web/app/dashboard/map/page.tsx` 以 `IndexCard` 包住 `RouteEditor compactSummary mapMode="background"`，因此 header、route status、core fields、兩個 disclosure section 與 sticky footer 同時出現在約 440px 寬的 inspector。
- `web/components/dashboard/RouteEditor.tsx` 目前把 Name／Speed／Playback 放在 Waypoints 前，並以另一個 `Add waypoints` section 收納 favorites；這讓地圖頁的主要任務——查看與調整路線——排在設定表單之後。
- `.index-card .route-editor` 與 `.route-editor-waypoints-section .waypoint-list` 都能垂直捲動，形成巢狀 scrollbar。
- waypoint row 同時顯示 grip、badge、name、coordinates、overflow 與受祖先 selector 影響的 disclosure chevron，增加噪音。
- 既有 draft ownership、selection/hover linking、unsaved-change guard、Device dialog 與 Share dialog 已可運作，本計畫只重整 hierarchy，不改資料語意或 API。

## Architecture

- 保持 `/dashboard/map?kind=routes` 為 route 的 canonical editor，繼續由 Map page 擁有 controlled waypoint draft、selected/hovered waypoint 與 dirty state。
- `RouteEditor` 保持共用元件，但以清楚的 map-inspector variant 組織內容；不得用 CSS `order` 製造與 DOM／鍵盤順序不一致的視覺排列。
- 只保留 `.index-card-route .route-editor-content` 作為 inspector 內容的垂直捲動 owner；header/footer 固定在捲動區外，waypoint list 不再擁有獨立 scrollbar。

## Non-Goals

- 不改 backend schema/API、route geometry、MapLibre、Device command 或 Share lifecycle。
- 不移除 precise coordinates、favorites、reorder、insert、duplicate、remove 或 description。
- 不在本計畫全面重做左側 picker、頂部導覽或所有地圖控制；相關工作由 `2026-07-18_web-map-workspace-polish-plan.md` 追蹤。
- 不新增 UI framework 或 dependency。

## Plan

- [x] 在 `web/tests/ui/ui-regression.spec.ts` 補 route-inspector hierarchy 與 single-scroll 的失敗測試：Waypoints 在 Route settings 前、Save 可見且為唯一 primary footer action、waypoint list 不可垂直捲動、既有 Share/Device 路徑仍可達；已記錄缺少 disclosure 與 nested overflow 的 red，並以 focused desktop-light 6 tests green 驗證。
- [x] 重整 `web/components/dashboard/RouteEditor.tsx` 的 map-inspector DOM 順序：compact status 後先呈現 Waypoints；既有 route 接著提供 `Add from favorites` 與收合的 Route settings／More details，new route 則先展開 required settings 再提供 favorites；已由 DOM-order、new/existing route screenshots 與 keyboard-menu Playwright tests 驗證。
- [x] 將現有 `Add waypoints` disclosure 改為 Waypoints 區附近的明確 `Add from favorites` 入口，保留 map-click instruction、favorite search/add 與無 favorites empty state，不再用重複的 `Map clicks or favorites` 卡片佔據一整列；已由 favorite append、MapLibre canvas click 與 intercepted empty-favorites fixture 驗證。
- [x] 精簡 waypoint row：預設顯示 reorder handle、序號／terminal cue、名稱與 More；coordinates 僅在 selected/focused row 以第二行顯示，並修正 nested `summary::after` selector 讓 row overflow 不出現錯誤三角形；已由 visibility assertions 與 `route-inspector-declutter-desktop-light.png` 驗證。
- [x] 補齊非拖曳排序路徑，在 waypoint More menu 提供 Move up／Move down（邊界項停用），保留 Insert after、Edit coordinates、Remove；已由 Playwright menu 操作驗證座標移至下一列、selection 跟隨且出現 dirty state。
- [x] 調整 `web/app/globals.css` 的 inspector overflow ownership，移除 compact waypoint list 的 `max-height`／`overflow-y: auto`，並把 footer 固定在唯一 content scroller 外；已由 2-point creation、seed route、50-row fixture 的 scroll-owner assertion、最後一列與 Save 可見性驗證。
- [x] 壓縮 inspector header/status：revision 降為次要文字、route metrics 保留單一摘要行，Device readiness 改為緊湊 contextual trigger；Share 移至 status header 的低強度文字 action，footer 只保留 dirty/discard recovery 與 primary Save；已由 Device/Share dialog focus return、save error/discard recovery 與 screenshot 驗證。
- [x] 驗證 responsive inspector：desktop `1440×900`、tablet `1024×768`、mobile `390×844` 的 Edit state，以及 200% text、長 CJK/English route 名稱與 50 waypoints；已由 committed inspector screenshot、horizontal-overflow assertions、single-scroll與 Save/last-row geometry assertions 驗證。
- [x] 執行格式、靜態、型別、build 與完整 Web UI regression；`just check`, `just lint`, Web typecheck/build 與完整 Playwright（20 passed／16 project skips）已通過，`web/tsconfig.tsbuildinfo` 已還原；最終以 `git diff --check` 複驗。

## Risks

- 隱藏每列 coordinates 可能降低精確比較效率；selected/focused row 必須直接顯示，Edit coordinates 仍維持一層可達，不可只靠 hover。
- 將 settings 收合可能讓 new route 的 required Name 難以發現；new route 必須採不同預設，validation 要指向並展開缺漏欄位。
- 移除 waypoint 內層 scrollbar 會增加長 route 的面板捲動距離；sticky header/footer、selected-row `scrollIntoView` 與 50-row fixture 必須證明操作仍可預期。
- 共用 `RouteEditor` 也用於非 background map 場景；variant-specific markup/style 不可改壞 embedded editor。

## Completion Checklist

- [x] Route inspector 的 Waypoints-first hierarchy 已由 desktop/mobile snapshots、new/existing inspector baselines 與 Playwright DOM/focus assertions 驗證。
- [x] Inspector 只有一個垂直捲動 owner，已由 15/50 waypoint geometry assertions 與最後一列可達 smoke 驗證。
- [x] Waypoint row 預設不再重複顯示 coordinates 或錯誤 chevron，selected/focused row 仍可辨識精確座標，已由 DOM assertions 與 `route-inspector-declutter-desktop-light.png` 驗證。
- [x] Pointer、keyboard 與非拖曳方式都能選取、排序、編輯與移除 waypoint，已由 Map click、menu reorder 與既有 controls 的 Playwright interaction tests 驗證。
- [x] Name、speed、mode、description、favorites、Share、Device、discard、Save 與錯誤回復能力均未遺失，已由 existing/new route、empty favorites、dialogs 與 intercepted save-error browser smokes 驗證。
- [x] `1440×900`、`1024×768`、`390×844`、200% text、長名稱與 50 waypoints 均無 horizontal overflow、不可達 action 或重疊 scrollbar，已由 committed screenshots/assertions 驗證。
- [x] 所有 required quality gates 已由 `just check`, `just lint`, Web typecheck/build/UI tests 與 `git diff --check` 的成功輸出驗證。
