## Goal

Redesign Kestrel Cloud into a clear map-first workspace that lowers cognitive load without removing route, place, sharing, device-control, account-security, or recovery capabilities. Success means a signed-in user can select an item, edit it, understand unsaved/device state, and complete the next action without navigating through duplicate editor experiences or scanning several equally prominent cards.

## Context

Current evidence:

- `web/app/dashboard/map/page.tsx` now supports direct route editing, while `web/app/dashboard/routes/page.tsx` mounts another full route editor. The `Map` / `Library` distinction is therefore unclear.
- The desktop route view simultaneously shows top navigation, panel controls, item-type tabs, search, list rows, route identity, revision, route summary, device status, guidance, four metrics, settings, waypoint controls, Share, and Save.
- On `390×844`, the map, item list, and editor become three long stacked regions; the selected route editor begins below the first viewport, increasing scrolling and context loss.
- Circular `−` / `F` panel controls depend on abstract symbols and tooltips instead of recognition.
- Route summary values duplicate editable fields, and nested cards/borders compete with the map and primary Save action.
- Existing progressive disclosure is useful: Share and Device already use dialogs, while route settings and waypoints use labeled disclosure sections.
- Product capability must remain intact: Places, Routes, waypoint editing, speed/mode, sharing, remote device commands, unsaved-work protection, account security, authentication/TOTP, and public share pages.

## Primary Task and Context

- **Primary user:** a signed-in Kestrel owner managing mock-location places/routes and optionally sending them to an Android device.
- **Primary desktop task:** select a saved route or place, inspect it spatially, adjust it, and save it while preserving map context.
- **Secondary tasks:** create/organize library items, share an item, send/stop a device command, and manage account sessions/devices.
- **Mobile assumption:** mobile Web must remain fully usable, but repeated map editing is secondary to quick review and small corrections. This assumption must be validated before implementation.
- **Inputs:** pointer, touch, keyboard shortcuts, native form controls, and assistive technology.
- **Constraints:** retain MapLibre, existing APIs/data models, current CRUD/share/device capability, compatibility URLs, and unsaved-work recovery.

## Action Priority

| Classification | Actions / information | Planned presentation |
| --- | --- | --- |
| Primary | Select item, manipulate map/coordinates, Save | Directly visible in Map; one persistent Save action with local dirty/saving/saved/error state |
| Secondary/supporting | Search, Places/Routes scope, name, speed, mode, fit map, discard | Visible near the picker/editor but lower emphasis than map and Save |
| Contextual | Send/stop on device, item status, current revision, selected waypoint | Reveal for the selected saved item near the affected object |
| Advanced | Precise waypoint list/reorder, description, public sharing, map style, account security | Labeled disclosure sections, dialogs, or dedicated account view; no unlabeled hidden gestures |
| Safety/status | Unsaved work, validation, offline/loading, device availability, destructive consequences | Visible near Save or the affected field; confirmation only for consequential discard/delete/revoke actions |
| Redundant | Duplicate route editor, repeated summary cards, `Edit route` handoff, repeated revision labels, abstract `F`/`−` controls | Consolidate only after confirming the original capability and recovery path remain available |

## Information Hierarchy

### Map workspace

1. **Global orientation:** Kestrel Cloud, Map / Library location, account entry.
2. **Selection:** Places / Routes scope, search, selected item identity.
3. **Primary work:** map canvas and direct manipulation.
4. **Essential editor:** name plus task-critical route/place inputs and local validation.
5. **Completion:** unsaved state, Save, and contextual device action.
6. **Secondary detail:** precise waypoint management, description, sharing, and map appearance.

Desktop uses a left picker, central map, and right inspector. Mobile uses one primary region at a time: map first with a compact selected-item bar; the item picker and inspector open as labeled sheets/panels while preserving selection and draft state.

### Library workspace

1. Library location and Places / Routes scope.
2. Search, filter, and one visible New action.
3. Scannable item list with identity and essential metadata.
4. Contextual item management (rename/metadata, share, delete, open on map) in a detail panel or row overflow.

Library owns organization and lifecycle management; it must not mount a second full map-heavy route editor. Creating or spatially editing an item opens it directly in Map with no additional Edit-mode button.

## Always Visible

- Current workspace (`Map` or `Library`) and current item type.
- Selected item identity and dirty/saving/error state.
- Map in the Map workspace.
- Primary Save action whenever an editable draft exists.
- Search and selected-item context when browsing more than a trivial list.
- Required inputs and validation for the current task.
- A labeled path to Library, Device, Share, account security, and destructive actions.
- A visible alternative to map gestures for precise coordinate/waypoint editing.

