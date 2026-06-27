## Goal

修正 Kestrel Cloud route editor 中 marker label 擁擠造成的位置判讀問題，並確認 route path 與右側設定面板 layout 在瀏覽器中可用。

## Context

已用 production-like webtest stack (`http://localhost:3401`) 建立新 route `UI route editor check 023916`，並用 browser screenshot 檢查 route editor。截圖與 metrics 在 `/tmp/kestrel-ui-before/`。

## 已確認的事實

- Route polyline 目前是 `RouteMapEditor.toLineFeature()` 直接用 waypoint 順序產生 GeoJSON `LineString`，座標格式是 `[longitude, latitude]`，與 marker 使用相同資料。
- Kestrel 目前沒有道路 routing / snapping 服務；直線段是目前資料模型的顯示方式，不是 waypoint ordering 或 lat/lng 反轉。
- 新增測試 route 的 waypoint 1/2 很近；`/tmp/kestrel-ui-before/before-initial-fit.png` 顯示 label 1/2 在非 compact zoom 下重疊。
- 右側 panel 在 1440×1000 截圖中可完整看到 Description 與 footer；尚未發現 footer 覆蓋表單的 current-main regression。

## Plan

- [x] 新增 route 進行瀏覽器檢查；以 `/tmp/kestrel-ui-created-route.json` 與 `/tmp/kestrel-ui-before/before-initial-fit.png` 驗證。
- [x] 修改 dense route 的 label 顯示規則：waypoint 數量達 compact threshold 時，中間 waypoint label 預設隱藏，只在 hover / selected 顯示，terminal labels 保持可見；以 `web/components/RouteMapEditor.tsx` diff 驗證。
- [x] 保持 route path 為 raw waypoint straight segments，不新增 routing/snapping 依賴，並更新 route editor / mode bar hint 說明 straight segments；以 `RouteMapEditor.toLineFeature()` 現況、README mock-route 行為、`RouteEditor.tsx` / `routes/page.tsx` diff 驗證。
- [x] 重新用 browser screenshot 驗證新增 route `UI route editor after 024948` 的 initial fit、zoom out、hover、selected、zoom in；以 `/tmp/kestrel-ui-final-slow/*.png`、`/tmp/kestrel-ui-after/*.png` 與 metrics 驗證。
- [x] 執行 Web quality gate；以 `just web-check` 驗證。

## Risks

- Dense route 中間 label 預設隱藏會少顯示編號；但可透過 hover / selected 與 waypoint list 判讀，避免重疊比強制全顯示更穩定。
- 真正道路 routing/snapping 需要外部 routing service 或內建路網資料；本次不引入新服務或大改架構。

## Completion Checklist

- [x] Browser 中已新增 route 並截圖確認問題。
- [x] Dense route label 不再大量重疊，hover / selected label 仍貼近對應 pin；`/tmp/kestrel-ui-final-slow/slow-initial-fit.png` 顯示起點附近只保留 terminal label。
- [x] Route line、pins、labels 在 zoom in/out 後仍對齊且 waypoint 順序為 1..12。
- [x] 右側 panel 在驗證截圖中 Description 與 footer 可見，未被 footer 遮住。
- [x] `just web-check` 通過。
