# Web workspace information architecture plan

## Goal

讓 Web 清楚分成三個穩定工作區：**Map 負責建立與編輯、Library 負責搜尋／整理／預覽、Account 負責帳號與偏好設定**。本計畫建立在 Route workspace UI 修正 PR #314 之上，保留既有資料與安全契約，消除跨頁角色重疊、同步／儲存文案混淆、Library 缺乏預覽，以及 Account 高風險操作仍塞在 popover 的問題。

成功條件是使用者能在 Map 專注編輯、在 Library 保留搜尋脈絡後開啟內容、在獨立 Account 頁面完成外觀與安全管理；桌面、tablet、mobile、鍵盤與 assistive technology 都有明確且不重複的操作路徑。

## Context

- 本計畫的 implementation baseline 是 branch `narumi/fix/web-route-workspace-ui` 與 PR #314。該 PR 已完成 route map capability、fatal／preview fallback、44px 編號 marker、Path → Playback → Save & use、Saved places dialog、manual Save presentation 與窄螢幕 contextual panels；不可在後續工作重新引入舊問題。
- `MapLibraryPanel` 與 `LibraryCatalog` 都讀取同一組 Places／Routes，但前者是 Map 內的選取器，後者目前每列直接導向 Map。介面尚未清楚區分「快速選取」與「管理／預覽」。
- 1440×900 Chrome baseline 顯示 Map 左／右面板為 320px／440px，已有收合按鈕但寬度固定、狀態不保存；MapLibre canvas 在面板下方仍是 1440px 全寬，而 `fitWaypoints()` 只使用固定 56px padding，因此 fitted content 可能落在浮動面板下。
- Route inspector 已有三段任務順序且 clean route 不再顯示 disabled Save；仍有永久顯示的 route-name input、未選取 waypoint 大卡片，以及預設收合的完整 waypoint list。常見 route 需要更直接的 Path 管理，但 1000-waypoint route 不可無條件掛載昂貴列表。
- `PlaceEditor` 仍永久顯示 Save，clean state 與 Header 的 `Updated just now` 容易被誤解為內容已保存。Header 的狀態實際表示 library data refresh，不是 draft persistence。
- 1440×900 Library baseline 有 10 個 item、10 個重複的直接 Share 按鈕、無 preview panel，catalog 高度約 1449px。現有 API 已提供 name、description、tags、mode、waypoint count、distance source、`updatedAt` 與 `LibraryItem` metadata，可支援 client-side search、sort 與部分 filter；沒有 address、item/device assignment 或 bulk-operation contract。
- `/dashboard/library/places` 與 `/dashboard/library/routes` 是現行頁面，Map、`FieldNotebook` 與 `FavoriteWaypointPicker` 都會導向它們；`/dashboard/places` 與 `/dashboard/routes` 也分別 redirect 至這兩個入口。Library URL state 改版必須保留 bookmark 與內部連結相容性。
- Account menu baseline 是約 360×420px popover，內含 theme、完整 password form、Account link 與 Logout；`/dashboard/account` 已存在並管理 OIDC、sessions 與 Android devices，但頁首又使用第二套含 password form 的 `UserMark` popover。
- OIDC account link 的 provider return URI 固定為 `/dashboard/account/oidc`；該頁負責驗證 callback、交換 link ticket 與 retry，成功後才導向 `/dashboard/account?oidc=linked` 顯示 notice。Account route 拆分不可把兩者視為同一個 callback。
- `User` schema 只有 username 與 authentication fields，沒有 email、avatar、editable profile 或 account-deletion endpoint。這些能力不能以純 UI 假裝存在。

## Architecture

