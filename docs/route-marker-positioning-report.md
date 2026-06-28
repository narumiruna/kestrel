# Route markers 偏移問題處理報告

日期：2026-06-28

## 問題摘要

在 Web 開發環境的 Routes 測試資料中，route line 已正確畫出，但 waypoint markers 沒有落在 route line 上。使用者提供的 `image.png` 顯示 marker 2 之後開始逐步往右偏移，越後面的 marker 偏移越嚴重。

此問題已修正，使用者實測確認 markers 已回到 route line 上。

## 影響範圍

- 影響頁面：`/dashboard/routes`
- 影響元件：`RouteMapEditor` 的 MapLibre HTML markers
- 主要檔案：`web/app/globals.css`
- 不影響 route geometry / backend waypoint 資料；route line 本身使用正確座標。

## 調查過程

1. 先檢查 route marker 相關程式碼：
   - `web/components/RouteMapEditor.tsx`
   - `web/components/RouteMapPreview.tsx`
   - `web/app/globals.css`
2. 確認 line 與 marker 都使用同一組 waypoint 座標：
   - line：`[waypoint.longitude, waypoint.latitude]`
   - marker：`.setLngLat([waypoint.longitude, waypoint.latitude])`
3. 因為座標來源一致，問題不在資料排序或經緯度顛倒，而是在 marker DOM/CSS 位置。
4. 用 Chrome DevTools Protocol 量測 marker：
   - 修正前，MapLibre 寫入的 `transform: translate(...)` 與實際 `getBoundingClientRect()` 中心點不一致。
   - marker 2、3、4... 的誤差逐步增加，符合「marker 元素仍參與 inline layout，然後再套 MapLibre transform」的現象。

## 根因

`web/app/globals.css` 中有一段：

```css
button.route-marker {
  position: relative;
}
```

這會覆蓋 MapLibre 內建的 marker CSS：

```css
.maplibregl-marker {
  position: absolute;
}
```

原因是 `button.route-marker` 的 specificity 高於 `.maplibregl-marker`，而 route marker 元素同時有：

```html
<button class="route-marker ... maplibregl-marker ...">
```

結果 marker 不再是 absolute positioned element，而是留在正常 inline flow 中。MapLibre 仍然套用 `transform: translate(...)`，但 transform 是從錯誤的 inline layout 起點開始算，因此每個 marker 的 inline 寬度會累積成越來越大的偏移量。

## 修正方式

移除 `button.route-marker { position: relative; }`，讓 MapLibre 繼續擁有 marker positioning。

修正檔案：

- `web/app/globals.css`

實際變更：

```diff
-button.route-marker {
-  position: relative;
-}
```

這是最小修正：沒有改 route 資料、沒有改 MapLibre marker 建立邏輯，也沒有新增額外 wrapper。

## 驗證方式

### 開發環境

使用 dev web stack：

```bash
just webtest-up
```

驗證頁面：

```text
http://localhost:3401/dashboard/routes
```

### 自動量測

使用 Chrome DevTools Protocol 實際開頁、登入 dev `admin / admin`、等待 route markers 與 canvas 載入，並量測每個 marker 的實際中心點是否等於 MapLibre 設定的 translate 目標點。

修正後量測結果：

```json
{
  "maxError": 0,
  "markers": [
    { "label": "1", "error": 0, "position": "absolute" },
    { "label": "2", "error": 0, "position": "absolute" },
    { "label": "3", "error": 0, "position": "absolute" },
    { "label": "4", "error": 0, "position": "absolute" },
    { "label": "5", "error": 0, "position": "absolute" },
    { "label": "6", "error": 0, "position": "absolute" },
    { "label": "7", "error": 0, "position": "absolute" }
  ]
}
```

### 截圖驗證

用 Chrome DevTools 實際拍攝修正後畫面：

```text
/tmp/kestrel-route-after.png
```

截圖確認 1–7 markers 的圓點中心都貼在橘色 route line 上。

### Quality checks

已執行：

```bash
just web-check
cd web && npm run typecheck
```

兩者皆通過。

## 防止再發

已在 `docs/MEMORY.md` 加入 gotcha：不要在 `button.route-marker` 上設定 `position`，MapLibre marker 的定位必須由 `.maplibregl-marker { position: absolute; }` 控制。