## Progressively Disclosed

- **Waypoint precision:** `Waypoints (n)` section in the inspector; preview start/end and selection state in its label.
- **Description and less-frequent metadata:** `More details` section immediately after core fields.
- **Share:** labeled Share dialog from the selected saved item; retain create/copy/open/disable/re-enable functions.
- **Device control:** labeled `Device` or outcome-oriented `Send to device` dialog; show readiness in the trigger and command status inside the dialog.
- **Map style:** labeled map-style control grouped with zoom/fit; no competition with Save.
- **Delete:** item overflow or a clearly labeled danger section in Library; never the primary action.
- **Account security:** account menu → `Sessions & devices`, one navigation level deep with a clear return path.

## Discoverability Paths

| Capability | Entry point | Depth / return path |
| --- | --- | --- |
| Switch item/type | Visible left picker on desktop; `Choose item` sheet on mobile | Same workspace; closing restores map/editor context |
| Precise waypoint edit | `Waypoints (n)` disclosure in inspector | Inline; collapse returns to core fields |
| Share | `Share` text action for selected saved item | One dialog; Close/Escape returns to unchanged draft |
| Device command | `Device · n ready` or `Send to device` | One dialog; command status remains associated with selected item |
| Delete | Library item overflow → `Delete…` | One confirmation with explicit item name; return to Library selection |
| Account security | Avatar → `Sessions & devices` | Dedicated page → Back to previous dashboard workspace |
| Keyboard help | `?` and a discoverable Help entry | Overlay; Escape/Close returns to prior focus |

## Cognitive-Overload Risks

- Three simultaneous desktop regions can still compete; only selection, map, and core editor may carry strong emphasis.
- Route summary, editable fields, and header currently repeat name/revision/speed/mode/distance; retain one compact status line and remove repeated containers.
- Full waypoint lists and favorites inside the default route editor create a long panel; show summary first and reveal precise management on demand.
- Map panel-collapse controls, zoom/style controls, Device, Share, Refresh, and Save currently appear as peer controls; regroup by scope and demote infrequent actions.
- Excessive cream cards, rounded borders, chips, and shadows weaken hierarchy; use spacing/alignment first and reserve boundaries for selection, modal scope, or state.
- Mobile stacking exposes list and editor simultaneously and pushes Save/context below the fold; use reversible sheets and a persistent selected-item/action bar instead.

## Over-Simplification Risks

- Hiding search or the item list would slow frequent switching; preserve a shallow, labeled picker.
- Moving every field into dialogs would increase mode changes and memory burden; keep core route/place fields inline.
- Removing waypoint rows would eliminate keyboard/precise editing and gesture alternatives; disclose rather than delete them.
- Hiding unsaved state, revision, device readiness, validation, or destructive consequences would create unsafe false simplicity.
- Turning Library into a bare list with only `Open on map` would add unnecessary navigation for sharing, renaming, or deletion; retain lightweight management in Library.
- A mobile-only hamburger for all capability would reduce discoverability; use explicit Map / Library tabs and labeled sheets.

## Tradeoffs and Alternatives

- **Recommended: Map workbench + management-focused Library.** This removes the duplicate full editor while preserving direct editing and catalog management. The tradeoff is that spatial edits intentionally happen in Map; Library must provide a predictable one-step `Open on map` path.
- **Alternative: keep full editors in both Map and Library.** This avoids workspace switching but duplicates state, controls, validation, and mental models; reject unless user evidence shows two genuinely different editing contexts.
- **Alternative: remove Library and keep one universal workspace.** This minimizes top-level navigation but makes creation, bulk browsing, share lifecycle, and destructive management compete with map editing; reject for the current capability set.
- Revisit the recommendation if usage data shows Library CRUD dominates map editing, mobile is the primary platform, or remote device control is the dominant daily task.

## Architecture

- Keep `/dashboard/map` and `/dashboard/library/{places,routes}` as stable top-level routes; preserve compatibility redirects.
- Make Map the canonical full editor for both Route and Place spatial work. Reuse controlled `RouteMapEditor`, `PlaceMapEditor`, and one draft controller per item type.
- Refactor Library into management-focused list/detail components that reuse API hooks but do not mount the full Map editor.
- Extract shared shell primitives for global header, workspace tabs, item picker, inspector, sticky action/status bar, dialogs, and empty/error/loading states.
- Consolidate the layered cartographer rules in `web/app/globals.css` into scoped sections/components before adding new visual overrides. Do not introduce a second UI framework solely for this redesign.
- Keep draft ownership and unsaved-navigation guards explicit across item selection, Map / Library navigation, refresh, browser exit, and mobile sheet dismissal.

