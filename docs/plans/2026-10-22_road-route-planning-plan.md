# Road Route Planning

Status: Proposed. This plan authorizes no implementation, external service signup, paid request, database operation, deployment, or device action.

## Goal

Extend the Map route assistant with verified place search and road-following route geometry. Let the user review destinations, path, distance, and limitations before applying the route to the existing draft.

## Dependencies and Context

- Depends on [Personal AI provider settings](2026-10-22_personal-ai-provider-settings-plan.md) and [Route assistant drafts](2026-10-22_route-assistant-drafts-plan.md). Keep the same personal AI account, restricted agent, proposal validation, preview, Apply, Undo, and manual Save contracts.
- Current `RouteMapEditor.tsx` connects stored coordinates directly; `backend/src/library/library.validation.ts` permits 2–1000 points. There is no current road routing or place-name search service.
- Persisted waypoints contain coordinates and optional speed/pause, not routing anchors, maneuvers, names, or provider provenance. Existing Android playback and cloud sync consume the ordered waypoint path.
- MapLibre remains the only map renderer. A routing engine is a route-data service, not a replacement map backend.
- AI inference costs remain user-owned. Routing/search costs and service credentials are separate; no platform-funded service or shared AI billing is approved by this plan.

## Service Selection Gate

Select one routing service and one geocoding/POI search service before implementation. They may come from the same supplier. Do not build interchangeable adapters for hypothetical future services.

Compare concrete candidates using target-region coverage, supported travel profiles, routing/search license, attribution, hosted versus self-hosted operation, position-data retention, quotas, point/body limits, latency, cancellation, and cost ownership. OSRM, Valhalla, and GraphHopper are routing candidates, not preselected dependencies.

Record the chosen deployment, supported profiles, service credentials, and payer, with user acceptance. Public demonstration endpoints and public search endpoints are not production capacity. Do not sign up, deploy, download a road dataset, or incur charges without separate permission.

Distance-constrained loops require either a verified round-trip capability or a bounded search algorithm. Include this capability in selection; do not promise a 5 km loop from a simple A-to-B routing API.

## Architecture

```mermaid
flowchart LR
    Request["User request and selected map context"] --> Agent["Existing restricted route assistant"]
    Agent --> Search["Bounded geocoding / POI search"]
    Search --> Choice["User resolves ambiguous destinations"]
    Choice --> Routing["Chosen routing service"]
    Routing --> Validate["Validate and bound geometry"]
    Validate --> Proposal["Existing route proposal and preview"]
    Proposal --> Apply["Explicit Apply to draft"]
    Apply --> Save["Existing manual Save and sync"]
```

### Geographic input and tools

- Expose bounded search and routing tools in Backend only. Use fixed approved endpoints and server-owned credentials; model/user inputs cannot select hosts, ports, headers, or network paths.
- Search accepts bounded query text, the explicit locale, and user-approved geographic context. Do not automatically send all Places, device location, or a user's library.
- Return bounded candidate IDs, display names, coordinates, and source information. Treat source text as untrusted data, not agent instructions.
- Resolve multiple plausible destinations through explicit user selection. Do not silently select the first search result or infer coordinates from a model's memory.
- Route requests use resolved coordinates and an explicitly supported travel profile. Show requested and snapped start/end positions plus any material displacement; require confirmation above the recorded snap threshold.
- Routing results are data, not permission to save, publish, or send a command to a device.

### Geometry and compatibility

- Normalize service geometry to Kestrel latitude/longitude fields with explicit GeoJSON longitude/latitude conversion at the renderer boundary. Validate finite coordinates, ordering, endpoints, coverage, disconnected legs, and response size.
- Keep user-selected route anchors separate from generated shape points while reviewing a proposal. Do not assign pause/speed events to every intermediate shape point.
- Preserve retained anchor metadata at the correct path positions; generated shape points have null speed/pause. If an anchor cannot be mapped safely, reject the proposal instead of dropping its event.
- Accept no more than 1000 final waypoints. First test representative geometry; if simplification is required, use a measured geographic algorithm that preserves anchors, endpoints, and metadata.
- Before implementation, record numeric maximum geometry deviation, distance error, snap distance, response size, request duration, and loop-search limits. Tests must enforce these values; do not use unbounded or merely “acceptable” tolerances.
- If geometry cannot meet both the point limit and error limits, report the limit and request a shorter/simpler route. Never silently truncate or increase the existing cross-platform limit.
- Use one approved final geometry for preview, distance, Apply, Save, sync, and Android playback. Distinguish a service's estimate from the distance of the path that Kestrel will actually store.
- Show service source/attribution and warnings in the proposal. Keep attribution visible after Apply where the selected license requires it; resolve any stored attribution requirement before service approval.
- Editing accepted waypoints keeps existing direct-segment semantics. Do not claim continuing road snapping, turn-by-turn navigation, live traffic accuracy, or route safety after manual edits.

### Bounded route tasks

- Support named start/end points and ordered via points through search, disambiguation, and routing.
- Support “about N km” loops only within a published numeric tolerance and fixed search budget. Report actual distance, profile, and routing limitations.
- Reuse cancellation, user ownership, settings generation, stale-proposal rejection, and manual Apply from stage 2. Service failure cannot trigger a guessed straight-line route labeled as road-following.

## Non-Goals

