# UI regression testing decision

## Decision

Use the official Compose Preview Screenshot Testing plugin `0.0.1-alpha15` for Android. During the Kestrel Web PoC phase, use Chrome DevTools for browser validation at one presentation target only: `1440×900` wide-screen desktop in light mode.

## Why

- The official Android tool is host-side, uses the existing `@Preview` model, does not install or clear an app on a physical device, and supports AGP 9+, Kotlin 2.2.10+, and JDK 17+. Kestrel uses AGP 9.2.1, Kotlin 2.4, and Java 26.
- The spike generated and validated seven deterministic Android references in under 60 seconds with `updateDebugScreenshotTest` / `validateDebugScreenshotTest`.
- One Web target keeps PoC feedback fast. Chrome DevTools is the source of truth for visual and interaction review; Kestrel Web does not maintain Playwright tests or browser screenshot baselines.

## Android coverage

References live under `app/src/screenshotTestDebug/reference/` and cover:

- setup prerequisite at 320dp with large text;
- idle and route-playing Map sheets, including dark mode;
- Favorites empty and populated rows;
- Options collapsed and expanded states, including large text/dark mode.

`just android-ui` verifies references. `just android-ui-update` intentionally updates them and requires diff review.

## Web coverage

Use `just webtest-up` to start the isolated seeded browser-review stack at `http://127.0.0.1:3401`. Review authentication, Library, Map, sharing, remote control, account security, keyboard/focus behavior, error recovery, accessibility semantics, and horizontal overflow in Chrome DevTools at `1440×900` with light mode.

Do not add mobile, tablet, dark-mode, compact, zoom, or RTL matrices during the PoC unless explicitly requested. Do not commit browser screenshots or other binary evidence.

## Quality gates

Web CI runs formatting/lint, TypeScript typecheck, and the production build. Browser acceptance remains an explicit Chrome DevTools review rather than automated Playwright execution.

## Safety

No connected Android instrumentation is part of the default UI regression commands. Any future physical-device test must be called out as destructive-risk work and requires explicit approval plus an app-private data backup.
