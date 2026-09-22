# Web route workspace UI review plan

## Goal

依據 2026-09-22 UI 檢討，修正 Web Map／Routes workspace 的狀態矛盾、路點辨識與手動儲存語意，再降低右側 inspector 密度並改善可點擊性、對比與窄螢幕操作。成功條件是使用者能依序完成「編輯 Path → 設定 Playback → Save／使用 route」，不會在失效地圖、空心 marker 或無意義的 disabled Save 上得到互相衝突的提示。

## Findings

| 檢討項目 | 現況證據 | 判定 |
| --- | --- | --- |
| `Map unavailable` 背後仍有地圖且可操作 | `web/components/RouteMapEditor.tsx` 的 12 秒 timeout 只把 `mapStatus` 設為 `error`；MapLibre instance、canvas、click handler 與外部 `ZoomStack` 都仍存在。`web/app/map-workspace.css` 的錯誤 UI 也只覆蓋中央小卡。 | 真實缺陷；fatal state 沒有阻止互動，也沒有傳到 Route inspector。 |
| marker 多為空心且無編號 | marker 本身已有 `1..n`，但 `button.route-marker` 將文字設成透明／0px；`COMPACT_MARKER_COUNT = 8` 後又把中繼點的 `::after` label 隱藏，只留下 14px 空心圓。hit target 為 32px，Start／End 主要只靠顏色。 | 真實缺陷；是 compact CSS 的預期效果，不是資料缺號。 |
| `All changes saved` 與 disabled `Save route` 衝突 | `RouteEditor` 是明確的手動儲存：只有 submit 才呼叫 API；`docs/web-cloud-guide.md` 也寫明 Save 前不寫入 cloud。clean draft 仍固定顯示 disabled Save；全新空 draft 還會錯誤顯示 `All changes saved.`。 | 必須保留手動儲存並重做 presentation state；不可改成未經確認的 auto-save。 |
| 右欄密度高 | DOM 已是 identity → Path → Playback → More details → footer，方向與建議一致；但 Path 同時包含 toolbar、rail、selected card、loop callout、完整 waypoint manager 與 inline Saved places，identity 又放 Device／Share。 | 不需再做一套 editor；應在現有順序上移除重複摘要並把次要內容改為淺層 disclosure／dialog。 |
| Device／Share 可點擊性弱 | 兩者語意上是 Radix `Button`，但被放在摘要文字附近且採低強度 secondary styling；Device 還把 readiness 壓成 muted inline copy。 | 語意存在但 affordance 不足。 |
| Saved place、Coordinates、Undo／Redo 混組 | 四個動作位於同一個無視覺分組的 fieldset。 | 應拆成「Add waypoint」與「History」兩組。 |
| 左側 New 與選取狀態偏弱 | `New` 使用 secondary button；selected row 已有 `aria-pressed`、3px accent bar、淡背景與 17px check，但視覺線索仍小。 | 保留既有 semantics，提升 CTA 與非顏色選取線索。 |
| 中英文混用 | Web application copy 與 `<html lang>` 目前是 English；地圖地名由 tile provider 決定。repository 沒有 locale/message catalog。 | 不應只翻 Route inspector 造成新的混用；完整 zh-TW localization 應另立跨頁面工作流。 |
| 對比偏低 | Map workspace 已把 muted token 固定為 `#72583f`，在常見 cream background 上約為 5.5–6.5:1；但 disabled controls 使用全域 0.5 opacity，且 disabled reason 容易和控制一起變弱。 | active/muted 文字基線大致足夠，仍須以 computed color 稽核；disabled control 本身雖不受 WCAG 1.4.3 規範，原因文字必須保持正常對比。 |
| 窄螢幕 | `Stage` 已在 ≤1023px 提供 Map／Choose／Edit 單一 contextual panel，並保持 draft mounted。 | 應驗證與修正，不另建 mobile editor。 |

## Architecture

