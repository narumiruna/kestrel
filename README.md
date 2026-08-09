# 🦅 Kestrel

Kestrel is an Android mock GPS app that lets you pin the system location to any point on the globe, simulate walking along a route, or generate random walking paths — all without root access.

Built with **Kotlin**, **Jetpack Compose**, **Material 3**, and **MapLibre**. Kestrel uses Android's official mock location APIs and is designed for development, testing, and personal location-simulation workflows.

---

## ✨ Features

| Feature | Description |
|---|---|
| 📍 **Single-point mock** | Tap the map or paste a `lat,lng` coordinate / Google Maps URL to lock the system location to that point. |
| 🚶 **Route playback** | Define waypoints, set speed (km/h), and let the engine walk the path automatically. Supports **Once / Loop / PingPong** playback modes. |
| 🎲 **Random route generation** | Enter a waypoint count and step distance; Kestrel generates a smooth random walk from the current map centre. |
| ⭐ **Favorites** | Save single points or full routes. Sort by **Recent / Alphabetical / Manual** order. |
| 🔄 **App opening behaviour** | Return to the last map view, center on the device, or use a saved Favorite with an explicit preview of its launch effect. |

---

## 📋 Requirements

- Android 10+ (API 29+)
- **Developer Options → Select mock location app → Kestrel**
- *(Recommended)* Settings → Location → Location Services → **Google Location Accuracy** → Off

  Disabling Google Location Accuracy prevents Google Play Services from overriding the mocked position with Wi-Fi / cell-tower fusion.

---

## ▶️ Android workflow

Kestrel separates previewing from changing the system location:

1. On **Map**, tap a location or choose **Choose target** to enter coordinates, paste a supported Maps URL, or select a Favorite.
2. Review the point or route Preview.
3. Choose **Mock this point** or **Play route**. If another mock is active, confirm the Current/New comparison before replacement.
4. Use **Favorites** to reuse saved points and routes, and **Settings** to change app opening, route recovery, cloud sync, and Web remote control.

Cancelling a preview, editor, confirmation, or settings draft has no side effects. See the complete [Kestrel Android guide](docs/android-app-guide.md) for route generation, exact startup behavior, errors, accessibility, cloud conflicts, and remote-control safeguards.

## ⚙️ How It Works

Kestrel uses the Android platform APIs `LocationManager.addTestProvider()` and `setTestProviderLocation()` — the official mock location mechanism. No root or system modification is required.

A **foreground service** (type `location`) keeps the mock alive while the UI is in the background. Movement is driven by a 1 Hz tick that advances `MovementEngine` along the route and pushes each sample through `MockProviderManager`.

The web console can remote-control an Android device only after the Android app is signed in and the user confirms **Settings → Web remote control**. First-version remote control uses the cloud command queue plus Android polling: Kestrel must be open in the foreground or already running its mock-location foreground service to receive commands. Commands expire after a bounded window if they are not delivered, and neither the web console, Google services, nor the backend can wake an app process that Android has killed.

> ⚠️ **Note:** Apps protected by Play Integrity or SafetyNet can still detect mock locations — this is a system-level behaviour that Kestrel does not attempt to bypass.

---

## 🗂️ Project Structure

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
    ├── options/     # Settings workflows and cloud/remote-control state
    ├── routes/
    ├── tracks/
    └── settings/