- **Map** 保持唯一 canonical Place／Route editor。Map 左欄是「快速選取目前 Library item」，不承擔刪除、批次管理或完整 filter；右欄保持單一垂直 draft，不新增另一套 editor。
- **Library** 改為 URL-addressable master-detail catalog。query、type、sort、filter 與 selected ID 由 search params 擁有，桌面顯示 list + read-only preview，窄螢幕在 list／detail 間切換；`Open on map` 才進入 canonical editor。既有 `/dashboard/library/places`、`/dashboard/library/routes` 與 legacy redirects 保持相容，並正規化到同一份 canonical URL state。
- **Account** 使用共用 account layout 與獨立 routes：`/dashboard/account`（read-only overview）、`/dashboard/account/appearance`、`/dashboard/account/security`、`/dashboard/account/sessions`。`/dashboard/account/oidc` 保留為專用 OIDC link callback／exchange boundary，`/dashboard/account?oidc=linked` 保留成功 notice 相容性；Header account menu 只保留導覽、compact `system | light | dark` control 與 Sign out，不提交 password 或其他高風險資料。所有 Account route entry 都必須沿用 Map 的 draft navigation guard，不以 client-side `Link` 繞過未儲存變更確認。
- **Persistence semantics** 保持 manual Save。Route revision、Device current draft 與 Share saved revision 的既有契約不變；Header 改稱 `Library refreshed …`，Place／Route 各自呈現 `Unsaved changes`、`Saving…`、`Saved just now` 與 save error，不宣稱 auto-save 或 offline draft persistence。
- **Panel state** 由一個可測試的 local preference model 擁有 collapsed state 與 desktop widths，輸入必須 versioned、clamped 且能在 unavailable Web Storage 下安全降級。Tablet／mobile 不套用 desktop persisted widths。
- **Map safe area** 由目前 header、panel visibility 與 panel widths計算，再傳入 MapLibre fit/padding；panel resize 或 collapse 後呼叫 map resize，避免 marker、route 與 map controls 被面板覆蓋。
- **Route sections** 保留 Path → Playback → Save & use 的 DOM／focus 順序，以 sticky section navigation 或 anchor links降低長距離捲動，不使用會 unmount draft fields 的 wizard。常見 route 直接呈現 waypoint manager；dense-route 策略必須先以 50／1000 點效能與鍵盤證據決定。
- 全部互動元件繼續使用 Radix Themes／Primitives／Colors／Icons；地圖只使用 MapLibre。新增 helper 時優先拆出 pure state／presentation functions，避免在大型 page component 再堆 URL、preference 與排序邏輯。

## Non-Goals

- 不加入 route／place auto-save、offline draft、revision restore、GPX／KML、route recording 或第二套 editor。
- 不新增 email、avatar、editable username、account deletion、signed-in TOTP management 或其他目前沒有 Backend contract 的 Account 功能；若產品需要，另建含 migration、安全性、step-up 與 data-erasure 規則的計畫。
- 不在本計畫新增 per-waypoint speed／pause 編輯。現有 Web 只保留 metadata；編輯語意需先和 Android playback、sync 與 Backend validation 建立跨平台契約。
- 不新增 geocoding/address provider，因此 Library 不宣稱有 address search/filter；Place 以 name、notes、tags、coordinates 與 updated time 呈現。
- 不做 bulk delete/share/assignment。現有 API 沒有 bulk transaction、partial-failure 或 undo contract，不能以 client-side request loop 假裝原子操作。
- 不新增 item-to-device assignment；現有 Device 功能是向選定裝置送出一次性 command，文案保持 `Play on device`，不改稱 `Assign device`。
- 不在 Header 再加一個重複的 global New CTA；Map 保留明確的 contextual create，Library 使用同一組 `New place`／`New route` destinations 與 labels。
- 不全面重寫 legacy CSS 或一次建立新的 design-system package；只收斂 Map、Library、Account 擁有的 scoped tokens/rules。

## Plan