## Non-Goals

- Do not change backend schemas/APIs, Android UI, MapLibre provider, route geometry semantics, or mock-location behavior.
- Do not remove sharing, device control, account security, keyboard shortcuts, theme support, or public share pages.
- Do not add GPX/KML import/export, track recording, analytics, or speculative top-level tabs.
- Do not pursue a purely cosmetic reskin before the workspace responsibilities and action hierarchy are accepted.

## Accepted Wireframes

The user accepted the responsibility split during the design review: Library lists all Places and Routes without a map, and `Open on map` / New opens the canonical editor. Subsequent review feedback accepted a sans-serif hierarchy and removal of the redundant `Draft route` / `New route` / generic-instruction stack.

Desktop Map (primary action: Save; contextual: Device/Share; advanced: details/waypoints):

```text
┌ Global: Kestrel Cloud | Map · Library | refresh | account ┐
├ Picker (Places/Routes, search, New) ┬ Map ┬ Inspector      ┤
│ selected item + compact metadata    │     │ item name      │
│                                     │     │ core fields    │
│                                     │     │ More details   │
│                                     │     │ Waypoints      │
│                                     │     │ status + Save  │
└─────────────────────────────────────┴─────┴────────────────┘
```

Mobile Map (selection and draft survive panel changes):

```text
┌ Global + Map · Library ┐
├ Map                    ┤
├ Selected item          ┤
│ Map | Choose | Edit    │
├ contextual panel       ┤
└────────────────────────┘
```

Library (no map; primary action: Open on map / New; contextual: Share/More):

```text
┌ Global + Map · Library ┐
├ Places and routes  New ┤
├ All | Places | Routes  ┤
├ Search                 ┤
├ Place rows             ┤
├ Route rows             ┤
└────────────────────────┘
```

## Implemented State Matrix

| Surface | States exercised / represented | Local feedback and recovery |
| --- | --- | --- |
| Map shell | loading, selected Place/Route, new draft, mobile Map/Choose/Edit, collapsed desktop panels | Loading copy; selected identity; labeled panel controls with `aria-expanded` / `aria-pressed`; panel changes retain mounted draft state |
| Route editor | empty new route, valid/invalid waypoint count, dirty, discard rejected/accepted, saving/saved/error, existing revision | Compact status; disabled Save reason; `Unsaved changes`; Discard; selection/workspace/browser-exit guard; revision only when meaningful |
| Place editor | new/existing, coordinate entry/map manipulation, dirty, save/discard/error | Name/coordinates and Save remain visible; description/tags/public are under `More details`; Share/Device only appear for saved items |
| Library | loading skeleton, all/type-filtered, search empty, catalog empty, stale-data offline error, dense rows | Search/filter counts; descriptive empty copy and New paths; `role=alert` while existing rows remain usable; no MapLibre instance |
| Sharing | no link, active, disabled, create/copy/open/disable/re-enable, API error | One labeled modal from a saved item; status is textual, not color-only; Close/Escape returns to the catalog/editor |
| Device | ready count, no ready device, offline, remote disabled, revoked, command disabled | `Device · n ready` trigger; dialog lists per-device reasons and links the user to Kestrel Options |
| Account security | loading, current/other sessions, 5-row summary, expanded dense sessions, devices empty/list, sensitive confirmation, error/success | Current session is labeled; `Show n more sessions` progressively reveals dense history; password confirmation accepts legacy short current passwords; revoke stays secondary/destructive |
| Login/Register/TOTP | login, register, optional TOTP, recovery-code mode, validation/error | One auth card and one submit path per mode; registration-only password minimum; native labels/inputs retained |
| Public share | loading, invalid/error, Place/Route, signed-in copy | Item identity first; map/metadata second; distinct copy card with local result/error feedback |
| Global adaptation | light/dark, reduced motion, keyboard help/shortcuts, RTL, long text, 200% zoom-equivalent reflow | Visible focus ring, 44px targets, text labels, higher-contrast metadata tokens, reduced-motion override, no horizontal overflow |

## Validation Record

