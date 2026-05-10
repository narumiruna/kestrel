## GOTCHA

- Deploy must not use the dev Compose stack. `compose.yaml` bind-mounts source and runs `next dev`/`nest start --watch`; this can leave root-owned `.next` files on the host and serve non-production dev assets. Use `compose.deploy.yaml` for GitHub Actions deploys.

## TASTE

- Keep local Docker Compose optimized for live reload, but keep deploy Compose production-only: no source bind mounts, built images, `next start`, and Nest `start:prod` after Prisma migrations.
