## Goal

Replace the current web MapLibre default look with a Kestrel field-notebook map foundation that supports a watercolor-inspired aesthetic without requiring a keyed third-party tile API. Success means Places and Routes maps still pan, zoom, click, drag markers, and render with a warmer paper-toned map treatment or a documented provider-neutral fallback.

## Context

`docs/prompt.txt` proposes an external keyed watercolor tile service, but this plan replaces that with a non-keyed/provider-neutral approach. The current repo has no `web/src/` directory; relevant paths are `web/components/mapStyle.ts`, `web/components/*Map*.tsx`, `web/app/globals.css`, and `web/app/layout.tsx`.

## Non-Goals

- Do not add keyed third-party map tile URLs or public env vars for a hosted watercolor provider; use a verified non-keyed/public source or a local tint/style fallback.
- Do not change dashboard layout or component structure in this step.
- Do not remove or redesign existing markers, popups, click behavior, drag behavior, or route line behavior.

## Assumptions

- A provider-neutral style factory is acceptable so the UI can improve now while avoiding hosted-provider lock-in.
- Plain OSM can remain as a safe dev fallback if the no-key watercolor source is not available or not selected.

## Unknowns

- Which no-key map tile/style source is acceptable for production licensing, reliability, and attribution. This must be resolved before replacing the production base tiles.

## Plan

- [ ] Inventory every MapLibre initialization in `web/components/PlaceMapEditor.tsx`, `web/components/PlaceMapPreview.tsx`, `web/components/RouteMapEditor.tsx`, and `web/components/RouteMapPreview.tsx`; verify with `rg -n "new maplibregl.Map|createRasterMapStyle|style:" web/components web/app`.
- [ ] Replace `web/components/mapStyle.ts` with a provider-neutral style module that exports a typed `StyleSpecification` for `plain` and a Kestrel paper/watercolor candidate without keyed-provider URLs; verify TypeScript with `cd web && npm run typecheck`.
- [ ] Add an early provider/license decision note in the same plan PR or PR description documenting the selected no-key source or the fallback decision; verify by absence of keyed-provider implementation in `rg -n "NEXT_PUBLIC_.*MAP|api_key=" web`.
- [ ] Update each MapLibre component to import the new style helper while preserving map center, zoom, controls, marker setup, click handlers, drag handlers, and route line setup; verify with `git diff web/components/*Map*.tsx` and `cd web && npm run typecheck`.
- [ ] Add only map-control CSS needed for the field-notebook aesthetic, including attribution typography and hidden default zoom buttons; verify no dashboard layout selectors outside MapLibre controls are touched in this step by reviewing `git diff web/app/globals.css`.
- [ ] Run the web quality gates; verify with `cd web && npm exec -- biome ci .`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.
- [ ] Manually smoke Places and Routes maps in the browser: click map to add/move markers, drag route/place markers, pan/zoom, and confirm map attribution remains visible; verify with screenshot or explicit manual test notes.

## Risks

- Public no-key tile providers may have rate limits, attribution requirements, or terms unsuitable for production.
- If a vector style is selected instead of raster tiles, route line/source restoration may need extra care after style load events.
- A CSS-only tint over OSM may improve mood but may not meet the original “watercolor” visual goal.

## Rollback / Recovery

- Revert the map-style commit to restore `createRasterMapStyle()` and the existing OSM raster map behavior.
- Keep the plain fallback available until a no-key watercolor source is verified in production.

## Completion Checklist

- [ ] No keyed watercolor tile provider usage is verified by `rg -n "NEXT_PUBLIC_.*MAP|api_key=" web` returning no implementation hits.
- [ ] All MapLibre initialization sites use the new typed style helper, verified by `rg -n "createRasterMapStyle|kestrel.*MapStyle|getStyle" web/components web/lib` and code review.
- [ ] Places and Routes maps remain interactive, verified by manual browser smoke notes for pan, zoom, click, drag, and marker visibility.
- [ ] Web checks pass, verified by `cd web && npm exec -- biome ci .`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.
