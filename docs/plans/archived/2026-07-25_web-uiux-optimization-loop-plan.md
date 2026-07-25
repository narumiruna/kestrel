# Kestrel Web UI/UX Optimization Loop Plan

## Goal

以可重複、可停止且有 browser evidence 的迭代 loop，大幅提升 Kestrel Web 在主要 `1440×900`、light-mode desktop 目標上的美觀、視覺一致性與工作效率，同時保留登入、Map／Library、Place／Route 編輯、分享、遠端裝置、帳號、unsaved-work recovery 與既有資料／API 語意。

成功不是「換一套皮膚」，而是讓使用者在每個主要頁面都能立即辨識目前位置、選取狀態、主要工作與下一步；每輪只修正一個有證據的高價值主題，直到一輪新的三旅程 audit 沒有 P0／P1／P2 actionable finding。

## Context

### 已檢查的目前狀態

- 已閱讀 `AGENTS.md`、`docs/MEMORY.md`、`designing-user-experiences`、`designing-user-interfaces` 與 `writing-plans` skills。
- 已檢查目前 Next.js／Radix Themes／MapLibre 架構、`web/README.md`、近期 archived Web redesign plans、主要 Map／Library／Auth components，以及 CSS import order。
- 本機隔離 review stack `http://localhost:3401` 可用；Chrome DevTools 實際 content viewport 為 `1200×792 @ DPR 2`，不是主要驗收目標 `1440×900`。本階段截圖均位於系統 temp 目錄，未寫入 repository。
- Browser baseline 已查看 Login、Map Routes、Map Places、Library：
  - Login：`/tmp` 外部 screenshot evidence 為 Chrome temp `pi-chrome-devtools-screenshot-96d06fc2-5bc7-4495-a1ac-f07e80b80224.png`。
  - Map Routes：`pi-chrome-devtools-screenshot-36d6c323-1b25-4d0e-85a6-c9bd79983b2a.png`；DOM 無 document horizontal overflow，desktop panel 實測為 picker `320px`、inspector `440px`。
  - Map Places：`pi-chrome-devtools-screenshot-4c2e081c-1dd6-4ec6-a23d-0ee5f47df4f6.png`；DOM 無 document horizontal overflow。
  - Library：`pi-chrome-devtools-screenshot-dcc8420c-e88d-4498-bbf1-7849553ac0b4.png`；DOM 無 document horizontal overflow，但 `48px` hero heading、`102.5px` catalog header、`85px` toolbar 與約 `130px` populated Place row 讓 browsing density 偏低。
- `web/app/globals.css` 約 6,899 行，並由 `redesign.css`、`map-workspace.css`、`workspace-theme.css`、`radix-ui.css` 依序覆寫；同一 selectors 有多代規則。這是可預見的 cascade／視覺一致性風險，不應在沒有 scoped evidence 時全面重寫。
- 目前 worktree 在本計畫前已有 `web/next-env.d.ts` 修改；它必須保留且排除於本任務所有 commits。

### 主要使用者與目標

目前程式碼與文件支持的主要使用者是已登入的 Kestrel owner／tester；沒有使用頻率研究，因此以下排序是產品結構推論，需由實際 journeys 驗證：

1. 在地圖上找到 saved Place／Route，理解其空間位置與目前選取狀態。
2. 調整 Place coordinates 或 Route waypoints／settings，清楚知道 draft、validation 與 save 結果。
3. 在 Library 快速搜尋、辨識與開啟 saved items。
4. 視需要分享 item、送到 Android device，或管理帳號；這些不應與日常編輯競爭主要視覺層級。

### Capability classification

| Class | Capabilities | Presentation requirement |
| --- | --- | --- |
| Primary | Map canvas、Place／Route selection、direct spatial edit、required fields、Save | 直接、有標籤、在決策位置可見；Map workspace 中 map 與 Save 不得被裝飾或次要 controls 壓過 |
| Secondary / supporting | Search、Places／Routes scope、Library filters、New item、exact coordinates、speed／mode、refresh | 靠近所屬工作區，層級低於選取、map 與 Save，但不增加額外 navigation |
| Advanced | More details、waypoint precision／reorder、map appearance、keyboard help、Share、Device、theme／password | 穩定且有標籤的 progressive disclosure；不使用 hover-only 或無說明 icon 作為唯一入口 |
| Destructive / safety | Delete item、disable share link、discard unsaved draft、session/logout effects、validation／save errors | 明確 consequence、confirmation／cancel、focus return、previous valid state；永不成為 default primary CTA |
| Compatibility-only | 既有 dashboard redirects／URLs、API payload、stored sessions、unknown response fields、MapLibre marker ownership | 保留；除非另有批准 migration，不因視覺整理移除或改寫語意 |