- No second map renderer, route recording, GPX/KML, turn-by-turn navigation, traffic service, offline road dataset delivery, or automatic device playback.
- No multi-provider routing framework, arbitrary network tool, autonomous POI itinerary browsing, multiple alternative-route dashboard, or general Library address search.
- No route-schema expansion by assumption. If a selected service requires stored attribution or geometry beyond the existing contract, resolve and record that exact requirement here before implementation rather than hiding it in a later plan.

## Plan

- [ ] Complete the service-selection gate with official license/terms evidence, target-region fixtures, supported profiles, cost ownership, and explicit user acceptance; record any account, infrastructure, or external-write prerequisite as blocked until approved.
- [ ] Verify required A-to-B, via-point, and approximate-loop capabilities with recorded public examples or approved bounded requests. Set numeric geometry/snap/distance tolerances and resource budgets from those results before implementing adapters.
- [ ] Review the existing route JSON, sync, saved revision, and Android playback contracts against chosen geometry and attribution requirements. Prove compatibility or define the smallest necessary migration and cross-platform changes in this plan before coding.
- [ ] Implement the one selected search and routing integration with typed responses, fixed endpoints, bounded inputs/results, timeout/abort, quotas, and safe error mapping; test redirects, malformed/oversized responses, private-network targets, throttling, outage, and unsupported profiles using fixtures.
- [ ] Add search/disambiguation tools and candidate selection within the existing assistant; test duplicate names, different regions, locale, no results, user cancellation, and stale selections. Do not create a second search/editor workflow.
- [ ] Validate coordinate conversion, ordered legs, snapped endpoints, and route coverage; test reversed coordinates, invalid numbers, disconnected legs, unreachable destinations, excessive snapping, and out-of-coverage requests.
- [ ] Implement only the geometry reduction proven necessary by the point-limit gate; test retained anchors and speed/pause, sharp bends, duplicate points, loops, 1000-point boundaries, long routes, and date-line coordinates against the recorded numeric error limits.
- [ ] Implement bounded approximate-distance loop planning using the chosen service capability or the accepted bounded algorithm; test achievable targets, targets outside tolerance, dead ends, unreachable vias, cancellation, and exhausted request budgets.
- [ ] Extend the existing proposal summary with resolved destinations, profile, requested/actual distance, geometry point count, source attribution, snapping, and warnings. Show the exact final geometry on the existing MapLibre preview layer.
- [ ] Verify one-step Apply/Undo, stale-result rejection, route switch, connection/settings change, manual edits, and save/reload. Prove that no failure or partial response changes the draft or sends a device command.
- [ ] Verify saved geometry through Backend revision mapping and sync fixtures and the relevant Android JVM playback tests; preserve sequence, modes, distance behavior, and waypoint events. Any real device or connected instrumentation requires explicit consent and data-risk disclosure.
- [ ] Update `docs/web-cloud-guide.md`, necessary API/operations documentation, and all current Web locale catalogs with provider disclosure, service attribution, supported profiles/regions, costs, point/error limits, loops, and manual-edit semantics.
- [ ] Use Chrome DevTools at 1440×900 light mode for ambiguous search, candidate preview, long geometry, loop tolerance failure, outage, cancellation, attribution, and Apply/Undo. Keep captures outside Git; live service and device checks remain blocked without approval.
- [ ] Run Web formatting/lint/tests/typecheck/build, `just i18n-check`, Backend lint/unit/e2e/typecheck/build, and `git diff --check` separately, each within 180 seconds; split longer checks into observable steps. If Android code/contracts change, also run the narrow affected JVM tests and `just android-test`, plus the affected Android format/lint/build checks. Schema changes require a new reviewable migration and `npm run prisma:generate`.

## Risks

- A mathematically close polyline can still cut a corner, cross a barrier, or place an anchor on the wrong road. Anchor preservation and numeric tests do not establish real-world safety; do not market this as navigation.
- Search/routing providers receive exact request positions. Document this separately from the user's selected AI provider; omit query strings, prompts, bodies, and geometry from logs and telemetry.
- Approximate loops may not exist for a requested distance/profile. Stop at the fixed budget and report failure rather than hiding excess calls or claiming success outside tolerance.
- Service terms, data retention, billing, attribution, and permitted caching are deployment constraints, not optional follow-up documentation.

## Rollback / Recovery

- Stop new search/routing requests and remove their agent tools; retain stage 2's coordinate/Places editing and stage 1's personal AI settings.
- Cancel in-flight requests and clear only unaccepted road proposals. Keep manual drafts and saved routes unchanged; saved geometry must remain usable without contacting the routing service.
- Do not delete routes, remove required attribution, restore a database, or roll back schema automatically. If a migration is required, document the reviewed rollback compatibility and obtain separate operational approval.
- Service credentials, infrastructure shutdown, account cancellation, and production changes require explicit authorization.

## Completion Checklist

- [ ] The user-approved search/routing deployment, billing, profiles, region, license, attribution, and numeric limits are documented and verified.
- [ ] Named destinations require verified search results; ambiguous names require selection, and no route uses model-invented location data.
- [ ] A-to-B, via-point, and approximate-loop tasks pass their declared success/failure and budget tests.
- [ ] Final paths contain 2–1000 valid points and meet error limits while preserving anchors and waypoint events.
- [ ] Preview, stored revision, sync, and relevant Android playback tests use the same final geometry and event order.
- [ ] Attribution, privacy, failure, cancellation, stale-result, and manual-edit behavior pass automated and Chrome checks.
- [ ] Required approved live evidence is present, or the corresponding item remains open. Archive only after every completion item has evidence; do not move unfinished scope elsewhere.
