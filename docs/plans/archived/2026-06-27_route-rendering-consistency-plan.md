## Goal

Fix route editor rendering so the selected route's polyline, waypoint markers, and summary all use the same waypoint sequence after route load and route switching.

## Context

PR #175 only reduced dense label overlap and clarified straight-segment copy. The reported issue is still a rendering consistency bug: for a reported 30-waypoint route, the summary and map markers can disagree while markers appear spread far from the visible polyline.

Root cause found in `RouteMapEditor`: after initial map load, `map.isStyleLoaded()` can be false while raster tiles are still loading even though the route source/layer already exists. The waypoint effect then registered `map.once('load', update)`, but `load` had already fired, so marker/line sync was dropped while `fitWaypoints()` still moved the viewport to the new route.

## Plan

- [x] Reproduce with browser screenshots and runtime metrics for a reported 30-waypoint route; verified `/tmp/kestrel-switch-current/first.png` and `/tmp/kestrel-switch-current/metrics.json` where a selected 30-waypoint route summary showed 30 waypoints but DOM markers stayed at 12.
- [x] Trace route selection data flow in `routes/page.tsx` and `RouteMapEditor.tsx`; verified stale route rendering can survive route switches when the waypoint effect waits for already-fired `load`.
- [x] Apply the smallest root-cause fix so marker sync runs when the route source already exists, and otherwise waits for `style.load`; verified by `web/components/RouteMapEditor.tsx` diff.
- [x] Switch between multiple routes in the browser and verify old markers/labels disappear and the new marker count matches the selected route summary; verified `/tmp/kestrel-switch-after/metrics.json` shows 30 markers for both 30-waypoint test routes after switching.
- [x] Run `just web-check` and update a follow-up PR branch with the fix.

## Completion Checklist

- [x] Reported-route browser metrics show selected route, route summary, and marker count all equal 30 in `/tmp/kestrel-switch-after/metrics.json`.
- [x] Route line and markers are synced from the same `waypoints` array by `syncLineLayer(map, waypoints)` and `syncMarkers(..., waypoints)` in the same update callback.
- [x] Route switching browser metrics show no stale marker count from the previous route: before fix 12/30 mismatch, after fix 30/30 in `/tmp/kestrel-switch-after/metrics.json`.
- [x] Visual screenshot `/tmp/kestrel-switch-after/second.png` shows the reported route's pins around the selected route line, not stale pins from the prior route.
- [x] `just web-check` passes.