- [ ] 在 PR #314 合併後從最新 `origin/main` 建立 focused branch，並用 Chrome DevTools 在隔離 local stack 記錄 1440×900 的 Map、Library、Account baseline；證據需包含 panel／header dimensions、fit-route 遮擋、Library row/action count、Account popover size、keyboard focus order，截圖一律放 repository 外。
- [ ] 先解決兩個實作 unknown：比較直接 waypoint list 在 50／1000 點的 mount、scroll、focus 與 selected-row jump 成本，並驗證一個 read-only Library MapLibre preview 在 place、2-point、50-point、1000-point 與 WebGL failure 下的成本；把選定的 bounded rendering/fallback 規則寫回本計畫後才開始 UI 重構。
- [ ] 抽出並以 Node tests 鎖定 workspace presentation helpers：manual-save label、Library search-param parsing/serialization、sort/filter comparators、panel preference versioning/clamping，以及 panel-aware map padding；測試 malformed URL/storage、unknown enum、unavailable storage、極端 widths、collapsed panels 與 narrow viewport fallback。
- [ ] 更新 `WorkspaceHeader`／`DashboardShell` 的同步語意：將 `Updated …` 改為 `Library refreshed …` 或精確 error，使用 Radix `Hint` 為 Refresh 提供可見 tooltip，保持目前約 68px header 與 draft navigation guard；Chrome 驗證 refresh 不會被理解為 Save 或 Reset。
- [ ] 將 `WorkspaceHeader` account popover 改成小型 Radix menu，只呈現 username、`View account`、compact `Appearance` mode control／settings entry 與 `Sign out`；移除 password form、API mutation與大型 popover state，並驗證 Escape／outside click／route navigation 的 focus return。`View account`、`Appearance settings` 與未來所有 account-menu route entry 都必須呼叫既有 `onBeforeWorkspaceChange`／`navigateIfDraftSafe` contract；tests 覆蓋 dirty draft 的 cancel（不導覽、不清 draft）與 confirm（只導覽一次）。`Appearance settings` link 與可用的 `/dashboard/account/appearance` page 必須在同一 PR slice 交付，不可合併指向未建立 route 的 menu。
- [ ] 擴充 `ThemeProvider` 為可測試的 `system | light | dark` preference，保持既有 `kestrel-theme` 相容讀取與 unavailable localStorage fallback；在同一個 shared-chrome slice 建立 Account Appearance page 與明確 radio selection，並在 Header menu 保留 compact 三態 selector 或 submenu，讓使用者不需離開目前 workspace 即可切換 mode。
- [ ] 建立共用 Account layout/navigation，將現有 `/dashboard/account` 拆成 overview、Appearance、Security、Sessions & devices；overview 只顯示目前可取得的 username 與導覽，不偽造 email/avatar 編輯，OIDC／password 留在 Security，session/device revoke 留在 Sessions。保留 `/dashboard/account/oidc` 的 provider return、callback validation、link-ticket exchange 與 retry 責任，以及 `/dashboard/account?oidc=linked` 的成功 notice 相容性；route-level tests 必須覆蓋 callback 完成／重試及 notice 清除，證明拆頁不會中斷 account linking。
- [ ] 將 Account security data loading 拆成各頁需要的 bounded requests 與獨立 loading/error/retry state，移除 `UserMark` 的重複 popover，保留 current-password step-up、current-session logout、other-session/device revocation、queued-command cancellation 與 focus-return 語意；以既有 Backend tests 加 Web browser failure fixtures驗證 partial failure 不會清空其他可用區段。
- [ ] 在 `Stage` 與 Map page 加入 desktop-only accessible panel resizing：pointer drag handle 必須可 focus，使用 `role="separator"`、`tabIndex={0}`、`aria-orientation="vertical"`、可讀 label、`aria-controls`，並以 `aria-valuenow`／`aria-valuemin`／`aria-valuemax` 暴露目前與 clamped width range；方向鍵提供 keyboard resize、double-click/reset 回復 defaults。保存 clamped left/right widths 與 collapse state，窄於 1024px 時仍使用既有 Map／Choose／Edit contextual layout而不套用 desktop positions；keyboard／screen-reader 驗證必須證明 handle 可發現、width value 會被宣告且調整後同步更新。
- [ ] 將 panel visibility/widths 轉成 MapLibre safe-area padding，更新 `RouteMapEditor`／Place map controls 的 fit behavior 與 external control placement；驗證初始 load、resize、collapse/restore、selected waypoint focus、route fit 與 2／50／1000 點都不落在 header、兩側 panel、scale 或 control stack 下。
- [ ] 重新定義 Map picker 為 Library quick picker：加入簡短 scope copy與 `Manage in Library` link，保留 kind-specific `New place`／`New route`，提供最近更新／名稱排序但不複製完整 Library filters；用非完成語意的 selected indicator、accent line、`aria-pressed`/`aria-current` 與 visible focus 清楚表示目前 editor target。
- [ ] 將 Place／Route identity 改為 compact read state + 明確 `Edit name` control；切換 edit/cancel/save-draft 時保持 form validation、dirty detection、focus return 與 draft navigation guard，避免永久大型 input，同時讓 long name、empty new item、save error 都不改變 object identity。
- [ ] 精簡 Route inspector 而不重做 editor：加入 Path／Playback／Save & use sticky section navigation，降低 nested-card/radius 密度，將 `No waypoint selected` 改為輕量 instruction；marker/list selection 應定位地圖並將 waypoint manager 捲到對應 row，完整列表依已驗證的 dense-route rendering規則直接可達且保留 drag、Move up/down、duplicate、edit、remove、Undo/Redo 的 keyboard alternatives。
- [ ] 將 `PlaceEditor` 對齊 Route manual-save presentation：new、clean、dirty-valid、dirty-invalid、saving、success、error 都有具體 title/reason；clean existing Place 不永久顯示大型 Save，failed save 保留完整 draft，Share 只使用成功保存的 Place snapshot。
- [ ] 將 Library state 移到 search params，實作既有資料可支援的 search、sort 與 filters：name/notes/tags/mode search；updated/name sort；type/tag/playback-mode filters；空結果顯示 active filters 並可單獨清除或 `Clear all`。Back/Forward、reload 與分享 URL 必須恢復相同 list state 和 selected preview；`/dashboard/library/places`、`/dashboard/library/routes` 必須保留為相容頁面，或將已知 search params 安全 redirect 到對應 canonical type state，同時保留 `/dashboard/places`、`/dashboard/routes` 的 legacy redirects。route-level tests 覆蓋四個既有入口、直接 bookmark／reload 與目前內部 navigation callers。
- [ ] 將 Library desktop 改成 list + preview：row click/keyboard selection只更新 preview，preview 顯示 read-only MapLibre place marker 或 route line、name、notes、tags/mode、updated time、share status load state，以及 `Open on map` 主動作；WebGL/preview failure 退回 metadata，不阻止搜尋、選取或開啟 Map。
- [ ] 收斂 Library row actions：移除每列重複的直接 Share button與語意不明箭頭，整列使用清楚 selection semantics；Share／Delete 放入 `⋯`，selected preview 提供可見 Share，Delete 保持高風險確認且不宣稱可 undo。驗證 menu/dialog focus return、partial share-load error 與刪除後 selection fallback。
- [ ] 建立 Map ↔ Library return flow：`Open on map` 帶入 stable item ID、fit request 與受限的 internal return target；Map 顯示不重複主導覽的 `Back to Library` context action，並在 dirty draft 時沿用 discard guard。返回後應恢復 Library query/filter/sort/selection/scroll context。
- [ ] 在 `workspace-theme.css`、`map-workspace.css` 與 Library/Account scoped styles 收斂 radius、surface、border、typography 與 semantic colors；避免 card-in-card，保留品牌橘為主要 action/selection、red 為 danger/error、green 為 success/readiness，computed text contrast 至少 4.5:1、focus/control boundary 至少 3:1。
- [ ] 更新 `docs/web-cloud-guide.md` 與必要的 Web README，明確記錄 Map／Library／Account 角色、manual Save、Header refresh、Library preview/Open flow、Device command與 Share snapshot 差異、Account route用途，以及目前沒有 auto-save/offline draft/profile editing/bulk action；文件文案必須和 UI labels 一致。
- [ ] 以 Chrome DevTools 驗證 1440×900、1024×768、768×1024、390×844、320px 與 200% zoom：desktop resizer/persistence、tablet drawer/context panel、mobile Library list/detail、Account navigation、account-menu quick theme switching、dirty-draft account-link cancel／confirm、single primary scroll owner、44px common targets、visible focus、no horizontal overflow、reduced motion、light/dark/system，以及 Map／Library draft/selection不重設；截圖保留在 repository 外。
- [ ] 依 PR 邊界交付以降低回歸：先 shared chrome + minimal Account layout／Appearance route + Account menu/theme，次完成 Account overview／Security／Sessions route split，再 Map panel/safe-area/editor polish，最後 Library master-detail/cross-flow + docs；第一個 slice 必須以 route test 與 browser navigation 證明 `Appearance settings` 不會 404、quick mode control 不需離開 workspace、dirty draft 會攔截 account route navigation，每個 PR 都從當時最新 main 建 branch、只含該 slice、通過受影響 checks，且不得用未完成後續 PR 掩蓋該 slice 的 broken state。
- [ ] 執行 `just web-check`、`just web-lint`、`cd web && npm test`、`cd web && npm run typecheck`、`cd web && npm run build` 與 `git diff --check`；若碰觸 Backend contract，另跑完整 Backend lint/test/e2e/typecheck/build。還原非預定的 `web/tsconfig.tsbuildinfo`，審查完整 diff 不含 image binary、第二套 UI/map library、無關變更或被弱化的 security/lifecycle guard。