- 保持 `/dashboard/map?kind=routes` 為唯一 canonical route editor；不更動 Backend、route schema、Android command 或 share-link lifecycle。
- 保持手動儲存。以一個可測試的 presentation state 明確區分 new-unsaved、clean-saved、dirty-valid、dirty-invalid、saving、saved-success 與 save-error。
- 由 `DashboardMapPage` 接收 `RouteMapEditor` 的 map capability 狀態，再同步控制 Route instruction、viewport controls 與 Scale，不讓各區塊自行猜測地圖是否可用。
- 地圖狀態至少區分：
  - `loading`：暫時阻止 route edit gesture。
  - `ready`：map、route line、marker 與 gesture 都可用。
  - `unavailable`：MapLibre/style 無法初始化；完整遮罩且停用所有 map gesture/control。
  - `route-preview-error`：basemap 可見，但 route layer／marker 無法同步；文案必須說明是 route preview 失敗，並停用會依賴視覺回饋的 map click／drag，保留 inspector 精確編輯。
- 一般 tile request error 不升級成 fatal alert；沿用既有「style ready timeout 才視為 fatal」決策，避免網路抖動造成誤報。
- marker 保持 MapLibre 擁有 `.maplibregl-marker` 的 absolute positioning；不得對 `button.route-marker` 指定其他 `position`，並保留 `min-height: 0` 以避免既有定位回歸。
- 右欄採單一流程，不新增 wizard 或 tabs：Route identity → **1 Path** → **2 Playback** → More details（預設收合）→ **3 Save & use**。長清單仍以既有 disclosure 延後 mounting；Saved places 改用 dialog/popover，不再把整個搜尋清單展開在主 scroll flow。

## Non-Goals

- 不加入 auto-save、browser draft persistence、revision restore、GPX／KML、route recording 或第二套地圖／UI library。
- 不改 Device command 使用 current draft、Share 使用 latest saved revision 的既有語意；只讓來源更清楚。
- 不在本計畫全面重寫 `web/app/globals.css`，只移除或覆寫 ownership 明確的 route workspace rules。
- 不在這次 Route workspace polish 中局部硬編 zh-TW。若產品確認 zh-TW 為主要 locale，另建全 Web message catalog、locale routing／preference、`lang` 與完整頁面翻譯計畫；tile 地名仍依 provider 能力。
- 不執行 production deploy、外部寫入、Android device command 或資料庫操作。

## Plan

