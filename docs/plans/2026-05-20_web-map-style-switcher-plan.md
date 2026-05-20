## Goal

Make the Kestrel web map style switchable without a keyed hosted watercolor tile provider: a field-notebook/watercolor-style mode when a non-keyed provider source is configured, and a plain OSM mode that works on a fresh clone. Success means users can toggle map appearance without losing pan/zoom or markers, and the last choice persists.

## Context

This adapts Prompt 5 from `docs/prompt.txt` but removes keyed-provider-specific keys and URLs. It should land after the map style foundation plan and can be integrated with cartographer chrome later.

## Non-Goals

- Do not use keyed hosted watercolor tile URLs or a public map-provider env var.
- Do not require configuration for the app to render maps in local development.
- Do not rebuild markers as GeoJSON layers in this plan unless required to preserve style switching.

## Assumptions

- `plain` OSM remains the default no-config fallback.
- A future no-key watercolor source may be configured by URL or selected from a verified no-key provider.

## Unknowns

- The final name and shape of the no-key watercolor configuration variable. This should be resolved during the map-style foundation provider decision.

## Plan

- [ ] Define `MapStyleName = 'field-notebook' | 'plain'` and `getStyleByName()` in the web map style module, with `plain` requiring no env var; verify with `cd web && npm run typecheck`.
- [ ] Add a storage-backed hook such as `web/hooks/useMapStyle.ts` using localStorage key `kestrel-map-style`, returning `plain` on first render and resolving stored/default style on mount; verify with unit-free TypeScript checks and browser manual refresh.
- [ ] Add a single dev console info helper for missing no-key watercolor configuration, guarded against React Strict Mode duplicate logs; verify by observing one console message in dev with no config.
- [ ] Update all MapLibre components to call `map.setStyle(getStyleByName(styleName))` instead of recreating the map when the style changes; verify pan/zoom position is preserved by manual browser toggle.
- [ ] Re-attach custom markers and route line sources after `setStyle` if MapLibre clears style-owned sources/layers; verify markers and route lines remain visible after toggling.
- [ ] Add a small cartographer-style map toggle button only when more than one usable style is available; verify the button is absent on a fresh clone and present when the no-key style is configured.
- [ ] Update `web/.env.example` with no-key map style configuration only if a required variable is introduced; verify `git diff web/.env.example` does not mention keyed provider.
- [ ] Run web quality gates; verify with `cd web && npm exec -- biome ci .`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.

## Risks

- `map.setStyle()` can clear custom MapLibre sources/layers; route lines may disappear if not restored after style events.
- localStorage access can throw in privacy-restricted browsers; the hook should guard reads/writes like the existing theme provider.
- A hidden toggle when no alternate style exists is less discoverable but avoids confusing users with unavailable watercolor mode.

## Rollback / Recovery

- Keep style switching isolated behind the hook; reverting the toggle/hook commit should leave the static map style foundation intact.
- If style switching loses markers, disable the toggle button and keep the default style until marker restoration is fixed.

## Completion Checklist

- [ ] Fresh clone/no env shows a working plain map with no toggle and one dev info message, verified by browser smoke.
- [ ] Configured no-key style shows a toggle and persists the selected style across refresh using `kestrel-map-style`, verified by browser smoke and localStorage inspection.
- [ ] Toggling styles preserves pan/zoom and marker/route-line visibility, verified by manual Places and Routes smoke.
- [ ] No keyed watercolor provider strings are present, verified by `rg -n "NEXT_PUBLIC_.*MAP|api_key=" web`.
- [ ] Web checks pass, verified by `cd web && npm exec -- biome ci .`, `cd web && npm run typecheck`, `cd web && npm run build`, and `git diff --check`.
