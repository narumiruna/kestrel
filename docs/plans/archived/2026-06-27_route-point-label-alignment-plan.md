## Goal

修正 Web Routes 地圖上的 route point label/marker 對齊，讓每個 waypoint 的 label 穩定貼在對應 point 上；成功條件是同一路線在初始 fit、zoom out compact、hover、selected、zoom in 後，label 編號順序與 marker 位置一致，且 route line / overlay 不異常。

## 已確認的事實

- 已用 headless Chrome + SwiftShader 實際開啟 `http://localhost:3301/dashboard/routes` 與 production-like `http://localhost:3401/dashboard/routes`，不是只看程式碼推測。
- 測試路線 `Visual label alignment smoke` 有 12 個 waypoints，API 傳入的 latitude/longitude 正確；`RouteMapEditor.tsx` 對 marker 與 route line 都使用 `[waypoint.longitude, waypoint.latitude]`。
- 截圖證據：`/tmp/kestrel-route-label-before/before-initial-fit.png`、`/tmp/kestrel-route-label-before/before-zoom-out-hover-6.png`、`/tmp/kestrel-route-label-circle/circle-initial-fit.png`、`/tmp/kestrel-route-label-circle/circle-zoom-out-hover-6.png`。
- 初始 fit / zoom in 時 marker label 順序為 1..12，route line 也連到同一路徑。
- zoom out 進入 compact marker 後，第 2..11 點套用 `route-marker-compact`，但實際 DOM 尺寸是 `14px × 36px`，不是 CSS 期望的 `14px × 14px`。
- 所有 route marker 的 computed `min-height` 都是 `36px`，來自全域 `button { min-height: 36px; }`。

## 推論

- 主要問題不是地理座標、MapLibre projection、devicePixelRatio、或 render timing；marker 與 route line 使用相同座標資料，且不同 zoom 下順序穩定。
- 偏移/聚集感來自 marker DOM 元素高度被全域 button 樣式撐高；MapLibre anchor 以實際 DOM box 計算，compact marker 的 label pseudo-element 也用被撐高的 `100%` 當定位基準。

## 尚未確認的未知事項

- 使用者參考截圖是否完全對應 compact marker 狀態；目前已重現一個明顯錯位區域（zoom out + hover label 6）。
- 高 DPR/retina 下是否有獨立誤差；目前 Chrome 驗證 DPR=1，修正方向是 CSS 尺寸歸零，理論上不依賴 DPR。

## 可能原因列表

1. 全域 `button { min-height: 36px; }` 污染 MapLibre marker button，讓 `height: 24px/14px` 不生效。
2. compact label `::after { bottom: calc(100% + 6px); }` 以錯誤的 36px 高度定位。
3. selected / hover 的 CSS `transform` 可能與 MapLibre inline transform 互相覆蓋；目前不是這次錯位的主因，因 inline transform 仍由 MapLibre 控制。
4. map projection / render timing / DPR 目前沒有證據支持為主因。

## 建議修正方向

採最小修正：在 `button.route-marker` 明確重置 button 的 `min-height`，保留較大的 button hit target，並用 `::before` 畫出單純 `14px` 圓點；label 改由 `::after` 依 `data-label` 顯示在圓點旁。compact zoom 時中間點仍是圓點，hover / selected 才顯示 label，避免密集路線聚集。MapLibre anchor、視覺圓點、label pseudo-element 都以同一個 marker center 對齊。

## Plan

- [x] 在 `web/app/globals.css` 的 `button.route-marker` 樣式加入 `min-height: 0`，避免全域 button min-height 影響 MapLibre marker；已由 `/tmp/kestrel-route-label-circle/circle-metrics.json` 驗證 button hit target 穩定為 `32×32`。
- [x] 將 route marker 視覺本體改成 `::before` 單純圓形，label 移到 `::after`；已由 `/tmp/kestrel-route-label-circle/circle-initial-fit.png` 驗證。
- [x] compact zoom 時讓 selected marker 保留 compact label positioning，hover / selected label 顯示在圓點上方；已由 `/tmp/kestrel-route-label-circle/circle-zoom-out-hover-6.png` 與 `circle-selected-6.png` 驗證。
- [x] 執行 Web lint/format 檢查與 production-like build，確保 CSS/TS 變更可建置；已由 `just web-check` 與 `docker compose -f compose.webtest.yaml up -d --build web` 通過驗證。
- [x] 用瀏覽器重新截圖驗證初始 fit、zoom out compact + hover、selected、zoom in；已由 `/tmp/kestrel-route-label-circle/circle-*.png` 與 `circle-metrics.json` 驗證。

## 風險與回歸測試項目

- 風險：route marker 視覺圓點較小但 hit target 保留 `32×32`；回歸測試需點選 marker 6 確認 selected 狀態仍生效。
- 風險：普通 route editor map 與 cartographer background map 共用 `.route-marker`；回歸測試需至少確認 Routes dashboard markers 與 route line 正常。
- 風險：public share preview 使用 `span.route-marker`；button-only dot/label CSS 必須維持 `button.route-marker` scope，避免 preview label 消失或空 `::after` pill。

## Completion Checklist

- [x] CSS/TS 修正已限制在 route marker 顯示邏輯，並由 `git diff -- web/app/globals.css web/components/RouteMapEditor.tsx` 驗證。
- [x] zoom out compact marker 尺寸已從 `14×36` 變成穩定 `32×32` hit target，且 final visual marker 維持單純 14px 圓點，由 `/tmp/kestrel-route-label-before/before-metrics.json` 與 `/tmp/kestrel-route-label-circle/circle-metrics.json` 驗證。
- [x] label/marker 在初始 fit、zoom out + hover、selected、zoom in 截圖中對齊，且 route line / overlay 無異常，由 `/tmp/kestrel-route-label-circle/circle-*.png` 驗證。
- [x] `just web-check` 與 production-like `docker compose -f compose.webtest.yaml up -d --build web` 通過。