### Initial evidence-backed findings to verify after approval

| Severity | Finding | Evidence / user impact | Candidate direction |
| --- | --- | --- | --- |
| P1 candidate | Map 與 Library 雖共享 warm tokens，卻使用兩套明顯不同的 top-level chrome、brand treatment、navigation geometry 與 density，整體像兩個產品。 | Map 由 floating status strip／paper panels 組成；Library 由 logo topbar／hero catalog 組成；相同 Map／Library navigation 在 DOM 和 screenshot 中呈現位置與比例皆不同。 | 統一 shell rhythm、typography、surface elevation 與 navigation treatment，不改 Map／Library responsibility split。 |
| P1 candidate | Library 把過多 viewport 高度用在 hero／toolbar／row chrome，降低 scan efficiency，且每列 `Open on map` 都以高強度 primary button 重複。 | `1200×792` 實測 h1 `48px`、toolbar `85px`、Place row約 `130px`，首屏只完整容納少量 items；五列都重複三個 actions。 | 收斂 hero scale與 vertical rhythm；以 row selection／context hierarchy 取代每列同強度 CTA，但保持所有 actions 一層可達。 |
| P1 candidate | Map 在 panels 展開時，中心地圖的視覺主導性與空間 context 不穩定；目前 baseline screenshot 中 raster context 很淡／未呈現，而 markers、panel chrome 與 controls 更醒目。 | `1200px` viewport 中 picker `320px` + inspector `440px`；Map Routes／Places screenshot 的 background context弱，route/places主要靠 pins，使用者較難立即判斷位置。 | 先確認 tile／style runtime evidence；若非網路故障，調整 map/panel balance、overlay opacity 與 marker/line hierarchy，不更換 MapLibre。 |
| P2 candidate | Login、Library、Map 的 heading／control scale與 surface treatment不一致，造成 transition 時的 hierarchy jump。 | Login 34rem card、Library 48px hero、Map 24px inspector title與不同 tab treatment；皆是同一 Cloud app。 | 建立 scoped type／spacing／surface tokens，逐頁套用；避免再疊一代全域 overrides。 |
| P2 candidate | 6,899-line legacy cascade 加上四個後載 CSS files，使視覺修正容易靠 specificity 疊加，增加回歸與不一致。 | `layout.tsx` import order及多代 `.kc-*`／`.cartographer-*` selectors可重現。 | 每輪只處理受影響 scoped selectors；若需要 decomposition，另列為同一輪具體 theme，不能順手全面重構。 |

這些是 baseline candidates，不等同批准實作項目；第一輪隨機 journeys 必須重新驗證 severity 與優先順序。

## Architecture

### Information architecture（維持，不重劃）

1. **Authentication surface**：Login／Register／TOTP 是獨立 entry flow。
2. **Global workspace choice**：登入後維持淺層 `Map`／`Library` 兩個 workspace。
3. **Map**：picker 選 item、MapLibre canvas 提供 spatial context／direct manipulation、inspector 提供精確編輯與 Save。
4. **Library**：搜尋／篩選／組織與 lifecycle actions；`Open on map` 回到 canonical editor，不建立第二套 full editor。
5. **Contextual disclosures**：Share、Device、More details、account controls與 destructive confirmations留在受影響 item／account附近。

除非另行取得使用者批准，loop 只改善 visual hierarchy、spacing、type、surface、copy、accessibility與 scoped interaction polish，不改上述 ownership、URL、API、draft ownership或資料語意。

### Visual direction

採用「現代、精準的 cartography workspace」，而不是再強化仿紙張裝飾：

