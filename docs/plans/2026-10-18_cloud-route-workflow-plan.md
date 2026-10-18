# Cloud Route Workflow

## Goal

Use the Android App palette for Map / Routes, fit routes inside the visible map, and provide clear View / Edit / Playback workflows without changing APIs or stored data.

The user's latest color instruction replaces the initial deep-teal requirement. Android uses #0066B8 in light mode and #9DCAFF in dark mode, with Mist / Night surfaces. Orange #C2410C remains a route accent.

## Context

- `web/app/dashboard/map/page.tsx` owns route drafts, selection, workflow state, save lifecycle and dirty-navigation protection.
- `RouteEditor.tsx` previously nested Path / Playback and Overview / Edit points controls and independently scrolled the waypoint list.
- `RouteMapEditor.tsx` used fixed 56px fit padding and disabled marker selection outside editing.
- Desktop map bounds already exclude panel widths. Camera padding must reserve overlapping tools without counting panels twice.
- Web uses Radix, MapLibre and English strings. No translation framework is present. No new application dependency, migration or API change was needed.

## Plan

- [x] Inspect component ownership, camera behavior, scrolling, tokens and draft safety; evidence: Map page, Stage, RouteEditor, RouteMapEditor and Android Color.kt / Theme.kt source review.
- [x] Update semantic tokens and workspace styles to Android colors, distinct semantic states, visible focus, larger targets and one inspector scroll owner; evidence: palette contrast tests and desktop/narrow browser checks.
- [x] Replace nested mode controls with View / Edit / Playback and a single add-source menu; preserve draft history, allow read-only marker selection and reveal selected rows above the save bar; evidence: workflow tests and browser interactions.
- [x] Fit empty, single and multi-point routes using measured map space and tool padding; preserve manually moved cameras on edits and resize; evidence: viewport tests and real MapLibre camera checks.
- [x] Add regression tests and execute all affected-workspace gates with lockfile-aligned dependencies; evidence: 85 Web tests, full Web checks and Node 22 production build below.
- [x] Complete account-backed Map / Routes regression checks with real saved routes and places: select routes, save/reload edits, delete/reorder, share and inspect existing Android playback controls. Evidence: normal registration, TOTP, login and refresh against a dedicated local test database, followed by browser checks. No existing service, account or physical device was modified.
- [x] Fix review findings for focus/resize requests during style loading, overlapping save/navigation, clean implicit form submissions, failed deletion feedback, stable tabpanel relationships and read-only/external drops; evidence: camera policy tests and browser failure injection.

## Completion Checklist

- [x] Android primary actions and selected surfaces have non-color cues. Palette tests verify normal text at least 4.5:1 and outlines / route casing at least 3:1. Browser checks confirm light/dark Save colors.
- [x] Show entire route fits actual map bounds. Empty-route action is disabled, single-point fitting is finite, and panel changes resize the MapLibre canvas.
- [x] Inspector body is the sole vertical scroll owner on 1440×900 and 390×844. Long-list selection reveals the selected row above the sticky save bar.
- [x] Browser checks cover mode transitions, actual saved-place insertion, coordinate/map additions, Escape, Undo / Redo, two-way selection, keyboard selection and discard confirmation. Existing draft reducer tests pass.
- [x] Desktop and narrow layouts have no horizontal page overflow. Actual WorkspaceHeader fits the narrow layout. Map tools do not cover attribution.
- [x] Remove the temporary component-verification page and its generated type artifact; production build contains only existing application routes. Screenshots and credentials remain outside Git.
- [ ] Verify stored-route management, saved-place insertion and Android playback end to end with an authenticated local account and any required device authorization. Stored-route and Web/Backend protocol checks pass. An Android runtime/device is unavailable; acceptance of the isolated protocol receiver instead of Android runtime playback is awaiting the user's decision. Do not mark this complete or archive the plan before that decision or device evidence.

## Verification Results

### Automated checks

- Web `npm ci` and `npm ls --depth=0`: succeeded; no package or lockfile change, 0 Web audit vulnerabilities.
- `just web-check`: passed, including generated brand asset checks; 44 existing CSS warnings and 1 informational diagnostic remain. No new diagnostic in changed files.
- `just web-lint` and `just web-typecheck`: passed.
- Web typecheck, 85 Node tests and production build under Node.js 22.23.3: passed. Next.js 16.3.8 generated the existing 22 static pages.
- `just backend-check`: passed without Backend source changes; Prisma generation, lint, 258 unit tests, 11 e2e tests, typecheck and build passed.
- Backend `npm ci` reported 24 inherited audit vulnerabilities (20 moderate, 4 high). No Backend dependency changed; dependency remediation is outside this Web plan.
- `git diff --check`: passed. No image, credential, generated cache, migration or verification-page source is intended for the commit.

### Browser checks

Chrome DevTools MCP could not find its configured executable. A separate local Chrome instance was controlled through Chrome DevTools Protocol instead; no Playwright was used.

- Initial component checks used actual RouteEditor, RouteMapEditor, Stage, IndexCard, ZoomStack and WorkspaceHeader with an unsaved in-memory draft.
- Account-backed checks used a new database in the existing `kestrel-webtest` PostgreSQL service and loopback-only Backend/Web servers. Authentication used normal registration, TOTP, login and refresh APIs, with dev-default login disabled. Existing services on ports 3300/3301 were not modified.
- Stored routes: saved-place insertion, coordinate additions, ordering, deletion, Undo / Redo, mode/speed changes, save/reload, new-route creation and deletion passed. Existing waypoint speed/pause metadata survived editing and saving.
- Sharing: creation/re-enabling of the real public page and link disabling passed. Dirty drafts did not silently change the saved route.
- Save failure injection: the draft and stored baseline remained intact, errors were visible, a route switch cleared stale errors, and navigation could not discard the active draft during an in-flight save. Repeated submit produced exactly one revision.
- Delete failure injection: confirmation stayed open with retry feedback; the route remained stored and a subsequent retry succeeded.
- Camera loading injection: a fitted route resized during a style change was refitted on readiness; a user-controlled camera was preserved; a waypoint selected during loading was revealed when ready.
- Accessibility: every workflow tab has a stable tabpanel, arrow-key mode navigation and keyboard selection work, modal focus returns correctly, reduced motion is respected, View rejects drops, and Edit rejects external drops while retaining internal reordering.
- Playback protocol: the actual Web UI queued START_ROUTE/STOP through the real Backend. A dedicated test-owned protocol receiver polled and acknowledged them. The UI displayed APPLIED/FAILED results, preserved the intended unsaved draft snapshot and respected remote opt-out. This is not Android runtime playback evidence.
- Captures: `/tmp/kestrel-route-authenticated-desktop.png` and `/tmp/kestrel-route-authenticated-narrow.png`. No screenshot is committed.

## Review and Remaining Risks

- Reviewed the complete intended diff for correctness, security, lifecycle safety, compatibility, regressions and scope. Camera loading requests and save/navigation races found during review were fixed and retested.
- API payloads, route modes, storage formats, auth checks, refresh/session rules and remote-command expiry/revocation semantics are unchanged. Legacy technical mode search terms still match.
- No Android SDK, emulator or authorized physical device is available. No Android runtime, device preferences, mock provider or physical location state was changed. The remaining acceptance decision is stated above; no completion claim is made.
- Source inspection found an intentional account popover, not an automatic product login overlay. No login/security notice, credential-manager UI or attribution was removed or hidden. The original floating prompt cannot be identified without its original browser context.
- Keep this plan open while acceptance evidence is missing. A draft PR may carry the implementation and verified evidence without declaring the plan complete.
