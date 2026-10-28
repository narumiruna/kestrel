# Web workspace review and design proposal

## Outcome

Five findings need implementation. The two highest-priority findings affect unsaved work. The proposed image shows a safer Map workspace and a Library return flow. This document records the evidence and the image's design contract; it does not report implemented fixes.

Implementation tasks belong to the existing [workspace information architecture plan](../plans/2026-09-23_web-workspace-information-architecture-plan.md#plan). Do not create a second checklist for the same work.

## Review conditions

- Source: `main` at `6c78465023c850aaf9df40f019571a18fb670323`, after PRs #368 and #369.
- Presentation: 1440×900 CSS pixels, light mode, English.
- Method: source review and local Google Chrome through Chrome DevTools Protocol. The configured browser MCP could not find its executable; no Playwright was used.
- Application: the current Next.js source, served with `next dev --webpack` on loopback. Browser-local API fixtures supplied five Places, two Routes, and synthetic account/device data.
- Safety: no real account login, database changes, share-link writes, device commands, or physical-device operations. Delete changed only an in-memory fixture array.
- Coverage: Map Route, Map Place, Library, and Account Preferences were inspected. This is not a complete authentication, security, accessibility, localization, or responsive audit.
- Limitation: the basemap reached loading/unavailable states during capture. Route geometry, tile quality, and production map availability are not verified. The map in the generated proposal is illustrative, not browser evidence.

Current panels measured 260px on the left and 350px on the right. The Route editor already has View / Edit / Playback tabs, an expanded waypoint list, and a sticky dirty-state save bar. Account already has Preferences / AI assistant / Security navigation. Do not rebuild these features from historical plan descriptions.

## Findings

### F1 — P1: Refresh is a discard operation

**Evidence:** [Map refresh handler](../../web/app/dashboard/map/page.tsx#L442-L457) sends Refresh through the draft-discard guard and resets dirty Route or Place state. The header says `Updated now`, although it reports Library request freshness, not draft persistence.

**Reproduction:**

1. Open a saved Route, choose Edit, and change its name.
2. Select the header Refresh control.
3. Observe `Discard unsaved changes?`.
4. Choose Discard changes. The Route name returns to its saved value.

Chrome confirmed that Keep editing retained `Unsaved review edit`; confirming Refresh restored `Riverside morning walk`. The action is not silent, but it couples a read operation to loss of edits.

**Resolution:** use `Library refreshed …` in the header. Refresh must retain dirty/new drafts, stable selection, and Undo/Redo state on success and failure. Only a clean draft can accept a new server snapshot. Show a non-destructive warning if its saved source changes or disappears.

### F2 — P1: Browser Back bypasses the draft guard

**Evidence:** the [Map page](../../web/app/dashboard/map/page.tsx#L257-L277) registers `beforeunload`, but does not guard same-document browser history. Chrome navigation from Library to a Route, followed by a name edit and browser Back, returned to Library without an application dialog or native unload dialog. The editor unmounted.

The same review found a related source-level gap: [Map passes `auth.logout` directly](../../web/app/dashboard/map/page.tsx#L516-L527) to the header. Dirty-draft Sign out was not exercised, so its runtime behavior remains unverified.

**Resolution:** give explicit navigation, Account links, Sign out, Back/Forward, and document unload one draft-exit policy. Cancel must retain the draft, session, URL, history position, and a connected focus target. Confirm must run the original action exactly once. Do not clear session state before confirmation.

### F3 — P2: Library loses the return context

**Evidence:** [Library query, type, and sort](../../web/components/dashboard/LibraryCatalog.tsx#L63-L65) live only in component state. Chrome confirmed this sequence: search `Coffee` → one row → Open on map → browser Back → empty search and seven rows. The Library URL never contained the search.

**Resolution:** make the existing search/type/sort state URL-restorable and preserve the return row and scroll position by stable ID. Carry only a validated internal Library return target into Map. Restore focus and scroll after the relevant collection is ready; loading/error must not discard the requested context. Keep the existing direct Open on map workflow.

### F4 — P2: Delete loses keyboard focus

**Evidence:** [Library deletion](../../web/components/dashboard/LibraryItemActions.tsx#L72-L85) refreshes the list and removes its row. Its [confirmation dialog](../../web/components/dashboard/LibraryItemActions.tsx#L148-L157) restores focus to the removed overflow trigger; the [shared dialog](../../web/components/ui/radix-ui.tsx#L330-L335) does not check whether that element is connected. After deleting the synthetic Coffee stop row, Chrome reported six rows and `document.activeElement === document.body`.

**Resolution:** after successful deletion and refresh, focus the next visible row's Open on map link, then the previous row's link, then a focusable results heading if no rows remain. Use the current filtered/sorted order. On failure or cancellation, restore the connected trigger. Do not change the destructive confirmation or claim that deletion can be undone.

### F5 — P2: Route identity competes with route actions

**Evidence:** the [Route identity and fit controls](../../web/components/dashboard/RouteEditor.tsx#L334-L405) permanently show a name input, account-wide AI setup, and a full-width fit action. The [Map viewport controls](../../web/app/dashboard/map/page.tsx#L644-L660) already provide the same fit action. Chrome counted two `Show entire route` controls.

In the five-waypoint fixture, the identity section was about 174px high. The clean Route's Save & share section started at y≈854 and ended at y≈1093, below the 884px inspector bottom. It is scrollable, not proven clipped. The existing dirty-state sticky save bar is not a missing feature.

**Resolution:** use compact Route identity with explicit name editing, retain View / Edit / Playback, remove the duplicate inspector fit action, and keep account-wide AI setup in existing Account settings. Replace the large empty-selection explanation with one instruction. Reuse the existing dirty save presentation and keep a compact clean saved-revision action visible. Preserve exact-coordinate entry, waypoint operations, metadata, Undo/Redo, and saved-revision Share semantics.

## Proposed image

- Local artifact: `/private/tmp/kestrel-web-review.LNPRzl/proposed-web-workspace.png`.
- Generated size: 1586×992 pixels. The main application view represents a 1440×900 logical layout; the lower Library fragment and numbered notes are annotations, not additional application panels.
- SHA-256: `13a46ee37d35e4922405c90e59a381c403627d782a1dd724262146a111faeb5b`.
- Images and browser captures remain outside Git and are not PR attachments, as required by repository policy. The local artifact is not a durable or remotely accessible PR asset. The specification below is the retained implementation reference.

### Design contract

| Image region | Implementation rule | Finding |
| --- | --- | --- |
| Header | Keep Map / Library navigation and the account menu. Label request freshness `Library refreshed …`; do not label it Saved or Synced. | F1 |
| Context link | Show Back to Library only when Map was opened from a valid Library context. Reuse the draft guard; do not add another workspace switch. | F2, F3 |
| Quick picker | Use a clear Saved items heading, the existing Places / Routes control, search, contextual New action, and a guarded Manage in Library link. A rail/highlight means selection, not completion. | F2, F5 |
| Map | Retain MapLibre, current safe-area fitting, marker hit targets, attribution, and the existing viewport control group. Keep only one visible fit action in this layout. | F5 |
| Route inspector | Compact identity; existing View / Edit / Playback tabs; directly reachable waypoint list; one short instruction; existing Add / Undo / Redo capabilities. Keep AI setup in Account. | F5 |
| Inspector footer | One primary Save route action for new/dirty drafts; secondary Discard only when applicable. Clean saved routes have no disabled Save. Saving, invalid, failure, and success states use the existing presentation model. Share reads the saved revision; device controls remain in Playback. | F1, F5 |
| Library fragment | Restore existing query/type/sort and the return row. Keep explicit Open on map links and current row actions for this safety pass. Show a visible focus outline after Delete. | F3, F4 |

Retain Radix Themes, Primitives, Colors, and Icons. Preserve the current Radix blue accent from `ThemeProvider`, sans-serif type, white surfaces, thin borders, and restrained rounding. Use amber with text for unsaved state, not color alone.

The image is not a literal data or control specification:

- Its waypoint names, map labels, counts, and timestamps are illustrative. Do not add editable waypoint-name fields or new API data.
- Its compact Library type selector does not require replacing the existing segmented control.
- Its pictured Share label means the latest saved revision, not a fixed Revision 2.
- Existing marker/list selection behavior, focus visibility, and accessible names remain required.
- No new preview pane, autosave, offline draft storage, bulk operation, map/search provider, AI generation action, or device-assignment feature is part of this review.
- The broader plan's existing master-detail, Account, and responsive tasks remain open. This image neither completes nor removes them.

### Regeneration brief

Generate a landscape engineering design board titled `Kestrel Cloud · safer workspace proposal`. Use the existing Radix blue light-mode desktop UI. Make the Map view dominant, with a 260px Saved items picker, an unobscured MapLibre-style map, and a 350px compact Route inspector. Show the existing three workflow tabs, five waypoints, unsaved status, and a fully visible Save/Discard footer. Use Library refreshed wording, a context-aware Back to Library link, and only one map-fit control. Put account-wide AI setup outside the manual Route task. Below the Map, show a Library fragment with restored search/type/sort and a row focus outline. Add five numbered annotations for F1–F5. Do not depict unsupported features or treat the map illustration as validation evidence.

## Implementation verification

The [plan](../plans/2026-09-23_web-workspace-information-architecture-plan.md#plan) owns the unchecked implementation tasks. Apply these acceptance cases to those tasks:

| Finding | Required evidence before checking its task |
| --- | --- |
| F1 | Dirty/new Place and Route retain exact draft values and selection after successful, failed, changed-source, and deleted-source Refresh. No discard dialog opens. A clean item can refresh. Header freshness is distinct from Save status. |
| F2 | Back/Forward, context links, Account links, Sign out, and unload have explicit dirty/clean cases. Repeated Cancel retains draft/session/history and returns focus. Confirm replays once, with no history growth or double logout. |
| F3 | Query/type/sort survive direct load, reload, Back/Forward, and Map return. The same stable row and scroll context return after readiness. Invalid return targets, duplicate names, empty results, and failed load → Retry are covered. |
| F4 | Delete first/middle/last/only row under filtering and sorting. Verify next/previous/results-heading focus. Failure and cancellation retain a connected trigger and do not lose context. |
| F5 | At 1440×900 light, five-waypoint clean/dirty/new/error states expose their completion actions within the inspector. One fit control remains. Long names wrap safely. Existing keyboard waypoint operations and 50/1000-point behavior do not regress. |

For the focused review fixes, use Chrome DevTools at the existing desktop baseline. Do not add viewport or appearance matrices to this review; the broader plan retains its separately requested checks. Keep captures outside the repository.

## Documentation PR checks

The current source passed `just web-check`, `just web-lint`, `just web-test` (209 tests), `just web-typecheck`, `just web-build`, and `just i18n-check` (18 locales). The local runtime was Node.js 26.10.0, not the CI Node.js 22 runtime. Web check/lint retained 43 existing warnings and one Biome schema-version notice; no source or configuration was changed to suppress them.

Document hooks passed. Link/source-range validation passed for 21 existing or added references and confirmed that all 34 unfinished tasks and completion checks remain open. One unchanged broken README link to `2026-10-22_personal-ai-provider-settings-plan.md` remains outside this review's scope. The browser results above reproduce existing issues; these checks do not establish that F1–F5 are fixed.

## Retained local evidence

Directory: `/private/tmp/kestrel-web-review.LNPRzl/`.

- `baseline-evidence.json`: page text, controls, fixture request paths, and dimensions for the four inspected screens.
- `findings-evidence.json`: confirmed Refresh, Back, and Library return behavior.
- `focus-layout-evidence.json`: post-Delete focus and Route inspector geometry.
- `baseline-*.png`, `finding-*.png`: current-UI captures, not proposal implementation evidence.
- `browser.mjs`, `fixtures.js`, `capture-review.mjs`, `verify-findings.mjs`, `verify-focus-layout.mjs`: local CDP review harness. The fixtures are synthetic and never contact a real backend.

These temporary files can be removed by the operator after review. The findings, source references, reproduction steps, and design contract above do not depend on their retention.
