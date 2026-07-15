## Goal

降低 Web Library 在手機窄寬下每列的垂直操作密度，同時保留 `Open on map` 的主要地位、Share 的可發現性與 More 中的管理/刪除能力；並統一 route mode 顯示為使用者可讀的 `Ping-pong`。

## Context

目前 `390×844` 下每個 Library item 會將 `Open on map`、`Share`、`More` 各自撐成全寬三列，長清單產生大量捲動。Desktop 的 inline actions 清楚，不應為了 mobile 改壞。`utils.ts` 與 Route editor 仍顯示 implementation-shaped `PingPong`。

### Information hierarchy

1. Item identity、必要 metadata 與短描述。
2. `Open on map` — 唯一 primary。
3. `Share` 與 `More` — 同列 secondary/contextual。
4. Delete — More 內明確 destructive action與確認。

## Non-Goals

- 不移除 Share、Delete、rename/management 或 Open-on-map handoff。
- 不把整列變成唯一 click target而失去明確 action semantics。
- 不修改 backend enum/API payload；只改 display label。

## Plan

- [x] 將 mobile `.library-item-actions` 定義成 `Open on map` 全寬、Share/More 同列的穩定 grid/flex hierarchy；以 `320×568`、`390×844` browser screenshots 與 `scrollWidth <= innerWidth` 驗證。
- [x] 檢查 1024/1200/1440 desktop/tablet layout，確保 action 不換成不必要的多列且 dense rows 仍可比較；以 browser screenshot 與 50+ row DOM fixture 驗證。
- [x] 保留 Share 文字入口與 More label/summary，檢查 focus order、Escape/close、dialog focus return、Delete confirmation 與 44px targets；以 keyboard-only browser smoke 與 DOM accessible-name inspection 驗證。
- [x] 建立單一 route mode display formatter，讓 summary、editor option、Library metadata 統一顯示 `Ping-pong`，payload 仍為 `PING_PONG`；以 formatter unit test或 bounded source assertions驗證。
- [x] 實際開啟 `/dashboard/library`、`/dashboard/map?kind=routes` 的 light/dark 與窄/寬 viewport；記錄 URL、viewport、state 與 screenshot path。
- [x] 執行 `just web-check`、`just web-lint`、`cd web && npm run typecheck`、`cd web && npm run build` 與 `git diff --check`。

## Risks

- 將 Share 收得太深會增加常用分享成本；Share 保持直接可見，不放進 More。
- 兩欄 secondary actions 在 320px/長翻譯可能過窄；允許按鈕級 reflow，但不得縮小 target 或字體。
- CSS global button rules可能影響 MapLibre marker；所有新 selector 必須限制在 `.library-item-actions`。

## Completion Checklist

- [x] 320/390px 每列最多兩個 action rows：Open primary 一列，Share/More 一列；以 screenshots 與 DOM geometry 驗證。
- [x] Desktop/tablet hierarchy與 dense-list scanning 未退化；以 1024/1200/1440 browser evidence 驗證。
- [x] Share、More、Delete、Open on map 的 keyboard/pointer/touch paths 全部保留；以 interaction smoke 驗證。
- [x] 所有 Web route mode 顯示統一為 `Ping-pong`，API enum 不變；以 tests/source evidence 驗證。
- [x] Web lint、typecheck、production build、diff check 全數通過，並完成實際 browser review。

## Evidence

- Browser review：`http://127.0.0.1:3401/dashboard/library` 於 320×568、390×844、1024×768、1200×792、1440×900、dark 與 55-row fixture；`/dashboard/map?kind=routes` 於 mobile/desktop light/dark。
- Committed snapshots 包含 mobile/desktop/dark Library、320px、dense、Map、Share dialog 與 public Share；geometry assertions 驗證無 horizontal overflow。
- Playwright 驗證 `Ping-pong` editor option、Share public lifecycle、dialog labels/Escape、Open/Choose/Edit 與 axe；2026-07-15 Web check/lint/typecheck/build 全數通過。