- [x] 以 Chrome DevTools 在隔離的 local Web environment 建立目前 UI baseline，覆蓋 existing 2-point route、8-point compact route、new empty route、map fatal fallback、dirty valid／invalid route；截圖與 DOM/computed-style 證據放在 repository 外，確認使用者描述可重現。
- [x] 在 `web/components/RouteMapEditor.tsx` 定義並回報 map capability state；把 map click listener 延後到 route preview ready 後才啟用，為 route layer／marker sync 加入 bounded error handling，並確保 Retry 會清理舊 map、marker、listener 與 timeout 後重新 mount。
- [x] 在 `web/app/dashboard/map/page.tsx` 根據 map capability 將狀態傳給 `RouteEditor`、`ZoomStack` 與 `ScaleBar`；`unavailable`／`route-preview-error` 時停用相應 map controls，Route Path instruction 改為可驗證的 fallback 文案，不再提示點地圖或編號 marker。
- [x] 在 `web/app/map-workspace.css` 將 fatal fallback 改成覆蓋整個 map 的高對比 blocking layer，降低背景對比並攔截 pointer；route-preview failure 使用精確的非 fatal banner。驗證 loading、late success、fatal timeout、route preview failure 與 Retry 不會同時顯示互斥狀態。
- [x] 重做 editable route marker：44px pointer/touch hit target、約 24–28px 可視本體、所有 waypoint 永遠在 marker 本體內顯示編號；Start 使用圓形、End 使用方形／旗標式輪廓，中繼點採高對比填色，selected／hovered／focused 再加 ring 與層級。移除「≥8 就隱藏中繼編號」規則，但保留 dense route 的 selected/focused 強調。
- [x] 驗證 marker 與 line 在 2、8、50 與 1000 waypoint route 的定位、selection、drag、keyboard focus 與效能；1000 點不要求標籤彼此完全不重疊，但目前選取／聚焦點必須可辨識且不能造成 document overflow。以 DOM 中心點對 MapLibre transform 目標的量測防止 marker drift 回歸。
- [x] 抽出 route save presentation state 並加 Node unit tests，涵蓋：new empty 顯示 `Not saved yet` 與第一個 validation reason；existing clean 顯示 saved revision 且不呈現大型 disabled Save；dirty-invalid 顯示正常對比原因；dirty-valid 顯示 active Save／Discard；saving 禁止重複提交；success 顯示 `Saved just now`；error 保留完整 draft。
- [x] 在 `web/components/dashboard/RouteEditor.tsx` 保留手動 Save，讓 sticky save bar 只在 new／dirty／saving／error 時出現；clean saved route 改成精簡的 cloud-saved status。把 save error 與 validation reason 放在 footer 的 `aria-live` 區域，避免頂部 error 與底部 CTA 距離過遠。
- [x] 依單一路徑重整 Route inspector：刪除與 map／status 重複的常駐 Route rail（empty／single waypoint guidance 可保留）；將 Path toolbar 拆為 `Add waypoint`（Saved place、Coordinates）與 `History`（Undo、Redo）；完整 waypoint manager、description／visibility 維持 disclosure；Playback 保持可見且排在 Path 後。
- [x] 將 Saved places picker 從 inline disclosure 改為 Radix dialog/popover，保留 search、partial-load Retry、empty state、focus return 與 navigation guard；選取後關閉 overlay、選中新增 waypoint 並聚焦地圖位置，避免右欄因清單展開產生長距離捲動。
- [x] 建立 **Save & use** 區：用有 icon、border、完整動詞的 secondary buttons 取代摘要旁的 `Device`／`Share` 文字感入口。dirty route 分別標示 `Play current draft on device` 與 `Share saved revision`；new unsaved route 明確提示首次 Save 後才能使用，不能只留下 disabled controls。
- [x] 強化左 picker：`New route/place` 改為含 Plus icon 的主要 CTA並與 search 等高；selected row 放大 check cue、提高文字／背景／outline 對比，同時保留 accent bar 與 `aria-pressed`，確保選取不只靠顏色。
- [x] 降低次要視覺噪音但不移除 capability：移除實際已由 `ZoomStack` 取代且被 CSS 隱藏的 MapLibre NavigationControl；保留左右 panel edge controls，將第三個 `Focus map`／`Show panels` 動作移入現有 Map tools menu 並保留動態 accessible name，讓 desktop map 上少一個常駐浮動按鈕且仍可一次收合／還原雙 panel。
- [x] 用 computed colors 稽核 Route workspace：一般與 muted 文字至少 4.5:1、focus／control boundary 至少 3:1、selected/error/success 不只靠顏色；disabled reason 使用正常文字對比。只在 scoped tokens/rules 修正，不新增第二套 palette。
- [x] 更新 `docs/web-cloud-guide.md`，明確記錄 manual Save、new/clean/dirty 狀態、map unavailable 與 route-preview failure 的差別、marker Start／End 線索，以及 Device／Share 使用的 snapshot；不要宣稱有 auto-save。
- [x] 使用 Chrome DevTools 驗證 `1440×900`、`1024×768`、`768×1024`、`390×844`、320px width 與 200% text；確認 Map／Choose／Edit 切換保留 draft，只有一個主要垂直 scroll owner，44px 常用 touch target，沒有 document horizontal overflow，dirty Save 可達且 clean state 不永久占用 footer 高度。截圖一律放 repository 外。
- [x] 執行 `cd web && npm run lint && npm test && npm run typecheck && npm run build`、`git diff --check` 與 scoped copy/style audit；若 `web/tsconfig.tsbuildinfo` 被工具改寫且非預定變更，還原該檔。最後檢查 diff 不含圖片 binary 或無關變更。

