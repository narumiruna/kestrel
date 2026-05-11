## GOTCHA

- `just reset` runs `pm shell pm clear dev.narumi.kestrel`, which wipes favorites / prefs / mock state with no undo and no automatic Auto-Backup restore (backup rules are empty includes). Never put it in a smoke-test setup; only run it when the operator has explicitly agreed to lose data. To preserve state, back up `files/datastore/kestrel_prefs.preferences_pb` via `adb shell run-as` first.
- `LocationService.runtimeState: StateFlow<RuntimeState>` is the source of truth for whether a mock (Single / Route) is running and which waypoints / speed / mode / paused are active. Any UI that needs to know "is a route playing right now?" must collect this flow; do not re-derive it from local Compose `remember` values. The flow is emitted only on real transitions, never per-tick, so it is safe for recomposition. `paused` does not survive process death (lives only in service memory); a restored route always comes back unpaused.
- `LocationService` persists in-progress route `progressMeters` + PingPong `forward` into `MockState.route` every 5 s (plus on pause/resume/stop/finish/onDestroy), so a kill rolls a route back by at most ~5 s of motion rather than to the first waypoint. If you ever drop TICK_MILLIS below 1 s, switch the cadence from a tick counter to wall time.
- Deploy must not use the dev Compose stack. `compose.yaml` bind-mounts source and runs `next dev`/`nest start --watch`; this can leave root-owned `.next` files on the host and serve non-production dev assets. Use `compose.deploy.yaml` for GitHub Actions deploys.
- Next rewrites in `next.config.ts` bake the backend URL at `next build`; deploy images built without `KESTREL_API_BASE_URL` proxy to `localhost:3300`. Use the runtime `/api/backend/[...path]` route proxy instead.

## TASTE

- Keep local Docker Compose optimized for live reload, but keep deploy Compose production-only: no source bind mounts, built images, `next start`, and Nest `start:prod` after Prisma migrations.