## Risks

- Library preview 會新增第二個頁面中的 MapLibre instance；若與大量 route geometry 同時造成明顯延遲，必須使用單一 selected preview、bounded GeoJSON rendering 與 metadata fallback，不可為列表每列建立 map。
- 可拖曳 panel 若直接改 DOM width，可能造成 MapLibre canvas、marker transform 與 fit padding不同步；寬度必須由單一 state/model驅動並在每次 commit resize後通知 map。
- persisted UI state 可能因未來 layout 變更失效；storage payload 必須 versioned、validated、clamped，且清除/拒絕 malformed value 不得影響 draft data。
- Library URL state和 Map return target若未限制，可能造成過長 URL、history spam或 open redirect；只允許已知 enum、bounded query與 repository-internal paths，拖曳／typing 使用 replace而非每次 push。
- Account 分頁會碰到 security-sensitive mutations。不得把 current-password step-up、OIDC nonce/state、session ownership、device revocation或 logout清理邏輯搬成純視覺捷徑。
- 直接 waypoint list可改善 discoverability，但 1000 rows會增加 DOM、focus與 assistive-technology成本；未完成 bounded rendering evidence前不得移除現有 progressive disclosure fallback。
- 本計畫刻意不提供 account deletion、bulk delete或 auto-save。UI與文件必須說明真實能力，不能以 disabled placeholder暗示已支援。

