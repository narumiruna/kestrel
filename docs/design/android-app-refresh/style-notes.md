# Android app visual refresh notes

## Visual direction

Goal-mode implementation selected a conservative refresh direction without waiting for another style round-trip:

- **Calm** — soft mist / slate surfaces, low-noise cards, readable helper text.
- **Map-first** — map stays the primary canvas; controls sit in lightweight, grouped surfaces.
- **Crisp** — stronger title/label weights, clearer selected states, one-line action labels.

## Baseline audit targets

### Map

- Bottom sheet status, primary action, draft route actions, and route settings were visually close together.
- Secondary actions used fixed rows that could squeeze labels on narrow screens.
- Permission / mock-location banner actions needed button-level wrapping.
- Map did not show a persistent lightweight hint for tap / long-press gestures once permissions were OK.

### Favorites

- Page lacked a subtitle explaining the library purpose.
- List rows put `Apply` and overflow actions on the same line as item text, reducing room for long names.
- Empty state was sparse and did not share a reusable app treatment.
- Delete was a single menu click with no confirmation.

### Options

- Settings titles lived outside cards, producing a less cohesive settings stack.
- Cloud / playback / random route actions used fixed rows in several places.
- Helper text and settings rows had inconsistent hierarchy.
- The signed-in cloud action row needed to preserve horizontal labels on narrow widths.

## Implemented polish

- Added shared UI primitives in `app/src/main/java/dev/narumi/kestrel/ui/components/KestrelComponents.kt`:
  - `KestrelScreenHeader`
  - `KestrelSectionHeader`
  - `KestrelCard`
  - `KestrelEmptyState`
  - `KestrelActionRow`
- Refreshed palette and typography in `ui/theme/Color.kt`, `Theme.kt`, and `Type.kt`.
- Updated app shell colors in `MainActivity.kt` so navigation and content share the refreshed surface hierarchy.
- Reworked Map sheet into grouped cards and moved polish-only helpers into `MapPolishComponents.kt` to keep `MapScreen.kt` within detekt limits.
- Added a lightweight map hint pill and wrapped permission / route action rows by button.
- Reworked Favorites with a screen header, carded rows, wrapped actions, richer empty state, and delete confirmation.
- Reworked Options into carded sections with subtitles and wrapped action rows.

## Visual artifacts

The connected Android device was initially available over adb but locked behind the system keyguard during this run. `adb shell wm dismiss-keyguard` did not dismiss it, so real device screenshots could not be captured without user interaction. A later retry restarted adb, but no devices/emulators were attached. To keep the plan verifiable in-repo, source-based before / after visual snapshot SVGs were saved here:

| Screen | Before | After |
|---|---|---|
| Map | `before-map.svg` | `after-map.svg` |
| Favorites | `before-favorites.svg` | `after-favorites.svg` |
| Options | `before-options.svg` | `after-options.svg` |

Runtime evidence still came from a non-destructive debug install / launch (`just br`) and logcat review: the refreshed app installed, `MainActivity` was resumed, and no `AndroidRuntime` / `FATAL` crash appeared in the filtered launch logs.

## Verification log

- `just format` — passed after code changes.
- `just lint` — passed after splitting Map polish helpers out of `MapScreen.kt`.
- `just br` — passed; debug APK built, installed with `adb install -r`, force-stopped, and relaunched without clearing app data.
- `adb shell dumpsys activity activities` — showed `dev.narumi.kestrel/.MainActivity` as resumed / focused app behind keyguard during the first device attempt.
- `adb logcat -d -t 400 | rg -i "AndroidRuntime|FATAL|dev\\.narumi\\.kestrel|MapLibre|LocationService"` — showed launch / MapLibre logs and no crash lines during the first device attempt.
- Retry evidence: `adb kill-server && adb start-server && adb devices -l` returned no attached devices/emulators, so the screenshot fallback remains the in-repo SVG artifact set.
