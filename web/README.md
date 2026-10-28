# Kestrel Web Console

Next.js web console for the Kestrel cloud backend.

## Local development

Start the Hono API first, then run:

```bash
npm install
npm run dev
```

The console runs on `http://localhost:3301` and rewrites `/api/backend/*` to `http://localhost:3300` by default.

Set a custom API origin with:

```bash
KESTREL_API_BASE_URL=http://localhost:3300 npm run dev
```

## Current scope

- Register + TOTP setup.
- Username/password + TOTP or recovery-code login.
- Optional provider-neutral OIDC login through the Kestrel backend; see [`docs/oidc.md`](../docs/oidc.md).
- LocalStorage-backed access/refresh session with one retry after refresh.
- Authenticated dashboard shell and logout.
- Place list/create/edit/delete.
- Route list/create/edit/delete.
- MapLibre route editor: map/Saved place/exact-coordinate entry, marker drag, selected-waypoint controls, complete waypoint management, Undo/Redo, Reverse route, and Close loop.
- Route draft change summaries, default speed/mode/public flag, metadata-preserving revisions, and saved/draft clarity for Share and Android Device actions.
- Place and route share-link controls in the dashboard: create, disable/re-enable, copy URL, and open the public page.
- Public share page for place and latest route snapshots with map preview and signed-in copy-to-library action.

See the user-facing [Kestrel Cloud route editing guide](../docs/web-cloud-guide.md) for path tools, playback modes, draft/saved behavior, keyboard alternatives, and recovery.

## Localization

The UI supports 18 languages with English as the first-use and fallback language. Language selection is available in Account settings, on the login page, and on public share pages. It is stored in a site cookie, not in the account.

See [internationalization rules and checks](../docs/i18n.md) before changing UI messages or translations. Existing URLs and sign-in callback paths do not use language prefixes.

## Public API documentation

The canonical sources at the repository root are:

- `docs/remote-control-api.md`
- `docs/device-session-security.md`
- `docs/android-qr-login-api.md`

All three are published to keep their relative links valid. Do not edit their
generated copies in `web/public/docs/`.

After a source change, run these commands from the repository root:

```bash
just public-docs
just public-docs-check
```

Include the generated Markdown files with the source change. Production Docker
builds use only `web/` as their build context, so the generated files must remain
in Git. The `--check` command fails for missing or stale copies and writes no files.

## Validation

```bash
just i18n-check
just web-format
just web-check
just web-lint
npm test
npm run typecheck
npm run build
```