## Completion Checklist

- [ ] Map、Library、Account 的角色在 global navigation、頁面 heading、empty/error copy與文件中一致；Map picker不再看起來像第二個管理型 Library。
- [ ] Header refresh狀態與 Place／Route manual-save狀態不再共用 `Updated/Saved` 語意；clean draft無大型 disabled Save，failed save保留資料和 Retry path。
- [ ] Desktop Map panel可收合、鍵盤/指標 resize並安全保存偏好；focusable separator 的 orientation、controlled pane與 current/min/max width可由 assistive technology取得，Fit route/place和 controls在所有 panel組合下不被遮擋，tablet/mobile不繼承無效 desktop width。
- [ ] Route identity與 inspector比目前更緊湊，Path／Playback／Save & use可快速導覽；常見 route直接管理 waypoints，50／1000點仍符合已記錄的效能、focus與overflow門檻。
- [ ] Library具有 URL-restorable search/sort/filter/selection、desktop preview、mobile detail flow和明確 `Open on map`；rows不再重複 Share，也不以模糊箭頭暗示行為，四個既有 Places／Routes URL 入口仍以 route-level tests 證明可恢復正確 type state。
- [ ] 從 Library進入 Map及返回時保留 selected item與 catalog context，dirty Map draft仍受 navigation guard保護。
- [ ] Header account menu不含 password或其他敏感 form，保留不離開 workspace 的 compact 三態 Appearance control，`Appearance settings` link與可用 route在同一 slice交付，且所有 Account links 都通過 draft navigation guard；Appearance、Security、Sessions & devices位於獨立 Account routes，`/dashboard/account/oidc` callback／exchange 與 `/dashboard/account?oidc=linked` notice 保持相容，現有 OIDC/session/device security契約和focus recovery皆有證據。
- [ ] 沒有虛構 email/avatar/address/device assignment/offline save/undo delete/bulk action；所有 unsupported能力都從 UI與文件排除或明確標示非功能。
- [ ] scoped visual tokens、semantic colors、44px targets、keyboard alternatives、tooltips、non-color state cues與WCAG contrast門檻在 desktop/tablet/mobile、200% zoom及 light/dark/system下通過 Chrome evidence。
- [ ] 所有受影響 Web checks、必要 Backend checks、unit tests、production build與 `git diff --check`通過；final diff不含 generated cache、image binary、無關檔案或 lifecycle/security regression。
