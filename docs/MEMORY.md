## GOTCHA

- `LocationService` persists in-progress route `progressMeters` + PingPong `forward` into `MockState.route` every 5 s (plus on pause/resume/stop/finish/onDestroy), so a kill rolls a route back by at most ~5 s of motion rather than to the first waypoint. If you ever drop TICK_MILLIS below 1 s, switch the cadence from a tick counter to wall time.
- Deploy must not use the dev Compose stack. `compose.yaml` bind-mounts source and runs `next dev`/`nest start --watch`; this can leave root-owned `.next` files on the host and serve non-production dev assets. Use `compose.deploy.yaml` for GitHub Actions deploys.
- Next rewrites in `next.config.ts` bake the backend URL at `next build`; deploy images built without `KESTREL_API_BASE_URL` proxy to `localhost:3300`. Use the runtime `/api/backend/[...path]` route proxy instead.

## TASTE

- Keep local Docker Compose optimized for live reload, but keep deploy Compose production-only: no source bind mounts, built images, `next start`, and Nest `start:prod` after Prisma migrations.
