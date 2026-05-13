## Goal
將 web console 的 place 與 route 編輯從同一個 dashboard 拆成兩個獨立頁面，避免同頁同時顯示兩張地圖；並在 places 頁加入可互動地圖，讓使用者能用點擊或拖曳 marker 設定座標，而不必只靠手動輸入經緯度。成功條件是：`/dashboard/places` 可視覺化並編輯 place 座標、`/dashboard/routes` 保留 route 編輯與 sharing 管理、既有分享頁仍可正常導回 route 管理流程，且 web 檢查與手動 smoke test 通過。

## Context
目前 `web/app/dashboard/page.tsx` 同時承載 Places 與 Routes 清單/編輯器；route editor 已使用 `web/components/RouteMapEditor.tsx`，place editor 則只有文字座標欄位。若直接在現況加上 place 地圖，同頁會同時出現 place map 與 route map，UI 會變得擁擠且概念混雜。`web/package.json` 已包含 `maplibre-gl`，因此這次不需要新增地圖套件。

## Architecture
- 導覽拆分為獨立頁面：`/dashboard/places` 專責 place 管理，`/dashboard/routes` 專責 route 管理與 sharing；`/dashboard` 固定 redirect 到 `/dashboard/routes` 以維持舊入口可用。
- 導覽 UI 採用「看起來像 tabs、實際上是不同 URL links」的形式，讓 places/routes 保持獨立頁面，同時保有直覺切換體驗。
- Place 地圖編輯應做成單點元件（例如 `web/components/PlaceMapEditor.tsx`），避免把 MapLibre 初始化直接塞進 page component。
- 共用只抽小型 dashboard header/nav 與必要 auth gate；places/routes 的資料載入與選取 state 各自管理，不回頭綁成同一個超大 client component。
- 第一版不做 `?place=` / `?route=` 這類 item deep-link；切頁後只需進入各自列表/編輯頁即可。
- Sharing 不改資料契約；只需把 route 專屬的 share 管理 UI 留在 routes 頁，並把公開分享頁上的 dashboard 回鏈與文案改到 routes 頁面。

## Non-Goals
- 不加入地址搜尋、地名搜尋、reverse geocoding。
- 不調整 places/routes API schema。
- 不重做公開分享頁的核心 copy/share 流程。
- 第一版不支援以 query string 或其他 deep-link 直接打開特定 place/route。

## Assumptions
- `/dashboard/routes` 作為既有 dashboard 預設落點最合理，因為 sharing 是 route 專屬功能，公開分享頁回到 routes 頁會比回 place 頁自然。
- Place 的需求仍然只是選一個點，不需要引入 waypoint 或 polyline 編輯模型。
- Place 地圖互動以單一 marker 為準：點地圖是移動 marker、拖曳 marker 會回寫欄位、手動改經緯度時 marker 也要同步更新。

## Plan
- [ ] 盤點 `web/app/dashboard/page.tsx` 內哪些 state/UI 屬於 places、哪些屬於 routes、哪些屬於共用導覽與 session 邏輯，決定拆頁後的檔案邊界；驗證方式：在實作說明中列出保留、搬移、新增的 page/component 檔案路徑。
- [ ] 新增 dashboard 導覽結構與頁面路由，至少包含 `web/app/dashboard/places/page.tsx`、`web/app/dashboard/routes/page.tsx`，並讓 `web/app/dashboard/page.tsx` 固定 redirect 到 `/dashboard/routes`；驗證方式：程式碼中可見新頁面、tab-like links 導覽與 redirect 邏輯，且不再由單一 page 同時渲染 place/route editor。
- [ ] 把 place 清單與 `PlaceEditor` 搬到 places 頁，保留建立、編輯、刪除 place 的現有 API 行為；驗證方式：places 頁程式碼可見 place list + editor，且 save/delete 仍呼叫 `/places` 相關 API。
- [ ] 把 route 清單、`RouteEditor` 與 `RouteSharePanel` 搬到 routes 頁，保留建立、編輯、刪除 route 與 share link 管理；驗證方式：routes 頁程式碼可見 route list + editor + share panel，且 share API 仍呼叫 `/routes/:id/share-link`。
- [ ] 新增 `web/components/PlaceMapEditor.tsx`，實作單一 marker 的 MapLibre 編輯器，能以 props 接收當前 `latitude` / `longitude`，並在點擊地圖或拖曳 marker 後回呼新座標；驗證方式：元件檔存在且從程式碼可見 map 初始化、marker 同步與 `onChange` 回傳流程。
- [ ] 更新 places 頁的 `PlaceEditor`，把經緯度欄位與 place 地圖做雙向同步；驗證方式：`PlaceEditor` 程式碼可見地圖元件掛載，且文字輸入/地圖移動共用同一組座標 state。
- [ ] 調整導覽與分享頁連結，讓公開分享頁與 copy 成功後的入口連回 `/dashboard/routes`，並把殘留的 `dashboard` 文案改成對應的 `routes` 入口文案；驗證方式：`web/app/share/[token]/page.tsx` 與相關 route/share UI 的連結目標與文字更新為新路由語意。
- [ ] 補齊必要樣式與響應式調整，確保 places/routes 拆頁後版面清楚，且 place 地圖加入後不會造成小螢幕破版；驗證方式：`web/app/globals.css` 或相關樣式檔有對應變更，並保留 dashboard 導覽可用。
- [ ] 執行 web 靜態檢查以攔住型別或格式問題；驗證方式：`cd web && npm run lint`、`cd web && npm run typecheck`、`cd web && npm run build` 全部通過。
- [ ] 做一次本機手動 smoke test，驗證 `/dashboard/places` 可用地圖建立/編輯 place、`/dashboard/routes` 可編輯 route 與管理 share link、公開分享頁仍能正確返回 route 管理流程；驗證方式：記錄使用的 dev stack 與操作結果（例如 `docker compose up -d postgres backend web` 後在瀏覽器操作成功）。

## Risks
- 若拆頁時仍保留大量共用 state 在單一 client component，可能只是把舊 dashboard 包兩層殼，沒有真正改善複雜度。
- Place map 與文字欄位同步若處理不當，可能出現 marker 與欄位值不一致。
- `/dashboard` 舊入口若沒有 redirect 或連結同步，可能讓分享頁、登入後導頁或使用者書籤落到不存在或空白頁。

## Completion Checklist
- [ ] Places 與 routes 已拆成獨立 dashboard 頁面，且 `/dashboard` 固定導向 `/dashboard/routes`，並由 `web/app/dashboard/places/page.tsx`、`web/app/dashboard/routes/page.tsx`、`web/app/dashboard/page.tsx` 的程式碼變更驗證。
- [ ] Web place editor 已能在 places 頁顯示可互動地圖，並由 `web/components/PlaceMapEditor.tsx` 與對應 page/editor 程式碼變更驗證。
- [ ] Sharing 流程未被拆頁破壞，且公開分享頁改為回到 routes 入口文案/連結，並由 `web/app/share/[token]/page.tsx` 的變更加上 routes 頁手動 smoke test 驗證。
- [ ] Web workspace 檢查皆通過，並由 `cd web && npm run lint`、`cd web && npm run typecheck`、`cd web && npm run build` 的成功結果驗證。