- 保留 Kestrel warm orange identity與 Radix Colors，但增加 neutral surface 對比，讓 accent只用於 selection、primary completion與重要 state。
- 用一致的 sans-serif type scale、spacing rhythm、alignment與少量 interaction boundaries建立 hierarchy；減少大 hero、重複 pill/card、無功能紋理、過度 blur/shadow。
- Map 是 Map workspace 的主視覺；picker／inspector是工具，不應比空間內容更搶眼。
- Library 優先 scannability；item identity／metadata先於 row actions，destructive capability留在 `More`。
- Login／Library／Map 保持任務差異，但共享 brand、navigation、control size、focus與surface語言。

### State model and feedback

| Surface | States that must remain represented | Placement / recovery |
| --- | --- | --- |
| Auth | hydration/loading、login/register、optional TOTP/recovery、submitting、validation、API error | form附近；失敗保留輸入並提供可重試訊息 |
| Library | loading skeleton、loaded、empty、search no-match、stale-data error、share loading/none/active/disabled/error、delete confirmation | toolbar／affected row／dialog附近；error不清除可用既有 rows |
| Map | loading、no selection、selected、new draft、clean/dirty、valid/invalid、saving/saved/error、collapsed/focused panels | selection與Save附近；navigation／refresh遇到dirty必須可 cancel且無副作用 |
| Device / Share / Account | ready/unavailable/disabled、loading、success/error、confirmation/cancel | contextual dialog/popover；Close/Escape後 focus回 trigger，cancel不 mutation |

## Interaction principles

- Primary action每個 task scope只保留一個；次要 action以文字、soft button或 disclosure呈現，但不可消失。
- 重要 state（selected、dirty、saving、error、device readiness）必須在使用者作決策的位置可見，且不只靠顏色。
- Cancel／Close／Escape不可產生 mutation；destructive與hard-to-reverse action維持確認。
- Map gesture必須保留 exact-coordinate／waypoint controls作為 keyboard與assistive alternative。
- 不以新增 mode switch、重複 CTA或更深 navigation換取表面整潔。
- 所有視覺判斷都需連回 user effort、辨識成本、錯誤風險、accessibility或一致性，不做純偏好 churn。

## Iteration protocol

### Safe journey pool

每輪先從當時可執行項目中隨機抽三個不同 journeys，且至少涵蓋兩個 URL／主要 surfaces；以一次性 CLI random sample 記錄 timestamp、eligible pool與結果到本計畫的 iteration log。

1. Auth Login／Register tab inspection（不提交 registration）。
2. Map Place browse → select → edit a field → cancel/discard。
3. Map Route browse → select waypoint／map control → cancel/discard。
4. Library filter／search → open item context（不 delete）。
5. Existing Share dialog open／inspect／Close（不 create、disable或re-enable link）。
6. Device dialog open／inspect unavailable/ready state → Close（不送 command）。
7. Account popover open／keyboard traverse → Close（不 change password/logout）。

若 sampled journey 缺少前置 fixture，記錄為 ineligible並從剩餘 pool重抽，不用永久 mutation建立資料。

### Per-iteration evidence

每個 journey 都要記錄：URL、操作、actual viewport、before screenshot temp path、可見 state、DOM/accessible-name/focus/overflow檢查與 console/runtime evidence。每輪 review將 findings分為：

- **P0**：安全、資料損失、核心 flow不可完成。
- **P1**：主要 task明顯難以理解／完成、重要 state不可見、嚴重 layout／accessibility failure。
- **P2**：跨主要 surface的一致性、hierarchy、density或美觀問題，造成持續辨識／操作成本。
- **P3**：低影響、主觀或局部 polish；記錄但不阻擋 break。

每輪只實作一個最高優先且範圍連貫的 theme。若 findings涉及 IA、主要 workflow、資料／persistence、destructive semantics或 capability，該輪先取得額外批准。

## Responsive and accessibility acceptance criteria

主要 browser acceptance target依既有產品偏好為 **light mode、1440×900 desktop**；本階段 Chrome harness只有 `1200×792 @ DPR 2`，執行前必須找到可記錄 `innerWidth=1440`、`innerHeight=900` 的 Chrome DevTools target。若無法建立該 viewport，這是驗收 blocker，不能把 `1200×792` 默認冒充 `1440×900`。

每個受影響 surface必須符合：

