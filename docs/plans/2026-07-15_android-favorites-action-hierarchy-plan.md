## Goal

簡化 Android Favorites 每列的操作層級：`Apply to map` 保持唯一主要動作，Edit 只保留一個直接入口，Rename、manual reorder 與 Delete 留在具名 overflow；降低重複選項但不移除任何 favorites 管理能力。

## Context

`FavoriteRow` 目前同時顯示 `Edit coordinates` / `Edit route` text button，`FavoriteRowMenu` 又重複同一 Edit action。這增加選擇噪音，也讓 overflow 的責任不清楚。Delete 已有確認 dialog，stable `libraryItemId` identity 與同名允許規則必須維持。

### Action priority

- **Primary:** Apply to map。
- **Secondary:** Edit coordinates / Edit route，直接顯示一次。
- **Contextual:** Rename；Manual sort 時才出現 Move up/down。
- **Destructive:** Delete，保留明確文字與確認，不得成為 primary/default。

## Non-Goals

- 不改 favorites persistence、sort mode、startup favorite 清理或 Map handoff。
- 不把 Edit 移到 Map 再要求第二次進入 edit mode。
- 不以 swipe 或長按作為唯一操作入口。

## Plan

- [x] 抽出 Favorite row action presentation model，依 item kind、sort mode、首尾位置產生直接與 overflow actions；先以 JVM tests 覆蓋 Place/Route、manual/non-manual、首/中/尾列。
- [x] 移除 overflow 中重複的 Edit，保留直接 `Edit coordinates` / `Edit route`，並讓 overflow 只含 Rename、條件式 reorder、Delete；以 source/action inventory 與 focused tests 驗證能力完整。
- [x] 調整 row layout 與 action wrapping，使 320dp、大字體、長名稱下 primary/secondary label 不直排、不截斷關鍵結果且 48dp touch target 可用；以 Compose preview/emulator 截圖驗證。
- [x] 檢查 overflow accessible name、focus return、disabled Move up/down、Delete confirmation 與 duplicate-name helper copy；以 TalkBack/keyboard-equivalent semantics inspection 與 dialog smoke 驗證。
- [x] 執行 `just android-check && just android-test && just android-build && just android-lint`，並記錄每項結果。

## Risks

- 移除錯誤入口可能使某種 item 無法 Edit；presentation tests 必須逐 kind 驗證。
- 直接 actions 在窄螢幕可能競爭；使用既有 `KestrelActionRow` wrapping，不縮小 target 或改成 icon-only。
- Reorder action 的 index 計算不可因 UI 重構改變 global/manual order 語意。

## Completion Checklist

- [x] 每列只有一個 Apply 與一個 Edit 入口，overflow 不再重複 Edit；以 action inventory 與 tests 驗證。
- [x] Rename、manual Move up/down、Delete 與 Map handoff 全部保留；以 Place/Route/manual-sort smoke 驗證。
- [x] 320dp、大字體、長名稱與 dense list 仍可掃讀和操作；以 preview/emulator evidence 驗證。
- [x] Delete 仍為次要 destructive action且有清楚確認/取消；以 dialog source 與手動 smoke 驗證。
- [x] Android formatting、tests、build、Detekt 全數通過。

## Evidence

- `FavoriteActionPresentationTest` 驗證 Place/Route direct actions、first/middle/last reorder 與 overflow 無重複 Edit。
- `Favorite row` reference 使用 320dp、1.2 font scale 及長名稱；Favorites empty/list references 亦已納入 screenshot validation。
- Overflow 保留具 item name 的 accessible label、Rename、條件式 Move 與 Delete confirmation；2026-07-15 Android 全套 gates 通過。