- `http://localhost:3401/dashboard/map?kind=places&selected=…` at `1200×792`: direct Place editor, controlled coordinates, Share/Device, one Save path; screenshot `pi-chrome-devtools-screenshot-32e93a91-b6c9-4c2d-9642-e47e3913a381.png`.
- `http://localhost:3401/dashboard/map?kind=routes&new=1` at `1200×792`: clean `New route` hierarchy, zero-waypoint validation, no unavailable Share/Device actions; screenshot `pi-chrome-devtools-screenshot-8d5736fb-019e-492c-b3ae-68dfbf6fead6.png`.
- Map at `390×844` with SwiftShader: map, labeled Map/Choose/Edit switcher, route picker, and full inspector all reachable with no horizontal overflow; screenshots `/tmp/redesign-map-390.png`, `/tmp/redesign-choose-390.png`, `/tmp/redesign-edit-390.png`.
- Library at `320×568`, `390×844`, `1024×768`, and `1440×900`: 5 rows across both sections, no map instance, no horizontal overflow; screenshots `/tmp/redesign-library-320.png`, `/tmp/redesign-library-390.png`, `/tmp/redesign-library-1024.png`, `/tmp/redesign-library-1440.png`.
- 200% zoom-equivalent review used a `600×400` CSS viewport at device scale 2: controls reflowed, New remained reachable, and `scrollWidth <= innerWidth`; screenshot `/tmp/redesign-library-zoom-200.png`.
- Dense-list fixture cloned real rows to 55 at `1200×800`; row width remained 1160px and no horizontal overflow occurred; screenshot `/tmp/redesign-library-dense-1200.png`. Account Security separately collapsed 11 active sessions to 5 plus `Show 6 more sessions`.
- RTL + long Arabic label smoke reported `direction: rtl` with no horizontal overflow. Long English/CJK-compatible wrapping was also exercised at the narrow viewports.
- Keyboard smoke: `/` focused the picker search, `?` opened help after focus left the input, Escape closed it, and `g l` navigated to Library. Native buttons/summary/details/dialog controls remained keyboard-operable.
- Recovery smoke: a dirty Route rejected item switching with `Discard unsaved changes? Save first to keep them.`; Discard restored the persisted value. New Place and Route create/save flows were exercised, then their verification items were deleted through Library confirmation.
- Offline smoke replaced fetch with a rejected promise during Library refresh: `Failed to fetch` appeared as an alert while 5 stale rows remained. Search no-match produced the descriptive empty state.
- Share lifecycle smoke created a public Place URL, opened `/share/[token]`, then disabled the link. Device smoke exposed offline/disabled/revoked reasons and disabled command actions.
- Theme smoke covered light/dark. Metadata contrast is 4.74:1 in light (`#7d6247` on `#f4ead5`) and 5.99:1 in dark (`#aa9578` on `#1f1a14`). Reduced-motion styles remove meaningful transition/animation duration without making state depend on motion.
- Authentication screenshot: `/tmp/redesign-login.png`. Public share screenshot: `pi-chrome-devtools-screenshot-77fb5e31-2287-4d45-978b-99e249b9c80b.png`.
- Quality gates passed on 2026-07-14: `just check`, `just lint`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.

## Plan