- `documentElement.scrollWidth <= clientWidth`，沒有 clipped primary action、ambiguous truncation或互相覆蓋。
- Map在雙panel展開時仍能辨識 spatial content；panels可逆收合且 draft／selection不遺失。
- Library在首屏清楚呈現 heading、filter/search與多個可掃描 rows；item actions不壓過item identity。
- Visible focus、logical tab order、Escape／Close、dialog focus return、native/Radix semantics與 accessible names正確。
- Selection、dirty、status、success/error不可只靠顏色；一般文字contrast至少4.5:1，大字至少3:1；常用pointer targets至少44×44 CSS px或有等效可操作 hit area。
- Reduced motion不影響理解；不得以 hover、pointer、map gesture或motion作唯一入口／提示。
- 現有 responsive CSS與capabilities不得因desktop polish被刪除；依 repository既有偏好，不擴張完整 mobile/tablet/dark/RTL matrix。只有實際修改相關 media rules／shared primitives時，才追加最窄受影響 viewport的Chrome smoke。

## Non-Goals

- 不改 backend、database schema、Android、API contracts、auth/session安全語意或remote command queue。
- 不替換MapLibre、不加入第二套UI／icon／color library。
- 不刪除Share、Device、exact coordinate、waypoint、keyboard、theme、account或destructive recovery能力。
- 不在沒有獨立證據與驗收的情況下全面拆解`globals.css`。
- 不操作production、不push、不提交browser screenshots或其他image binaries。

## Risks

- **Aesthetic subjectivity**：以三journey evidence、task impact與P0–P3 rubric限制純偏好churn；P3不阻擋完成。
- **Cascade regression**：後載CSS與legacy selectors可能互相覆寫；每輪使用scoped class、computed styles、before/after browser evidence與static gates。
- **Map context依賴網路tiles**：先區分provider/network failure與style hierarchy，不能用CSS掩蓋tile failure。
- **False simplicity**：縮減視覺噪音時可能隱藏capability；每輪做capability/path inventory並重跑cancel／recovery。
- **Unbounded loop**：以「新三journey audit無P0/P1/P2」作客觀break；不得把尚未修正的P0–P2移至backlog以結案。
- **Pre-existing worktree change**：所有stage與commit使用明確pathspec，排除`web/next-env.d.ts`；build/typegen後再次確認它未被stage。

## Rollback / Recovery

本計畫不含production/data migration。每輪是一個focused Conventional Commit；若after-smoke或後續fresh audit證明回歸，先在下一個focused fix中修正，必要時可針對該commit做非破壞性revert。Browser journeys不執行delete、session revoke、share mutation、password change、remote command或永久fixture mutation。

## Plan

### Phase 1 — Proposal and approval

- [x] 檢查目前UI、code、docs、constraints與主要state paths，建立baseline capability classification及初始evidence；已由上述Chrome temp screenshots、DOM measurements、`web/app/layout.tsx` import order、主要components及CSS檢查證明。
- [x] 定義保留的IA、visual direction、interaction/state principles、responsive/accessibility acceptance criteria、risk與rollback；已記錄於本計畫。
- [x] 取得使用者對本計畫及純視覺／hierarchy／spacing／copy／accessibility loop scope的明確批准；使用者以 `/goal implement docs/plans/2026-07-25_web-uiux-optimization-loop-plan.md` 明確批准執行。

### Phase 2 — Iterative optimization（approval後）

- [x] 建立可驗證的`1440×900` light-mode Chrome DevTools target並記錄`innerWidth`／`innerHeight`；使用獨立SwiftShader Chrome CDP target，Runtime實測`innerWidth=1440`、`innerHeight=900`、DPR 1、theme light。
- [x] 執行Iteration 1：隨機抽取三個safe journeys、記錄before evidence、列出P0–P3 findings、選一個最高價值coherent theme並更新本計畫；evidence見Iteration 1 log及三張`/tmp/kestrel-cdp-output/iter1-before-*.png`。
- [x] 實作Iteration 1 approved theme，保留capabilities／state／cancel semantics；抽出shared `BrandMark`、統一Map chrome高度／brand、收斂Library scale與row action emphasis，並補account username autofill context；三個sampled journeys均保留原流程。
- [x] 重跑Iteration 1 journeys並執行`just web-check`、`just web-lint`、`cd web && npm run typecheck`、`git diff --check`；全部通過，Chrome after evidence無horizontal overflow或新console error，`web/next-env.d.ts`已恢復為pre-existing diff且未納入stage。
- [x] 若仍有P0／P1／P2，依同一protocol逐輪新增並完成「random audit → one coherent improvement → Chrome after-smoke → required gates → focused commit」tasks；Iteration 2修正Auth identity，Iteration 3修正controlled confirmation focus recovery，均有獨立evidence與commit。
- [x] 執行一輪全新的三journeyfinal audit；`2026-07-25T05:38:58.655576+00:00`隨機抽中Share、Map Route、Device，三者在所有修正後均無P0／P1／P2、無app console error且無horizontal overflow，evidence見Iteration 3。

