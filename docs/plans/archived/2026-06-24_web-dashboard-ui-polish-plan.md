## Goal

Polish the Web dashboard map/editor layout so controls do not cover editor cards and route forms are not obscured by sticky footers. Success means Places and Routes remain usable at desktop, short desktop, and mobile viewport sizes without changing share, remote-control, or persistence behavior.

## Context

Chrome/CDP review of `compose.webtest.yaml` found these concrete issues:

- Mobile (`390×844`): the horizontal map controls overlapped the editor card header on both `/dashboard/places` and `/dashboard/routes`.
- Desktop and short desktop: map controls slightly overlapped the right editor widget.
- Routes desktop (`1440×760`) and short desktop (`1024×600`): sticky footer visually covered route settings content.
- Mobile: the decorative `index-card-pin` dot looked like a status/control but was not interactive.

## Non-Goals

- Do not change backend APIs, share-link behavior, remote-control behavior, or route/place save behavior.
- Do not add a UI dependency.
- Do not redesign the full dashboard; fix the measured layout defects only.

## Plan

- [x] Preserve current evidence by keeping the latest Chrome/CDP screenshots and measurements under `/tmp/kestrel-ui-audit-*.png` and `/tmp/kestrel-web-ui-audit.json`; verified the files include desktop, short desktop, and mobile Places/Routes cases.
- [x] Update `web/app/globals.css` so desktop `.map-control-stack` is positioned outside the right editor widget using `right: calc(var(--cloud-editor-width) + <gap>)`; verified with Chrome/CDP output in `/tmp/kestrel-web-ui-polish-after.json` that map controls no longer overlap `.index-card` at `1440×760` and `1024×600`.
- [x] Update mobile `.map-control-stack` CSS to anchor controls inside the map row instead of fixed over the page flow; verified with Chrome/CDP screenshots `/tmp/kestrel-ui-audit-places-mobile.png` and `/tmp/kestrel-ui-audit-routes-mobile.png` that controls stay on the map and no longer cover editor card headers at `390×844`.
- [x] Hide `.index-card-pin` in the cartographer dashboard so the decorative dot no longer looks interactive; verified with Chrome/CDP output in `/tmp/kestrel-web-ui-polish-interactions.json` (`hasPin: false` for Places and Routes cases) and screenshots.
- [x] Changed `web/components/dashboard/RouteEditor.tsx` because CSS-only footer fixes kept content under the sticky footer: wrapped route sections in `.route-editor-content` and kept the footer outside that scroll region; verified route content touches but does not sit under the footer at `1440×760` and `1024×600`.
- [x] Added the smallest CSS needed in `web/app/globals.css` for the route scroll container/footer layout; verified route editor scrolling and visible footer actions with `/tmp/kestrel-ui-audit-routes-desktop.png`, `/tmp/kestrel-ui-audit-routes-short.png`, and `/tmp/kestrel-web-ui-polish-interactions.json`.
- [x] Run validation; verified with `just web-check`, `cd web && npm run lint`, `cd web && npm run typecheck`, and `git diff --check`.
- [x] Run visual review on `compose.webtest.yaml`; verified `/dashboard/places` and `/dashboard/routes` at `1440×760`, `1024×600`, and `390×844` with Chrome/CDP screenshots and measured overlap output in `/tmp/kestrel-web-ui-polish-after.json`.

## Risks

- Moving map controls may make them harder to reach on mobile; mitigated by keeping them in the map row bottom-right rather than hiding them.
- Route footer layout changes can accidentally reduce scrollable form area; mitigated by verifying short desktop and mobile screenshots plus dialog interactions.

## Completion Checklist

- [x] Map controls do not overlap the right editor widget on desktop or short desktop, verified by Chrome/CDP overlap measurements in `/tmp/kestrel-web-ui-polish-after.json` and `/tmp/kestrel-web-ui-polish-interactions.json` (`cardControlOverlap: 0`).
- [x] Map controls do not overlap editor card headers on mobile Places or Routes, verified by `390×844` screenshots `/tmp/kestrel-ui-audit-places-mobile.png` and `/tmp/kestrel-ui-audit-routes-mobile.png` plus overlap output (`cardControlOverlap: 0`).
- [x] Route footer no longer obscures route settings content at `1440×760` or `1024×600`, verified by screenshots `/tmp/kestrel-ui-audit-routes-desktop.png` and `/tmp/kestrel-ui-audit-routes-short.png` plus `routeContentTouchesFooter: true` in `/tmp/kestrel-web-ui-polish-interactions.json`.
- [x] Decorative `index-card-pin` is not visible in dashboard editor cards, verified by desktop/mobile screenshots and `hasPin: false` in `/tmp/kestrel-web-ui-polish-interactions.json`.
- [x] Places and Routes save/share/device controls remain visible and usable, verified by `/tmp/kestrel-web-ui-polish-dialogs.json` (`shareDialog.open: true`, `deviceDialog.open: true` for both Places and Routes).
- [x] Web checks pass, verified by `just web-check`, `cd web && npm run lint`, `cd web && npm run typecheck`, and `git diff --check`.