- [x] Document the current task inventory and state matrix for Map, Library, Login/Register/TOTP, Share, Device, and Account (loading, empty, selected, dirty, saving, error, offline, permission/readiness, destructive confirmation); verify with a checked design inventory in this plan or a linked `docs/` artifact.
- [x] Produce low-fidelity desktop and mobile wireframes for the recommended Map workbench and management-focused Library, labeling primary/secondary/contextual/advanced actions and disclosure paths; verify with explicit user acceptance before changing page responsibilities.
- [x] Prototype the shell hierarchy using existing data: global header, visible Map / Library tabs, desktop picker/map/inspector, mobile selected-item bar plus labeled picker/inspector sheets; verify focus order and screenshots at `1440×900`, `1024×768`, and `390×844`.
- [x] Consolidate shared shell/action/status primitives and the relevant cartographer CSS without changing behavior; verify no visual or keyboard regression on `/dashboard/map`, `/dashboard/library/places`, and `/dashboard/library/routes`.
- [x] Redesign Map Routes around direct manipulation and one inspector: keep name/speed/mode and Save visible, compress duplicated summary content, disclose precise waypoints/details/share/device, and preserve dirty-state recovery; verify select → map click/drag → precise row edit → save → refresh and rejected-discard flows in Chrome.
- [x] Add equivalent direct Place editing to Map with name/coordinates/Save visible and tags/description/share/device progressively disclosed; verify map drag, numeric coordinate entry, save, discard, and error recovery.
- [x] Redesign Library as a catalog: visible Places/Routes scope, search, one New action, scannable rows, selection context, and labeled management actions without a duplicate full map editor; verify create, rename/metadata, share lifecycle, delete confirmation, and one-step open-on-map flows.
- [x] Replace abstract panel controls (`F`, `−`) with conventional labeled/icon controls, preserve `aria-expanded`/`aria-pressed`, and keep keyboard alternatives and `?` help accurate; verify keyboard-only operation and accessible names in DOM inspection.
- [x] Align Login/Register/TOTP, public Share, and Account Security with the shared hierarchy and feedback patterns without merging their distinct tasks into the dashboard; verify authentication, copy-to-library, revoke/cancel, loading, empty, and error states.
- [x] Implement responsive behavior and edge-state fixtures: `320×568`, `390×844`, `1024×768`, `1440×900`, 200% text, long CJK/English labels, RTL smoke, empty and 50+ item lists, no devices, offline/error, and unsaved drafts; verify screenshots plus no unreachable actions or horizontal overflow.
- [x] Run accessibility and interaction review: keyboard/focus order, visible focus, dialog focus return, Escape/cancel, noncolor status cues, target sizing, contrast, reduced motion, and screen-reader labels; record bounded findings and fixes.
- [x] Run final quality and browser gates; verify with `just check`, `just lint`, `cd web && npm run typecheck`, `cd web && npm run build`, `git diff --check`, and Chrome smoke on all affected URLs.

## Suggested PR Sequence

1. Shell primitives, state inventory, and CSS consolidation with no behavior change.
2. Map Route hierarchy and disclosure.
3. Map Place parity and shared draft/recovery behavior.
4. Library catalog responsibility split and compatibility navigation.
5. Login, Share, Account, accessibility, edge states, and final cleanup.

Each PR must remain usable and must include browser evidence; do not land a half-migrated state with two competing primary editors or hidden recovery actions.

## Accessibility, Convention, and Validation Check

- Use standard text labels for non-obvious actions; icons may supplement but not replace the only route to core capability.
- Maintain at least `44×44px` touch targets for common controls and logical DOM/focus order independent of visual panel placement.
- Preserve native input/select semantics, dialog labels, focus return, Escape handling, and keyboard alternatives to drag/click map gestures.
- Ensure status is not color-only: pair dirty, online/offline, public, success, and error color with text/icon semantics.
- At 200% text and narrow widths, reflow controls and content instead of shrinking targets or truncating the selected item/action state.
- Respect reduced motion for panel/sheet transitions and avoid animation as the only indication of save or selection.
- Use the existing product convention of Map / Library and Places / Routes; change it only after wireframe acceptance and task-flow evidence.
- Browser review must use the Web test stack and SwiftShader Chrome when required for MapLibre, recording URL, viewport, state, and screenshot path.

## Completion Checklist

- [x] Map and Library have distinct, user-understandable responsibilities, verified by accepted wireframes and implemented page behavior.
- [x] Route and Place primary editing flows are direct in Map with one clear Save path, verified by create/edit/save/discard/reload browser smokes.
- [x] Library preserves complete creation, organization, sharing, deletion, and open-on-map capability without mounting duplicate full map editors, verified by CRUD/share browser smokes.
- [x] Device, Share, waypoint precision, descriptions, destructive actions, and account security remain discoverable through the documented labeled paths, verified by keyboard/pointer/touch review.
- [x] Unsaved work, loading, empty, error, offline, no-device, disabled, success, and destructive states have local feedback and recovery, verified by the state matrix and browser fixtures.
- [x] Desktop, tablet, mobile, 200% text, long-content, dense-list, and RTL layouts retain hierarchy and reachable actions, verified by recorded screenshots and overflow/focus measurements.
- [x] Accessibility review passes for keyboard, focus, labels, noncolor cues, targets, contrast, dialogs, reduced motion, and gesture alternatives, with evidence recorded in the plan or PRs.
- [x] Login/Register/TOTP, public Share, and Account Security visually align without losing their task-specific behavior, verified by browser smoke.
- [x] Required checks pass, verified by `just check`, `just lint`, Web typecheck/build, and `git diff --check`.