## Verification Evidence

- Chrome DevTools baseline and final evidence is stored outside the repository at `/tmp/kestrel-route-ui-evidence/{baseline,final}`. The final matrix covers 2, 8, 50, and 1000 markers; drag, selection, keyboard focus, Saved places, Undo, manual Save success/failure, fatal and route-preview fallbacks, panel focus, computed contrast, and responsive layouts from 1440px through 320px plus 200% scale.
- Marker center measurements reported zero drift after viewport fitting for 8, 50, and 1000 points. The 1000-point preview became ready in about 3.6 seconds without document overflow; the selected/focused marker remained distinguishable.
- Computed contrast evidence meets the plan thresholds: body/muted and status text are at least 4.98:1, control boundaries are 3.7:1, and focus outlines are 5.38:1.
- `just web-check`, `cd web && npm run lint`, 26 Node unit tests, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check` pass. Biome retains 44 pre-existing descending-specificity warnings and reports no errors.

## Risks

- MapLibre 的 `load`／`style.load`／tile error 語意不同；若把一般 tile error 當 fatal，會重現錯誤誤報。fatal 只應由初始化例外或首次 style-ready timeout 觸發。
- 改 marker 尺寸或 positioning 會影響 MapLibre anchor；不得覆寫 `position: absolute`，需以中心點量測驗證 line/marker 對齊。
- 50–1000 個永遠有編號的 DOM marker 可能重疊。優先保證 hit target、selected/focus 可辨識與效能，不以隱藏所有中繼編號回避；若 browser evidence 顯示不可接受，再另評估 MapLibre symbol layer／clustering，而不是先增加複雜度。
- sticky footer 改為條件顯示會造成版面高度切換；draft 變 dirty 時必須保持目前 scroll/focus，不可把正在編輯的 control推出視窗。
- Device 可使用 existing route 的 unsaved draft，而 Share 只能使用 saved revision；將兩者放在同區時必須保留不同 snapshot 文案，不能暗示 Save 後內容相同。
- 既有 global CSS 有多代 route/editor rules。新樣式應留在 `map-workspace.css` 或更窄 selector，並以 computed style 驗證 source-order，而不是再加入 broad `button` 規則。

## Completion Checklist

- [x] fatal map state 完整阻止 map interaction、降低背景對比、停用 viewport controls，且 inspector 不再提示點地圖；route-preview-only failure 使用不同且精確的文案。
- [x] 所有 editable waypoint marker 都有可見編號、至少 44px hit target，以及非顏色的 Start／End 差異；2／8／50／1000 點 case 無定位回歸。
- [x] manual Save 語意在 new、clean、dirty-invalid、dirty-valid、saving、success、error 狀態一致；clean saved route 不再同時顯示 `All changes saved` 與大型 disabled Save。
- [x] Route inspector 依 Path → Playback → Save & use 組織，Saved places 與完整 waypoint 管理採 progressive disclosure，Device／Share／Add／History 的分組和可點擊性清楚。
- [x] 左 picker New CTA 與 selected row 在 pointer、keyboard、light palette 和 200% text 下都可辨識，且不只靠顏色。
- [x] active/muted/status copy 與 focus/control boundaries 達到設定的 WCAG 對比門檻；disabled 原因以正常對比顯示。
- [x] desktop、tablet、phone、320px 與 200% text 都無 clipped primary action、重疊 panel、document horizontal overflow 或 draft reset。
- [x] 使用者文件與 UI 都明確說明 manual Save、map fallback、Device current draft 與 Share saved revision；沒有局部中英混譯。
- [x] Web lint、unit tests、typecheck、build 與 `git diff --check` 全部通過，final diff 不含無關檔案或圖片 binary。
