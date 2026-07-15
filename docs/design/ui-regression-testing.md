# UI regression testing decision

## Decision

Use the official Compose Preview Screenshot Testing plugin `0.0.1-alpha15` for Android and Playwright with axe-core for Web.

## Why

- The official Android tool is host-side, uses the existing `@Preview` model, does not install or clear an app on a physical device, and supports AGP 9+, Kotlin 2.2.10+, and JDK 17+. Kestrel uses AGP 9.2.1, Kotlin 2.4, and Java 26.
- The spike generated and validated seven deterministic Android references in under 60 seconds with `updateDebugScreenshotTest` / `validateDebugScreenshotTest`.
- Playwright can validate responsive geometry, keyboard/dialog behavior, accessibility, and screenshots in one browser harness. Map tiles/WebGL are not deterministic, so the mobile Map workspace masks `.cartographer-map-layer`, while desktop baselines capture the editor panel; interaction and overflow assertions still exercise the real MapLibre workspace.

## Android coverage

References live under `app/src/screenshotTestDebug/reference/` and cover:

- setup prerequisite at 320dp with large text;
- idle and route-playing Map sheets, including dark mode;
- Favorites empty and populated rows;
- Options collapsed and expanded states, including large text/dark mode.

`just android-ui` verifies references. `just android-ui-update` intentionally updates them and requires diff review.

## Web coverage

Playwright references live beside `web/tests/ui/ui-regression.spec.ts`. Projects cover `390×844`, `1200×792`, light, and dark. Additional assertions exercise 320px, 1024px, 1440px, dense 55-row data, 200%-equivalent text, RTL, public Share, no horizontal overflow, action geometry, Map/Choose/Edit, and axe-core.

The browser-test stack is isolated under the `kestrel-webtest` Compose project and seeded development account. Share links created by the test are disabled before completion. The stack never targets the deploy Compose project.

## Stability controls

- Animations are disabled for screenshot comparison.
- Dynamic last-updated text, generated public URLs, and the MapLibre map layer are masked.
- Fixtures use seeded deterministic library data.
- Web projects run with one worker to respect authentication rate limits and avoid refresh-token rotation races.
- Screenshot failures retain trace, actual image, diff, and HTML report artifacts.

## Safety

No connected Android instrumentation is part of the default UI regression commands. Any future physical-device test must be called out as destructive-risk work and requires explicit approval plus an app-private data backup.