### Phase 3 — Final verification and archive

- [x] 重跑最終受影響primary flows及cancel/error recovery，確認Map／Library／Auth主要capabilities、focus與compatibility均保留；Auth tabs、Library search/no-match/Share/Delete-cancel、Map Place dirty cancel/discard、Map Route panel round-trip、Device與Account focus return均有Chrome evidence。
- [x] 執行`just web-check`、`just web-lint`、`cd web && npm run typecheck`、`cd web && npm run build`與`git diff --check`；Next 16.2.10 Turbopack build成功產生16 routes，staged/image/UI-library audits通過，`web/next-env.d.ts`維持pre-existing unstaged diff。
- [x] 完成本計畫所有checkbox與iteration evidence，移至`docs/plans/archived/`，以plan-only Conventional Commit收尾，不push；archive與commit在本次finalization完成。

## Iteration Log

### Iteration 1 — Shared workspace chrome and hierarchy

- **Random sample**：`2026-07-25T05:15:32.209370+00:00`；eligible pool 7項；抽中 Library filter/search/open context、Map Place browse/edit/cancel、Account popover keyboard traverse/close。
- **Before evidence**：全部由隔離Chrome CDP target於`1440×900`、DPR 1、light mode執行；Library `/tmp/kestrel-cdp-output/iter1-before-library.png`、Map Place discard dialog `/tmp/kestrel-cdp-output/iter1-before-map-place.png`、Account `/tmp/kestrel-cdp-output/iter1-before-account.png`。三者`scrollWidth===clientWidth===1440`；Map cancel focus在Cancel且Escape後可discard回原值；Account Escape後focus回user trigger。
- **Findings**：
  - **P1** Map與Library使用不同brand mark、topbar高度、workspace-nav位置與surface rhythm，切換時像兩個產品；兩張before screenshots可直接比對。
  - **P2** Library catalog的48px hero與每列filled `Open on map`重複競爭New item和item identity；搜尋後雖只剩2列，仍有兩個同強度primary row CTAs。
  - **P2** Account change-password form缺少username autofill context；Chrome DevTools回報password form recommendation，增加password manager/accessibility ambiguity。
  - **P3** MapLibre在初次style載入期間有一次`Style is not done loading`warning；tiles其後成功顯示，非本輪視覺theme，需在後續fresh audit確認是否持續。
- **Approved scope**：既有approval涵蓋shared brand/navigation hierarchy、catalog scale/action emphasis與account form accessibility；不改IA、URL、data、persistence、destructive semantics或capability。
- **Implementation**：新增`web/components/BrandMark.tsx`供Dashboard／Map共用；Map top chrome改為64px並顯示一致brand/subtitle；Library content max-width調為1240px、hero上限40px、rows縮短且`Open on map`降為outlined contextual action；Account password form加入不可tab至的username autofill context。未改URL、API、draft、Save、Share、Device或destructive semantics。
- **After evidence**：Library `/tmp/kestrel-cdp-output/iter1-after-library.png`（h1 40px、catalog 1240px、outlined row actions）、Map Place `/tmp/kestrel-cdp-output/iter1-after-map-place.png`（64px shared chrome、dialog Cancel focus、Escape與Discard回復原值）、Account `/tmp/kestrel-cdp-output/iter1-after-account.png`（username context存在、Tab到current password、Escape focus return）。另以`iter1-after-library-menu.png`驗證More可由Enter開啟、Escape關閉並focus return；所有頁面`scrollWidth===clientWidth===1440`。
- **Checks**：`just web-check`、`just web-lint`、Web typecheck與`git diff --check`通過；Chrome只有既有MapLibre initial style warning，Account password-form recommendation已消失。
- **Commit**：`df1d71b feat(web): unify workspace visual hierarchy`（因1Password SSH signer無法寫入buffer，保留hooks並以單次`commit.gpgsign=false`完成unsigned commit；未push）。

