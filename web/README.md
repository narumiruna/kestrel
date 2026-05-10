# Kestrel Web Console

Next.js web console for the Kestrel cloud backend.

## Local development

Start the NestJS API first, then run:

```bash
npm install
npm run dev
```

The console runs on `http://localhost:3001` and rewrites `/api/backend/*` to `http://localhost:3000` by default.

Set a custom API origin with:

```bash
KESTREL_API_BASE_URL=http://localhost:3000 npm run dev
```

## Current scope

- Register + TOTP setup.
- Username/password + TOTP or recovery-code login.
- LocalStorage-backed access/refresh session with one retry after refresh.
- Authenticated dashboard shell and logout.
- Place list/create/edit/delete.
- Route list/create/edit/delete.
- MapLibre route editor: click map to add waypoints, drag markers to adjust coordinates, delete/reorder waypoint rows.
- Route default speed/mode/public flag and latest revision display.

## Validation

```bash
just web-format
just web-check
just web-lint
npm run typecheck
npm run build
```
