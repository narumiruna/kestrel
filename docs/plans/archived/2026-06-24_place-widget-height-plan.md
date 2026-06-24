## Goal

Make the right-side Places editor widget size to its content instead of stretching from the top bar to the viewport bottom. Success means `/dashboard/places` no longer has the route-editor-style tall empty card at desktop size, while route editor height and place footer behavior remain usable.

## Context

Chrome/CDP at `1440×760` showed the Places `index-card` was `440×672px`, but the embedded place form content was only about `402×464px`. The stretch came from desktop CSS that fixed `.index-card` with both `top` and `bottom`, plus `.index-card .place-editor-embedded { height: 100%; }`. Routes need more vertical room; Places does not.

## Non-Goals

- Do not change place/share/remote business logic.
- Do not redesign route editor height in this pass.
- Do not add a UI dependency.

## Plan

- [x] Measure current desktop Places and Routes card dimensions on `compose.webtest.yaml` at `1440×760` to preserve evidence; verified with Chrome/CDP output in `/tmp/kestrel-widget-before.json` and screenshots `/tmp/kestrel-place-widget-before.png` / `/tmp/kestrel-route-widget-before.png` (`places.card.height: 672`, `routes.card.height: 672`).
- [x] Update `web/app/globals.css` to apply content-sized desktop height only to `.index-card-place`, reusing the existing `variant="place"` class; verified by code review that `.index-card-route` still inherits the full-height `.index-card` behavior.
- [x] Adjust embedded place editor CSS so the form does not force viewport-height layout on desktop when inside `.index-card-place`; verified with Chrome/CDP output in `/tmp/kestrel-widget-after.json` (`places.card.height: 638.25`, `places.gapBelowCard: 49.75`).
- [x] Check overflow fallback for narrow/short desktop viewports so long place content still scrolls instead of clipping; verified with Chrome/CDP output in `/tmp/kestrel-place-height-verify.json` at `1024×600` (`contentScrolls: true`, `footerVisible: true`) and screenshot `/tmp/kestrel-place-widget-short-after.png`.
- [x] Run web validation; verified with `just web-check`, `cd web && npm run lint`, `cd web && npm run typecheck`, and `git diff --check`.
- [x] Update PR #172 with the CSS fix and before/after evidence; verified with `gh pr edit 172` / `gh pr view 172` after pushing the branch.

## Risks

- Shrinking the place card could make the sticky footer unnecessary or awkward if the content grows; mitigated with a max-height and scroll fallback verified at `1024×600`.
- Shared `.index-card` rules affect both Places and Routes; mitigated by targeting `.index-card-place` only.

## Completion Checklist

- [x] `/dashboard/places` right widget no longer stretches to the viewport bottom at `1440×760`, verified by Chrome/CDP output in `/tmp/kestrel-widget-after.json` (`bottom: 710.25`, `gapBelowCard: 49.75`) and screenshot `/tmp/kestrel-place-widget-after.png`.
- [x] `/dashboard/routes` right widget remains usable and full-height, verified by Chrome/CDP output in `/tmp/kestrel-widget-after.json` (`routes.card.height: 672`, `gapBelowCard: 16`) and screenshot `/tmp/kestrel-route-widget-after.png`.
- [x] Place Share and Device dialogs still open without changing editor content height, verified by Chrome/CDP output in `/tmp/kestrel-place-height-verify.json` (`closed.card.height`, `share.card.height`, and `device.card.height` are all `638.25`).
- [x] Web checks pass, verified by `just web-check`, `cd web && npm run lint`, `cd web && npm run typecheck`, and `git diff --check`.
- [x] The completed plan is archived to `docs/plans/archived/2026-06-24_place-widget-height-plan.md`, verified by this archived file path.
