# Web library usability

## Goal

Make saved places and routes easier to scan and open, and make search, empty, and failed-loading states explain the next action accurately.

## Context

- `LibraryCatalog.tsx` repeats three row actions while item names are not links.
- A category with no items and an unsuccessful load can both display “Your library is empty”.
- The Map picker always describes an empty collection as a failed search and adds skeletons above cached rows on refresh.
- Keep Radix UI, the existing warm palette, MapLibre, stable item IDs, direct Share access, and existing draft guards.

## Non-Goals

Backend, authentication, database, device control, new navigation modes, and a global CSS rewrite. No live account mutations or device tests.

## Plan

- [x] Improve Library hierarchy and row navigation in `LibraryCatalog.tsx`, `LibraryItemActions.tsx`, and the existing Library CSS; verify one-click Map navigation and direct Share access with local Chrome fixtures.
- [x] Add clear-search recovery, result feedback, and distinct empty/category/error states; verify populated, empty, filtered, loading, partial-failure, and retry scenarios with Chrome fixtures.
- [x] Improve Map picker loading and empty feedback without changing draft lifecycle; verify clear-search behavior and retained cached rows during refresh.

## Completion Checklist

- [x] Run `just web-check`, `just web-lint`, `cd web && npm test`, `just web-typecheck`, and `just web-build` successfully. All passed; 13 unit tests passed and the production build generated all 16 pages.
- [x] Review Chrome DevTools screenshots at 1440×900 in light mode, kept outside the repository; check keyboard focus, row links, Share/More/New menus, long names, and no horizontal overflow. Evidence: 35 CDP fixture assertions passed with no unexpected API calls or runtime exceptions; a separate keyboard check confirmed the row link's visible focus ring. Screenshots and results are in `/tmp/kestrel-ui-review/`. Cloud requests were intercepted; no live data or device changes were made.
- [x] Review the diff for unintended changes and restore generated `web/tsconfig.tsbuildinfo` if rewritten. `git diff --check` passed, the cache was restored, and only the four intended Web source files and this plan remain changed. All checks passed; archive this plan.
