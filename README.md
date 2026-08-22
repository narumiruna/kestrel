# 🦅 Kestrel

Kestrel is an Android app that sets your device's location to anywhere in the world — no root required.

Pin a single point, walk a route at a speed you choose, or let Kestrel generate a random walking path.
It uses Android's official mock-location APIs, so it works on a normal, unmodified phone.

- 📍 **Mock a point** — tap the map, paste `lat,lng`, or paste a Google Maps link.
- 🚶 **Play a route** — set waypoints and speed, then walk it Once, on Loop, or Ping-pong.
- 🎲 **Generate a random walk** — pick a waypoint count and step distance.
- ⭐ **Save favorites** — reuse points and routes, sorted by Recent, A–Z, or your own order.
- ☁️ **Optional cloud** — edit routes in a web console and send them to your phone.

---

## 🚀 Get started

### 1. Install

Download the latest `kestrel-<version>-release.apk` from [Releases](https://github.com/narumiruna/kestrel/releases/latest) and install it.

Requires **Android 10 (API 29) or newer**.

### 2. Let Android use Kestrel as the mock location app

1. Open **Settings → About phone** and tap **Build number** seven times to unlock Developer Options.
2. Open **Settings → System → Developer options → Select mock location app**.
3. Choose **Kestrel**.

Without this step Kestrel can preview locations, but it cannot change the system location.

### 3. Turn off Google Location Accuracy (recommended)

Go to **Settings → Location → Location services → Google Location Accuracy** and turn it **off**.

Otherwise Google Play Services may override your mocked position using nearby Wi-Fi and cell towers.

### 4. Mock your first location

1. Open Kestrel and grant the location permissions it asks for on the **Map** tab.
2. Tap anywhere on the map, or tap **Choose target** to enter coordinates or paste a Maps link.
3. Check the teal preview marker — nothing has changed yet.
4. Tap **Mock this point**.

Your device now reports that location. A notification stays in the shade while the mock is running; use it to pause or stop.

---

## 🗺️ Using Kestrel

Kestrel always separates **previewing** from **changing your real location**.
A preview never touches the system location, and cancelling anything is always safe.

- **Routes** — tap several map locations to build a path, or choose **Generate random route**. Review the waypoints, speed, and mode, then tap **Play route**. Pause, Resume, and Stop are available on the map and in the notification.
- **Replacing an active mock** — starting a new mock shows a Current/New comparison first, so you always confirm before switching.
- **Favorites** — save any point or route, filter by All / Points / Routes, and preview a favorite on the map without starting it.
- **Settings** — choose what happens when the app opens, how often route progress is saved, and whether cloud sync and web remote control are enabled.

Full walkthrough: **[Kestrel Android guide](docs/android-app-guide.md)**.

---

## ☁️ Kestrel Cloud (optional)

Kestrel can sync saved places and routes to a self-hosted cloud, and a web console can send a location or route to your phone.

Remote control only works after you sign in on the phone and turn on **Settings → Web remote control**.
Because commands are delivered by polling, Kestrel must be open or already running its mock-location service to receive them.
Undelivered commands expire, and nothing can wake an app that Android has killed.

Route editing, sharing, and device commands are covered in the **[Kestrel Cloud guide](docs/web-cloud-guide.md)**.

---

## ❓ Good to know

**The location does not change.**
Recheck **Developer options → Select mock location app**, and make sure Kestrel has location permission.

**The location keeps snapping back.**
Turn off Google Location Accuracy (step 3 above).

**Some apps still detect the real location.**
Apps protected by Play Integrity or SafetyNet can detect mock locations.
This is system-level behaviour that Kestrel does not try to bypass.

**How it works.**
Kestrel calls `LocationManager.addTestProvider()` and `setTestProviderLocation()` — Android's official mock-location mechanism.
A foreground service keeps the mock alive in the background, advancing along your route once per second.

---

## 🛠️ Development

Kestrel is three workspaces: `app/` (Kotlin, Jetpack Compose, Material 3, MapLibre), `backend/` (Hono, Prisma, PostgreSQL), and `web/` (Next.js, Radix Themes, MapLibre GL).

**Prerequisites:** Android Studio, JDK 26 with `JAVA_HOME` set, the Android SDK on `ANDROID_HOME` or `ANDROID_SDK_ROOT`, and [just](https://github.com/casey/just).

Run `just` to list every recipe.

| Task | Command |
|---|---|
| Build debug APK | `just build` |
| Build → install → launch on a device | `just br` |
| Run Android unit tests | `just test` |
| Validate Compose screenshots | `just android-ui` |
| Format Android + Web | `just format` |
| Check formatting and lint | `just check`, `just lint` |
| Verify every workspace | `just verify` |
| Start / stop the local cloud stack | `just cloud-up`, `just cloud-down` |
| Follow logcat | `just log` |
| Install git hooks | `just hooks` |

`just cloud-up` starts PostgreSQL on `localhost:15432`, the backend API on `http://localhost:3300`, and the web console on `http://localhost:3301`, with `backend/` and `web/` bind-mounted for live reload.
If those ports are taken, copy `.env.example` to `.env` and adjust the `KESTREL_*_PORT` variables.

To run a workspace directly instead:

```bash
just backend-install && cd backend && npm run db:up && npm run prisma:migrate:dev && npm run start:dev
just web-install && cd web && npm run dev
```

Pure-Kotlin tests live in `app/src/test/`; tests needing an Android context go in `app/src/androidTest/`.

### Project layout

```
app/src/main/java/dev/narumi/kestrel/
├── core/
│   ├── data/        # DataStore Preferences, @Serializable schema
│   ├── library/     # Room database and sync models
│   ├── cloud/       # sign-in, sync, devices, remote control
│   ├── location/    # LatLng, Geo, MovementEngine, RouteGenerator,
│   │                #   LocationService, MockProviderManager, CoordParser
│   └── map/         # KestrelMap (MapLibre Compose wrapper), MapStyle
└── feature/         # map, favorites, options — the three main tabs

backend/             # Hono + Prisma cloud backend
web/                 # Next.js cloud console
docs/                # guides, operations, security, API
```

### CI and releases

`.github/workflows/ci.yml` runs `android`, `backend`, and `web` lanes, gated by `dorny/paths-filter` so a PR touching one workspace skips the others.
Pushes to `main` always run all three.

Version bumps, tagging, and signed release builds are automated by the `bump-version`, `tag-release`, and `release` workflows.
`just release` builds a signed APK locally and requires the four `KESTREL_RELEASE_*` variables documented in [docs/operations.md](docs/operations.md).

Contributor conventions live in [AGENTS.md](AGENTS.md).

---

## 📄 License

[GNU Affero General Public License v3.0](LICENSE)
