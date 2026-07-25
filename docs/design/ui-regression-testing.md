# UI regression testing decision

## Decision

Do not commit screenshot baselines or any other image binary. Validate Android and Web UI with structural or semantic tests where practical, then use Chrome DevTools or Android Studio previews for visual review. Store every captured image outside the repository and delete it when the review is complete.

## Why

- Kestrel's repository policy forbids image binaries in the working tree and in every reachable Git commit.
- Committed screenshot baselines make history rewrites necessary whenever the binary-retention policy changes and cannot be meaningfully reviewed as text.
- Structural assertions, unit tests, type checks, builds, and accessibility semantics provide durable automated evidence without binary artifacts.
- Chrome DevTools remains the source of truth for browser interaction and visual review; Kestrel Web does not maintain Playwright tests or committed browser screenshots.

## Android coverage

Use Compose previews for bounded visual inspection without saving references. Keep state and behavior coverage in pure Kotlin tests under `app/src/test/` whenever Android Context is not required. Any physical-device or connected instrumentation test remains destructive-risk work and requires explicit approval plus an app-private data backup.

The retired Compose Preview Screenshot Testing plugin, `app/src/screenshotTest/`, committed references, and `android-ui` recipes must not be restored while the no-image-binary policy is active.

## Web coverage

Use `just webtest-up` to start the isolated seeded browser-review stack at `http://127.0.0.1:3401`. Review authentication, Library, Map, sharing, remote control, account security, keyboard/focus behavior, error recovery, accessibility semantics, and horizontal overflow with Chrome DevTools.

Put temporary captures under an OS temporary directory such as `/tmp`, never under the repository. Do not use Playwright or commit browser screenshots.

## Quality gates

- Android: formatting, Detekt, JVM unit tests, and debug APK build.
- Web: Biome formatting/lint, TypeScript typecheck, production build, and explicit Chrome DevTools review when UI behavior changes.
- Repository policy: `scripts/check-no-image-binaries.sh` checks the staged diff, tracked tree, and pushed commit range by both path extension and blob MIME.

No quality gate may generate or stage an image binary inside the repository.
