# Route Marker Positioning Fix Report

Date: 2026-06-28

## Summary

In the Web development environment, the sample Routes data rendered the route line correctly, but waypoint markers did not sit on the route line. The user-provided `image.png` showed markers drifting progressively to the right starting around marker 2, with later markers becoming more severely offset.

The issue has been fixed, and the user manually confirmed that the markers now sit on the route line.

## Impact

- Affected page: `/dashboard/routes`
- Affected component: MapLibre HTML markers in `RouteMapEditor`
- Main file: `web/app/globals.css`
- Route geometry and backend waypoint data were not affected; the route line itself used the correct coordinates.

## Investigation

1. Checked route marker related code:
   - `web/components/RouteMapEditor.tsx`
   - `web/components/RouteMapPreview.tsx`
   - `web/app/globals.css`
2. Confirmed the line and markers use the same waypoint coordinates:
   - line: `[waypoint.longitude, waypoint.latitude]`
   - marker: `.setLngLat([waypoint.longitude, waypoint.latitude])`
3. Because the coordinate source was shared, the issue was not waypoint ordering or swapped latitude/longitude. The problem had to be in marker DOM/CSS positioning.
4. Measured markers with Chrome DevTools Protocol:
   - Before the fix, the `transform: translate(...)` written by MapLibre did not match the actual `getBoundingClientRect()` center of each marker.
   - The error increased for marker 2, 3, 4, and so on, matching the behavior of marker elements still participating in inline layout before MapLibre transforms were applied.

## Root Cause

`web/app/globals.css` contained this rule:

```css
button.route-marker {
  position: relative;
}
```

That overrode MapLibre's built-in marker CSS:

```css
.maplibregl-marker {
  position: absolute;
}
```

The selector `button.route-marker` has higher specificity than `.maplibregl-marker`, and each route marker element has both classes:

```html
<button class="route-marker ... maplibregl-marker ...">
```

As a result, markers were no longer absolutely positioned. They stayed in normal inline flow, while MapLibre still applied `transform: translate(...)`. The transform was applied from the wrong inline-layout starting point, so each marker's inline width accumulated into a progressively larger offset.

## Fix

Removed `button.route-marker { position: relative; }` so MapLibre owns marker positioning again.

Changed file:

- `web/app/globals.css`

Actual change:

```diff
-button.route-marker {
-  position: relative;
-}
```

This is the smallest fix: no route data changes, no MapLibre marker creation changes, and no extra wrapper elements.

## Verification

### Development environment

Used the dev web stack:

```bash
just webtest-up
```

Verified page:

```text
http://localhost:3401/dashboard/routes
```

### Automated measurement

Used Chrome DevTools Protocol to open the page, sign in with the dev `admin / admin` account, wait for route markers and the canvas to load, and measure whether each marker's actual center matched the translate target set by MapLibre.

Post-fix measurement:

```json
{
  "maxError": 0,
  "markers": [
    { "label": "1", "error": 0, "position": "absolute" },
    { "label": "2", "error": 0, "position": "absolute" },
    { "label": "3", "error": 0, "position": "absolute" },
    { "label": "4", "error": 0, "position": "absolute" },
    { "label": "5", "error": 0, "position": "absolute" },
    { "label": "6", "error": 0, "position": "absolute" },
    { "label": "7", "error": 0, "position": "absolute" }
  ]
}
```

### Screenshot verification

Captured the fixed view with Chrome DevTools:

```text
/tmp/kestrel-route-after.png
```

The screenshot confirmed that the center dots of markers 1–7 sit on the orange route line.

### Quality checks

Ran:

```bash
just web-check
cd web && npm run typecheck
```

Both passed.

## Prevention

Added a gotcha to `docs/MEMORY.md`: do not set `position` on `button.route-marker`; MapLibre marker positioning must be controlled by `.maplibregl-marker { position: absolute; }`.