backend/             # NestJS + Prisma cloud platform backend
web/                 # Next.js cloud console
```

---

## 🛠️ Development

> **Prerequisites:** Android Studio, JDK 26 with `JAVA_HOME` configured, and the Android SDK available through `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or the default macOS location.
> All common tasks are driven by the [`justfile`](justfile) — install [just](https://github.com/casey/just) to use them. Run bare `just` or `just help` to see the grouped, non-destructive command list.

| Task | Command |
|---|---|
| Show available recipes | `just` or `just help` |
| Build debug APK | `just android-build` (or `just build`) |
| Build release APK | `just release` |
| Build → install → launch on a selected device | `just br` |
| Run Android unit tests | `just android-test` (or `just test`) |
| Validate Android UI screenshots | `just android-ui` |
| Update Android UI screenshots | `just android-ui-update` (requires confirmation) |
| Install exact Backend / Web dependencies | `just backend-install`, `just web-install` |
| Verify Backend / Web | `just backend-check`, `just web-verify` |
| Verify every workspace | `just verify` |
| Auto-format Android + Web | `just format` |
| Check Android + Web formatting/lint | `just check`, `just lint` |
| Regenerate Detekt baseline | `just lint-baseline` (requires confirmation) |
| Install git hooks (prek) | `just hooks` |
| Reset app data permanently | `just reset` (requires confirmation) |
| Follow logcat | `just log` |
| Start / stop the dev stack | `just cloud-up`, `just cloud-down` |

### 🧪 Unit tests

Pure-Kotlin tests (no Android context needed) live in `app/src/test/`. Tests that require an Android context go in `app/src/androidTest/`.

```bash
just test
```

### ☁️ Cloud platform backend

The NestJS + Prisma backend lives in `backend/`.

```bash
just backend-install
cd backend
npm run db:up
npm run prisma:migrate:dev
npm run start:dev
```

### 🌐 Web console

The Next.js cloud console lives in `web/` and proxies `/api/backend/*` to the NestJS API.

```bash
just web-install
cd web
npm run dev
```

Open `http://localhost:3301`. Set `KESTREL_API_BASE_URL` if the API is not running on `http://localhost:3300`.

### 🐳 Docker Compose stack

To run PostgreSQL, the NestJS backend, and the Next.js web console together:

```bash
just cloud-up   # or: docker compose -f compose.dev.yaml --profile watch up --build
```

| Service | Address |
|---|---|
| PostgreSQL | `localhost:15432` |
| Backend API | `http://localhost:3300` |
| Web console | `http://localhost:3301` |

The Compose file uses development defaults and bind-mounts `backend/` and `web/` for live reload.
If those ports are already taken, copy `.env.example` to `.env` and adjust the `KESTREL_*_PORT` variables.
Use `just cloud-down` to stop the stack.

---

## 🤖 Continuous Integration

`.github/workflows/ci.yml` runs three lanes on every PR and push to `main`:

| Lane | What it runs | Triggers on |
|---|---|---|
| `android` | `spotlessCheck`, `detekt`, `:app:assembleDebug`, unit tests (non-blocking), uploads `app-debug.apk` artifact | changes under `app/`, top-level Gradle files, `detekt*`, `justfile`, or `.github/workflows/**` |
| `backend` | `npm ci`, `prisma generate`, `lint`, `test`, `test:e2e`, `typecheck`, `build` | changes under `backend/` or `.github/workflows/**` |
| `web` | `npm ci`, `lint`, `typecheck`, `build` | changes under `web/` or `.github/workflows/**` |

A leading `changes` job uses `dorny/paths-filter` to gate each lane, so a PR touching only one workspace skips the others. Push events to `main` always run all three.

## 🚀 Releases

- `just release` requires the four `KESTREL_RELEASE_*` signing environment variables documented in `docs/operations.md`, runs `:app:assembleRelease`, and produces `app/build/outputs/apk/release/app-release.apk`. The build fails rather than producing an unsigned artifact when signing is not configured.
- `.github/workflows/bump-version.yml` takes a `major` / `minor` / `patch` choice, calls `scripts/bump-version.py`, and bumps the shared Android/backend/web version plus Android `appVersionCode`, then opens a PR using repository secret `PAT_TOKEN` so the resulting PR can trigger downstream CI workflows.
- `.github/workflows/tag-release.yml` watches version-file merges to `main`, resolves the shared Android/backend/web version, and pushes the matching `v*` tag with `PAT_TOKEN` if it does not already exist.
- `.github/workflows/release.yml` decodes the protected release keystore, builds and verifies a signed APK, then publishes a GitHub Release when a matching `v*` tag is pushed (or when manually dispatched against an existing tag).

---

## 🔐 Permissions

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.INTERNET"/> <!-- map tile downloads -->
```

`ACCESS_MOCK_LOCATION` is declared in the manifest (required for the app to appear in the Developer Options mock-location picker) but has no runtime effect since Android 6.

---

## 📄 License

[GNU Affero General Public License v3.0](LICENSE)
