## Goal

提升 Kestrel Web dashboard 的日常操作體驗，讓使用者能更直覺地管理 Places / Routes、建立 route、理解目前狀態，並降低誤操作與迷失成本。成功條件是：使用者不需要理解資料模型也能完成「新增 place → 以 place 作為 route 起點 → 編輯 waypoint → 儲存 / 分享」流程，且桌面與手機版都有清楚的視覺層級與操作路徑。

## Context

目前 Web UI 已有一致的輕量玻璃卡片視覺、Places / Routes tabs、可收合左側列表、MapLibre 地圖編輯器，以及 route 可從 0 個 waypoint 開始並可從 saved place 選起點。這些是好的基礎，但資訊架構、操作 feedback、空狀態與表單密度仍偏工程導向。

## UX Review：目前對使用者不友善的地方

### 1. Navigation 與資訊架構

- Places / Routes 是資料類型，但使用者的目標其實是「建立位置」、「建立路線」、「分享路線」。目前 tabs 只反映資料表，沒有引導任務流程。
- Routes 頁同時載入 routes 與 places，但 UI 沒解釋 places 為何出現在 route editor 的 `Start from place`。新使用者可能不知道要先去 Places 建 favorite。
- 左側 sidebar 收合後只剩符號，沒有持續提示目前是哪個 list；在寬螢幕上雖不擋地圖，但收合狀態的意義仍偏隱性。

### 2. Route editor 的主次順序不清

- Route editor 目前是一個長表單：地圖、名稱、速度、模式、公開狀態、描述、分享、waypoints、儲存與刪除混在同一層。使用者很難判斷「現在最重要要做什麼」。
- 地圖是 route 編輯的主操作區，但下方 waypoint rows 才是精準編輯區；兩者缺少連動提示，例如點選某 waypoint row 時地圖 marker 沒有被凸顯。
- `Save route` 只有在 waypoint >= 2 才可按，但沒有明確說明為何 disabled。0 或 1 點的新 route 會讓使用者懷疑是不是壞掉。
- `Add waypoint` 使用上一個 waypoint 或預設台北座標，這是工程上方便，但使用者可能不理解為何新增點會重疊或跳到台北。

### 3. Map interaction feedback 不足

- 地圖可以點擊新增 waypoint，但 UI 沒有明顯提示「Click map to add waypoint」。第一次使用者不一定會知道。
- Marker 顏色只有首點與其他點差異，沒有說明 start/end/selected/dragging 狀態。
- 拖曳 marker 後座標會改，但沒有短暫 feedback 或 undo。誤拖時使用者只能手動修正。
- 沒有「Fit route」、「Center on selected」、「Clear route」等地圖常見控制，使用者失去地圖視野後只能手動操作。

### 4. Places 作為 Favorites 的定位不夠明確

- UI 文案仍叫 `Places`，但使用者語境是「最愛」。如果 Android 端稱為 Favorites，Web 端 `Places` 會造成跨平台心智不一致。
- Place list 只顯示名稱、座標、tags；缺少可掃描的資訊，例如描述摘要、最近使用、pinned 狀態、是否常用於 route。
- Route 中的 `Start from place` 是 select，當 place 很多時不易搜尋，也缺少座標 / tag context。

### 5. Visual hierarchy 與版面密度

- 色彩風格可愛、柔和，但互動層級過度依賴同一種 card / pill / chip，導致主要操作與輔助資訊分不清。
- Topbar、tabs、sidebar、editor card 都是高圓角玻璃卡；視覺上很一致，但缺少「workspace」與「controls」的層級差。
- 桌面版 shell 最大寬度已放大，但 route editor 仍是單欄長表單，地圖下面的表單容易把主要工作流推得很長。
- 手機版 sidebar 收合狀態會被還原成展開內容，符合可用性，但使用者在不同斷點切換時可能感覺狀態不一致。

### 6. Safety、狀態與錯誤處理

- Delete 按鈕直接出現在 footer，缺少 confirmation，誤刪風險高。
- Save 成功沒有明確 success feedback；使用者只能靠列表或資料改變推測已儲存。
- Share link panel 在 route editor 中佔據大量空間，但只有已儲存 route 才有意義；new route 時會打斷主要建立流程。
- Loading / empty / error states 都偏文字提示，沒有下一步 action，例如 empty routes 時應直接提供 `Create your first route`。

## Non-Goals

- 不重做品牌視覺或整套 design system。
- 不新增第二個地圖後端。
- 不處理 Android app UI。
- 不在此階段做 GPX / KML 匯入匯出或軌跡錄製。

## Assumptions

- Web dashboard 的主要使用者是登入後管理自己的 cloud library。
- 桌面版 route 編輯是優先場景；手機版需可用但不是主要生產力場景。
- `Place` 可在 UI 文案中逐步轉譯為「Favorite place」，不必改 API schema。

## Plan

### Phase 1 — 讓使用者知道下一步

- [x] 在 `web/components/dashboard/RouteEditor.tsx` 加入 route editor helper copy：0 點時顯示「選一個 favorite 作為起點，或點地圖加入第一個 waypoint」；1 點時顯示「再加入至少 1 個 waypoint 才能儲存」；已用 `cd web && npm run lint` 驗證。
- [x] 將 disabled `Save route` 改為搭配 inline reason 或 helper text，而不是只 disabled；已在 RouteEditor code 加入 0/1 點 disabled reason，並用 `cd web && npm run lint` 驗證。
- [x] 在 map 區上方或 overlay 加入簡短 instruction bar：`Click map to add waypoint · Drag markers to adjust`；已加在 map 左上角，避開右上角 navigation controls，並用 `cd web && npm run lint` 驗證。
- [x] 在 routes empty state 加入主要 CTA `Create your first route`，places empty state 加入 `Create your first favorite place`；已更新 dashboard pages 並用 `cd web && npm run lint` 驗證。

