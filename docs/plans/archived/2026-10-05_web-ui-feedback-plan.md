# Web UI feedback plan

## Goal

Apply the shared UI review to the existing Web workflows: keep dense routes readable, make Library faster to scan, and reduce Account security's initial form density. Preserve manual saves, canonical Map editing, API contracts, and security confirmations.

## Context

Feedback: https://chatgpt.com/share/6ac34214-db94-83ee-b9f1-ab6bbb00002f. The mockups illustrate hierarchy, not implemented capabilities. Do not introduce autosave claims, pagination, fabricated session metadata, a second editor, or additional mode switches. Existing Path / Playback sections and selected-waypoint list scrolling remain intact. This focused pass does not execute or close the separate workspace information architecture plan.

## Plan

- [x] Inspect shared feedback and current Map, Library, Account, marker CSS, and tests.
- [x] Add screen-space route label collision handling; always prioritize selected/hovered points and endpoints, thin nearby dots until zoomed in, retain visible point buttons/dragging and full list access, and recompute after map movement. Dense, sparse, overlapping, selected-point, and dot-spacing tests pass.
- [x] Combine filtered Library items into one stable sortable list, reduce row density, and expose explicit Open on map actions while retaining search, error states, sharing, deletion, and legacy filter entry points. Mixed sorting and stable identity tests pass. Notes/tags move to a contextual popover; URL-only descriptions become a safe reference link.
- [x] Reuse the workspace header on Account without selecting Map/Library; show compact sign-in methods and open the existing password form in a dialog. Preserve credentials, OIDC callbacks, sensitive-action confirmations, and session/device behavior. Closing resets the form and restores trigger focus; closing is guarded during submission.
- [x] Remove the decorative body texture without changing MapLibre marker positioning or brand assets.

## Completion Checklist

- [x] Web unit tests (41), `just web-check`, `just web-lint`, `npm run typecheck`, and `npm run build` pass. Existing 44 CSS specificity warnings remain. Local runtime: Node.js 25.4.0; CI Node.js 22 was not run locally.
- [x] Chrome DevTools Protocol review in isolated headless Chrome at 1440×900 light mode verifies mixed ordering, sort control, type filtering, tag search/clear, 64px rows, notes/reference-link disclosure, Account navigation, password form disclosure/close/focus restoration, dense route selection, and zoom recovery. API reads use fixtures and writes are blocked. Screenshots are outside Git at `/tmp/kestrel-ui-{library,account,password,map}.png`.
- [x] Final diff is scoped to Web, this plan, and the plan index; unrelated `PLAN.md` remains untouched. The generated TypeScript cache was restored to its original contents. No binary images, external writes, database/device operations, commit, or deployment.

## Validation notes

No Chrome DevTools MCP tool was exposed. Validation used Chrome's DevTools Protocol over a local WebSocket, not Playwright, against the local production build. Browser scripts and screenshots stay outside the repository. Real backend errors, password submissions, sharing/deletion, populated sessions/devices, mobile, and dark mode were not exercised by this focused browser fixture.
