## GOTCHA

- Deploy must not use the dev Compose stack. `compose.yaml` bind-mounts source and runs `next dev`/`nest start --watch`; this can leave root-owned `.next` files on the host and serve non-production dev assets. Use `compose.deploy.yaml` for GitHub Actions deploys.
- Next rewrites in `next.config.ts` bake the backend URL at `next build`; deploy images built without `KESTREL_API_BASE_URL` proxy to `localhost:3300`. Use the runtime `/api/backend/[...path]` route proxy instead.

## TASTE

- Keep local Docker Compose optimized for live reload, but keep deploy Compose production-only: no source bind mounts, built images, `next start`, and Nest `start:prod` after Prisma migrations.