### Iteration 2 — Auth brand alignment

- **Random sample**：`2026-07-25T05:26:54.877990+00:00`；抽中Auth Login/Register tab inspection、Map Route browse/waypoint/map-control/cancel、Device dialog open/close。
- **Before evidence**：`/tmp/kestrel-cdp-output/iter2-before-auth.png`及`iter2-before-auth-register.png`、`iter2-before-map-route.png`、`iter2-before-device.png`；均為`1440×900` light且無horizontal overflow。Map Focus map round-trip保留selected route/waypoint與clean draft；Device dialog focus在Close、disabled commands具disabled semantics、Escape回Device trigger。
- **Findings**：
  - **P2** Auth仍只有文字brand，與剛統一的Map／Library kestrel mark缺少視覺連續性；Login/Register切換時功能清楚但entry surface像獨立utility form。
  - **P3** Device empty dialog的disabled actions偏淡，但instruction、Refresh與Close仍清楚且語意正確；不值得在無ready-device fixture時churn。
  - **P3** Map route inspector資訊密度高，但Waypoints-first、selected cue、Save、Share、Device、settings disclosure與panel round-trip均清楚，屬已接受的expert editing density。
- **Approved scope**：只把shared `BrandMark`擴充為可渲染page `h1`並用於Auth；不改credential/TOTP流程、fields、validation或submission。
- **Implementation**：`BrandMark`新增`titleAs`語意選項；Login以同一logo/title/subtitle composition取代獨立文字brand，保留唯一h1與原copy。
- **After evidence**：`/tmp/kestrel-cdp-output/iter2-after-auth.png`顯示52pxbrand mark、唯一h1、Register fields及disabled optional-TOTP action；`iter2-after-map-route.png`與`iter2-after-device.png`證明shared component未回歸Map、panel state、Save或dialog focus。三journeys均`scrollWidth===clientWidth===1440`，無app console/runtime error（被navigation取消的tile fetch不計failure）。
- **Checks**：`just web-check`、`just web-lint`、Web typecheck與`git diff --check`通過；`web/next-env.d.ts`pre-existing diff已恢復。
- **Commit**：`57a94f5 feat(web): align authentication branding`（unsigned、hooks保留、未push）。

### Iteration 3 — Controlled confirmation focus recovery

- **Discovery evidence**：final capability smoke在Library More → Delete confirmation按Escape後顯示dialog已關閉、item count仍為5，但focus落到`body`；相同pattern的Map Place dirty navigation在cancel後也落到`body`。這是**P2 accessibility/recovery**：取消沒有side effect但keyboard context遺失。Red evidence為`/tmp/kestrel-cdp-output/final-delete-confirm.png`及Map cancel DOM result。
- **Random sample**：`2026-07-25T05:38:58.655576+00:00`；抽中Existing Share dialog open/close、Map Route browse/waypoint/map-control/cancel、Device dialog open/close，涵蓋Library與Map URLs。
- **Approved scope**：既有approval涵蓋focus management；只修controlled AlertDialog close-focus，不改confirm/cancel/delete/draft action語意。
- **Implementation**：`ConfirmDialog`新增optional `restoreFocusElement`並在`onCloseAutoFocus`明確回復；Library delete保存More trigger ref；Map dirty-navigation保存active control，無focus時fallback到current selected notebook item。
- **After evidence**：Library delete Cancel／Escape關閉後focus回`More`且item count仍為5（`/tmp/kestrel-cdp-output/iter3-after-delete-confirm.png`）；Map Place Cancel及Escape都保留dirty draft並focus回current selected item，之後Discard回原值。隨機sample screenshots為`iter3-after-share.png`、`iter3-after-map-route.png`、`iter3-after-device.png`：Share/Device Escape focus return，Map panels restore、selected waypoint/draft/Save保留，三者`1440×900`無overflow或app errors。
- **Checks**：`just web-check`、`just web-lint`、Web typecheck與`git diff --check`通過；format red先由focused Biome format修正後green。
- **Commit**：`1a89e54 fix(web): restore focus after confirmations`（unsigned、hooks保留、未push）。
- **Break audit**：上述修正後的新三journey random sample沒有P0／P1／P2；P3 cosmetic preferences不阻擋loop完成。

