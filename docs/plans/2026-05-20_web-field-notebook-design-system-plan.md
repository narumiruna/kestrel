## Goal

Establish the “1920s explorer’s field notebook” visual foundation for the web dashboard while preserving current behavior. Success means the existing dashboard keeps working but uses paper/ink/rust tokens, field-notebook fonts, and subtle paper grain.

## Context

`docs/prompt.txt` targets a larger cartographer redesign. This plan is the design-token and font slice only. The repo uses `web/app/layout.tsx` and `web/app/globals.css`, not `web/src/app`.

## Non-Goals

- Do not rebuild Places or Routes layout in this step.
- Do not change auth, API calls, map behavior, or dashboard data flow.
- Do not add keyed map-provider dependencies or map-provider env vars.

## Plan

- [ ] Add `next/font/google` imports for Cormorant Garamond, JetBrains Mono, and Inter in `web/app/layout.tsx`; verify generated class variables are applied to the root `<html>` or body with `git diff web/app/layout.tsx` and `cd web && npm run typecheck`.
- [ ] Replace the top-level color variables in `web/app/globals.css` with paper/ink/kestrel tokens while preserving existing aliases like `--bg-canvas`, `--bg-surface`, `--text-primary`, and `--accent`; verify existing selectors still compile with `cd web && npm run typecheck`.
- [ ] Add `.font-serif`, `.font-mono`, and `.font-sans` utility classes to `web/app/globals.css`; verify with `rg -n "font-serif|font-mono|font-sans" web/app/globals.css`.
- [ ] Add the paper-grain overlay without replacing the existing 3px top accent hairline; verify in `web/app/globals.css` that the grain uses a separate pseudo-element or non-conflicting selector and that the hairline still renders.
- [ ] Review dark-mode token compatibility so existing warm dusk dark mode remains usable; verify by checking the `:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` token blocks.
- [ ] Run web quality gates; verify with `cd web && npm exec -- biome ci .`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.
- [ ] Browser-smoke login, Places, Routes, and shared pages for visual regressions and console errors; verify with explicit manual notes or screenshots.

## Risks

- The grain overlay can cover clickable UI if `pointer-events: none` or z-index is wrong.
- Replacing aliases can unintentionally reduce contrast in dark mode.
- Adding fonts changes layout metrics and may reveal spacing issues.

## Rollback / Recovery

- Revert the design-token commit to restore the previous terracotta/cream system.
- If fonts fail to load or affect performance, keep CSS variables but remove the Google font imports in a follow-up commit.

## Completion Checklist

- [ ] The app uses paper/ink/kestrel tokens while old aliases still exist, verified by `rg -n "--paper-cream|--ink-black|--kestrel|--bg-canvas|--accent" web/app/globals.css`.
- [ ] Font variables are wired into the app root, verified by `git diff web/app/layout.tsx` and visual browser smoke.
- [ ] Existing pages render without layout rebuilds, verified by browser smoke of login, dashboard, Places, Routes, and share pages.
- [ ] Web checks pass, verified by `cd web && npm exec -- biome ci .`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.
