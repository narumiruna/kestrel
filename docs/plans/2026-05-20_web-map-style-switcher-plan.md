## Goal

Make the Kestrel web map style switchable without a keyed hosted watercolor tile provider: a built-in field-notebook/watercolor-style mode and a plain OSM mode that both work on a fresh clone. Success means users can toggle map appearance without losing pan/zoom or markers, and the last choice persists.

## Context

This adapts Prompt 5 from `docs/prompt.txt` but removes keyed-provider-specific keys and URLs. It should land after the map style foundation plan and can be integrated with cartographer chrome later.

## Non-Goals

- Do not use keyed hosted watercolor tile URLs or a public map-provider env var.
- Do not require configuration for the app to render maps in local development.
- Do not rebuild markers as GeoJSON layers in this plan unless required to preserve style switching.

## Assumptions

- `plain` OSM remains the no-config fallback.
- The field-notebook mode uses the same no-key OSM raster source with local MapLibre paper tinting, so no provider configuration is required.

## Provider Decision

- No no-key watercolor configuration variable is needed for this implementation; style switching is driven by the built-in `field-notebook` and `plain` style names persisted in `kestrel-map-style`.

## Plan

- [x] Define `MapStyleName = 'field-notebook' | 'plain'` and `getStyleByName()` in the web map style module, with `plain` requiring no env var; verify with `cd web && npm run typecheck`.
- [x] Add a storage-backed hook such as `web/hooks/useMapStyle.ts` using localStorage key `kestrel-map-style`, returning `plain` on first render and resolving stored/default style on mount; verify with unit-free TypeScript checks and browser manual refresh.
- [x] Add a single dev console info helper documenting that no provider key is required, guarded against React Strict Mode duplicate logs; verified during browser smoke.
- [x] Update all MapLibre components to call `map.setStyle(getStyleByName(styleName))` instead of recreating the map when the style changes; verify pan/zoom position is preserved by manual browser toggle.
- [x] Re-attach custom markers and route line sources after `setStyle` if MapLibre clears style-owned sources/layers; verify markers and route lines remain visible after toggling.
- [x] Add a small cartographer-style map toggle button because both built-in styles are usable on a fresh clone; verified by browser smoke and `localStorage` updates.
- [x] Update `web/.env.example` with no-key map style configuration only if a required variable is introduced; verify `git diff web/.env.example` does not mention keyed provider.
- [x] Run web quality gates; verify with `cd web && npm exec -- biome ci .`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.

## Risks

- `map.setStyle()` can clear custom MapLibre sources/layers; route lines may disappear if not restored after style events.
- localStorage access can throw in privacy-restricted browsers; the hook should guard reads/writes like the existing theme provider.
- A hidden toggle when no alternate style exists is less discoverable but avoids confusing users with unavailable watercolor mode.

## Rollback / Recovery

- Keep style switching isolated behind the hook; reverting the toggle/hook commit should leave the static map style foundation intact.
- If style switching loses markers, disable the toggle button and keep the default style until marker restoration is fixed.

## Completion Checklist

- [x] Fresh clone/no env shows a working field-notebook map and a plain-style toggle with no provider key, verified by browser smoke.
- [x] Built-in no-key styles show a toggle and persist the selected style across refresh using `kestrel-map-style`, verified by browser smoke and localStorage inspection.
- [x] Toggling styles preserves pan/zoom and marker/route-line visibility, verified by manual Places and Routes smoke.
- [x] No keyed watercolor provider strings are present, verified by `rg -n "NEXT_PUBLIC_.*MAP|api_key=" web`.
- [x] Web checks pass, verified by `cd web && npm exec -- biome ci .`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.