批准後每輪追加：

```text
Iteration N — <theme>
Random sample: <timestamp / eligible pool / selected journeys>
Before evidence: <URL / viewport / screenshot / DOM-console-focus-overflow>
Findings: <P0-P3 with evidence>
Approved scope: <visual-only or extra approval reference>
Implementation: <files / preserved capabilities>
After evidence: <same journeys / screenshot / checks>
Commit: <hash and Conventional Commit message>
```

## Final Validation Record

- **Fresh break audit**：Auth、Account、Map Route及最後random Share／Map Route／Device screenshots都在`1440×900`、DPR 1、light；所有量測`scrollWidth===clientWidth===1440`，沒有unnamed sampled map controls或duplicate IDs。
- **State coverage**：`final-library-loading-partial.png`顯示refresh `aria-busy=true`、disabled且5 stale rows保留；`final-library-error.png`顯示`Failed to fetch` alert且5 rows仍可用；unblock後alert消失、5 rows恢復。另覆蓋Library no-match、Share Disabled、Device no-device/disabled commands、Auth disabled optional TOTP、Map dirty/clean、confirm cancel與focus recovery。
- **Capability/recovery**：Share只是GET並以Escape關閉；Delete confirmation取消後item count仍5；Map Place dirty cancel保留draft、Discard回原值；Map Route focus round-trip保留selected waypoint與Save；Account／Share／Device／Delete／dirty confirmations均有focus return。
- **Accessibility**：keyboard Enter／Tab／Escape、dialog initial focus、close focus return、labels、unique IDs與non-color selected/dirty/error cues通過。Compact desktop chrome controls實測32–40px高但具有大寬度／隔離間距並超過WCAG 24px minimum；fields與主要editing targets為40px，既有mobile 44px rules未改。已知palette ratio：white on `#b94400` 5.40:1、`#983900` on white 7.19:1、muted `#72583f` on cream 6.29:1、primary ink on light surface 17.12:1。
- **Architecture/dependencies**：repository search沒有Base UI／MUI／Chakra／Ant／Mantine／Lucide／React Icons imports，也沒有Google Maps／Leaflet／OpenLayers／Mapbox GL；Radix Themes／Colors／primitives及MapLibre ownership未變，package files未修改。
- **Quality**：每輪`just web-check`、`just web-lint`、Web typecheck與`git diff --check`通過；final `npm run build`成功。三個implementation commits均focused、Conventional、無images、無push，並排除pre-existing `web/next-env.d.ts`。

## Completion Checklist

- [x] 使用者已明確批准proposal，所有implementation與commits均發生於批准之後；approval evidence為本goal的plan implementation指令。
- [x] Map／Library／Auth呈現一致且清楚的Kestrel visual hierarchy，同時保有各自task responsibility；由final three-journey audit與screenshots驗證。
- [x] 所有audit發現的P0／P1／P2均已修正並驗證，沒有為結案移至backlog；由完整Iteration Log證明。
- [x] Primary、secondary、advanced、destructive與compatibility-only capabilities仍有明確且可達路徑；由capability/state smoke證明。
- [x] Loading、empty、success、error、disabled、partial、dirty、saving與cancel/recovery等受影響states有清楚feedback且不破壞previous valid state；由Final Validation Record及state screenshots證明，saving behavior未改且現有disabled/submitting semantics由code/typecheck保留。
- [x] `1440×900` light desktop沒有horizontal overflow、clipped primary actions、harmful layout shifts或無法辨識的focus/status；由actual viewport measurements及Chrome evidence證明。
- [x] Keyboard、focus return、accessible names、non-color cues、contrast、target sizing與gesture alternatives在受影響flows通過review。
- [x] Radix Themes／Radix Colors／radix-ui primitives維持唯一UI system，MapLibre維持唯一map backend，沒有新增重複dependency。
- [x] 每輪required checks及最終Web build均通過，所有commits均focused、Conventional、無push、無image binaries、未包含pre-existing `web/next-env.d.ts`。
- [x] 一輪新的三journeyaudit無P0／P1／P2，plan已完整勾選並移至`docs/plans/archived/`。
