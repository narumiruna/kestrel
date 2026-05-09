# Kestrel

Android mock GPS app — lock your device location to any coordinate, play back a route automatically, or generate a random walking path.

Built with **Kotlin · Jetpack Compose · Material 3 · MapLibre Native**. No root required.

---

## Features

| # | Feature | Description |
|---|---|---|
| F1 | **Single-point mock** | Tap the map or paste `lat,lng` / a Google Maps URL to pin the system location to that point. |
| F2 | **Route playback** | Define waypoints, set speed (km/h), and let the engine walk the path automatically. Supports Once / Loop / PingPong modes. |
| F3 | **Random route generation** | Input a waypoint count and step distance; the app generates a smooth random walk from the current map centre. |
| — | **Favorites** | Save single points or full routes. Three sort modes: Recent / Alphabetical / Manual. |
| — | **Startup behaviour** | Resume the last mock state, stay at current location, or apply a saved favourite on every launch. |

---

## Requirements

- Android 10+ (API 29)
- Developer Options → **Select mock location app** → Kestrel
- *(Recommended)* Settings → Location → Location Services → **Google Location Accuracy** → Off
  (Disabling this prevents Google Play Services from overriding the mocked position with Wi-Fi / cell fusion.)

---

## How It Works

Kestrel uses the Android platform API `LocationManager.addTestProvider()` / `setTestProviderLocation()` — the official mock location mechanism. No root or system modification is required.

A **foreground service** (type `location`) keeps the mock alive while the UI is in the background. Movement is driven by a 1 Hz tick that advances `MovementEngine` along the route and pushes each sample through `MockProviderManager`.

> **Note:** Apps protected by Play Integrity or SafetyNet can still detect mock locations — this is a system-level behaviour that Kestrel does not attempt to bypass.

---

## Project Structure

```
app/src/main/java/dev/narumi/kestrel/
├── core/
│   ├── data/        # DataStore Preferences, @Serializable schema
│   ├── location/    # LatLng, Geo, MovementEngine, RouteGenerator,
│   │                #   LocationService, MockProviderManager, CoordParser
│   └── map/         # KestrelMap (MapLibre Compose wrapper), MapStyle
└── feature/
    ├── map/         # Main screen with map and bottom sheet
    ├── favorites/   # Saved points and routes list
    ├── options/     # Startup behaviour settings
    ├── routes/
    ├── tracks/
    └── settings/
```

---

## Development

> Prerequisites: Android Studio, JDK (bundled with Android Studio), `adb` on `PATH`.  
> All common tasks are in the [`justfile`](justfile) — install [just](https://github.com/casey/just) to use them.

| Task | Command |
|---|---|
| Build debug APK | `just build` |
| Build → install → launch | `just` (or `just br`) |
| Auto-format (Spotless + ktlint) | `just format` |
| Verify formatting (no writes) | `just check` |
| Detekt static analysis | `just lint` |
| Regenerate Detekt baseline | `just lint-baseline` |
| Install git hooks (prek) | `just hooks` |
| Reset app data | `just reset` |
| Follow logcat | `just log` |

### Unit tests

```bash
# macOS example — adjust to match your Android Studio installation
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  ./gradlew :app:testDebugUnitTest
```

Pure-Kotlin tests (no Android context needed) live in `app/src/test/`. Tests that require an Android context go in `app/src/androidTest/`.

---

## Permissions

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.INTERNET"/> <!-- tile downloads -->
```

`ACCESS_MOCK_LOCATION` is declared in the manifest (required for the app to appear in the Developer Options mock location picker) but has no runtime effect since Android 6.

---

## License

This project does not currently include a license file. All rights reserved unless otherwise stated.