### Phase 2 — 重整 route editor 層級

- [x] 將 RouteEditor 分成三個視覺區塊：`Map builder`、`Route details`、`Publishing / share`，讓 share panel 只在 existing route 或 details 摺疊區中出現；已更新 `web/components/dashboard/RouteEditor.tsx` DOM 結構並用 `cd web && npm run lint` 驗證。
- [x] 將 `Name` 移到 editor header 或地圖下第一個欄位，讓 route 的 identity 早於速度 / 模式；已放在 `Route details` 的第一個欄位並用 `cd web && npm run lint` 驗證。
- [x] 把 `Share link` 改為次要區塊，new route 時只顯示一句「Save before sharing」，避免佔據建立流程；已更新 `RouteSharePanel` 並用 `cd web && npm run lint` 驗證。
- [x] 將 delete action 移到 danger zone 或 overflow area，並加入 confirmation dialog；已在 `RouteEditor` 加入 `window.confirm`，用 `cd web && npm run lint` 驗證。

### Phase 3 — 改善 waypoint 操作

- [x] 在 waypoint row 顯示更語意化 label：`Start`、`Stop 2`、`End`，而不是只有 `#1`；已更新 `RouteEditor` 並用 `cd web && npm run lint` 驗證。
- [x] 點選 waypoint row 時設定 selected waypoint，並在 map marker 上用顏色 / scale / popup 反映 selected 狀態；已加入 selected row / marker state 與 marker click callback，並用 `cd web && npm run lint` 驗證。
- [x] 將 `Add waypoint` 從「複製最後一點」改為更明確的兩種操作：`Add from map click` instruction 與 `Duplicate last waypoint` 次要 action；已更新 route builder actions 並用 `cd web && npm run lint` 驗證。
- [x] 加入 `Fit route` 按鈕，僅由使用者主動觸發地圖重新縮放；已用 `fitRequest` 觸發手動 fit，並用 `cd web && npm run lint` 驗證。

### Phase 4 — 讓 Favorites / Places 更像可用素材庫

- [x] 將 Routes editor 中的 `Start from place` 改成可搜尋 combobox 或 filtered list，顯示 place name、tags、座標摘要；已加入 filtered favorite place list 並用 `cd web && npm run lint` 驗證。
- [x] 統一 Web 文案：navigation 可保留 `Places`，但 route editor 內使用 `Favorite place` / `Saved place`，並在空狀態提供前往 Places 的 link；已在 RouteEditor 使用 favorite place 文案與 `/dashboard/places` link，並用 `cd web && npm run lint` 驗證。
- [x] 在 route editor 支援 `Add favorite as waypoint`（已有 waypoint 時），但以次要 action 呈現，避免和 0 點時 `Start from place` 混淆；已依 0 點 / 已有點切換文案與 append 行為，並用 `cd web && npm run lint` 驗證。

### Phase 5 — 視覺系統與響應式細修

- [x] 建立 dashboard-specific CSS classes，減少 `.row` + inline style 的版面拼接；已移除 RouteEditor 與 dashboard error inline layout style，並用 `cd web && rg "style=\\{\\{" app components -n` 驗證 dashboard editor 不再有 inline style。
- [x] 調整桌面版 route editor 為 map-first layout：大螢幕可用左側 library + 中央 map + 右側 details，或 map 上方 / details 下方的清楚分區；已加入 1180px 以上雙欄 grid areas，並用 `cd web && npm run lint` 驗證。
- [x] 手機版 route editor 採用 sticky bottom action bar，保留 `Save route`、目前 waypoint count 與 disabled reason；已讓 route editor footer 在手機版 sticky bottom，並用 `cd web && npm run lint` 驗證。
- [x] 檢查 light / dark mode 對比與 focus state，尤其 chips、secondary buttons、map instruction overlay；已補 route marker focus-visible 與 dark overlay 背景，並用 `cd web && npm run lint` 驗證。

## Risks

- Route editor 拆區後可能增加 component 複雜度；應先做文案與狀態提示，再拆 layout。
- Combobox 若自行實作會增加 accessibility 風險；若沒有成熟元件，先用原生 select + filter input 的保守方案。
- CSS `:has()` 已用於 dashboard grid，若需要支援更舊瀏覽器，要改成 React state class 掛在 grid 上。

## Completion Checklist

- [ ] New route 的 0/1/2 waypoint 狀態都有清楚下一步提示，並以手動 UI review 或截圖驗證。
- [ ] 新增 waypoint 不會自動改變地圖 zoom，只有 `Fit route` 或 start-from-place 這類明確 action 會移動視野，並以手動測試驗證。
- [ ] Route editor 的主要流程（命名、選起點、加點、儲存）在桌面版不需要閱讀 share / delete 等次要區塊即可完成，並以使用者驗收確認。
- [ ] Places / favorite 在 route editor 中的文案一致，且無 favorite 時有明確前往建立 place 的 CTA，並以 empty state 手動測試驗證。
- [ ] Delete route / place 有 confirmation 或等效防誤觸機制，並以手動測試確認不會單擊即刪除。
- [ ] Web lint 通過：`cd web && npm run lint`，允許既有 Biome schema version info。
