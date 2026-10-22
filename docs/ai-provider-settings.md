# AI provider settings

## Current source behavior

This document describes `backend/src/ai/*.ts` (excluding tests) and `web/lib/ai.ts`. This stage provides settings and credential management, not inference or conversation history.

### User flow and availability

1. Select **Auth method**: API key/token or OAuth.
2. Search **Provider** by name or ID. Search is case-insensitive and filters by the selected method; unavailable methods remain visible with a reason.
3. Select **Model** by its operation and ID.
4. Select **Thinking** from that model's advertised levels, then save the selection.

The catalog exposes the full 42-provider registry, not only usable providers. It returns provider methods, availability reasons, configuration field names, and model metadata. Catalog version is `1.4.0`. Model identity includes `modelType` (`chat`, `image`, or `classifier`) and `modelId`; the Web identity key is `type:id`. An identical model ID does not make different operations interchangeable. Chat thinking must exactly match an advertised level. Image and classifier selections require `thinkingLevel: null`. Unsupported thinking is rejected, never silently substituted.

API keys and tokens are available where the registry advertises API-key authentication and encryption is configured, except `qwen-token-plan` and `qwen-token-plan-individual`, which are withheld for policy reasons. Saving a key checks its format and configuration; it does not live-verify the key, account balance, model access, or provider service.

OpenRouter OAuth is available only with encryption and a valid HTTPS `KESTREL_PUBLIC_URL` origin: no credentials, non-root path, query, or fragment. Anthropic OAuth is policy-blocked. Other registry OAuth methods are `hosted_unverified` and cannot be used. There is no simulated successful connection. Availability reasons are `policy`, `hosted_unverified`, and `operator_unconfigured`.

Each user supplies credentials and pays their provider charges. Credentials belong to that user; host environment credentials and CLI `auth.json` are not fallback credentials. Encryption at rest does not hide credentials from the Backend operator: the server can decrypt secrets and can access request data sent through it. This stage does not send inference requests or store AI conversation history.

### HTTP contract

Backend paths below are relative to the Backend mount; Web requests use `/api/backend` before these paths. Session authentication is required except for the state-protected OAuth callback. Responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

| Method and path | Body or result |
| --- | --- |
| `GET /ai/catalog` | `{ version, providers }`; each provider has `{ id, name, methods, fields, models }`. |
| `GET /ai/settings` | `{ generation, selection, connections, connectionGenerations }`. No secrets are returned. |
| `PUT /ai/settings` | `{ "generation": 0, "selection": null }`, or a selection object as below; returns settings. |
| `POST /ai/connections/:providerId` | `{ "apiKey": "…", "config": {}, "expectedGeneration": 0 }`; saves/replaces an API key and returns settings. |
| `DELETE /ai/connections/:providerId` | `{ "expectedGeneration": 0 }`; disconnects locally and returns settings. |
| `POST /ai/authorizations/:providerId` | No body; starts OAuth, returns attempt metadata plus `authorizationUrl` with status 201. Only OpenRouter is usable. |
| `GET /ai/authorizations/:id` | Returns attempt metadata. |
| `DELETE /ai/authorizations/:id` | No body; cancels an active attempt and returns metadata. |
| `POST /ai/authorizations/:id/complete` | No body; authenticated code exchange, returns attempt metadata. |
| `GET /ai/oauth/openrouter/callback/:id` | Query: `state` and `code`, or `state` and `error`; stores the encrypted code, then redirects with status 303 to `/dashboard/account?aiAttempt=:id#ai-assistant`. |

A selection is `{ authMethod, providerId, modelType, modelId, thinkingLevel }`. Saving a selection validates registry identity and thinking; it does not establish or verify a connection. Unknown selection and mutation-body fields are rejected.

Settings `generation` protects selection updates only. Connection mutations use the provider's separate `connectionGenerations[providerId]` as `expectedGeneration`, defaulting to zero only for a provider with no row. `connections` contains non-disconnected entries with `{ providerId, authMethod, generation, status }`; status is `connected` or `reconnect_required`. `connectionGenerations` also includes disconnected tombstones. Do not reuse settings generation for connection writes or discard tombstone generations. Generations must be non-negative safe integers below 2147483647. Stale writes return `AI_CONFIGURATION_CHANGED` (409); reload settings before a new user-directed change.

Attempt metadata is `{ id, providerId, status, expiresAt }`. Status is `pending`, `code_received`, `processing`, `completed`, `cancelled`, `failed`, or `expired`. Attempts belong to both user and session, expire after five minutes, and use state plus S256 PKCE. Starting an attempt deletes expired attempts for the current user, limits active attempts to eight and all unexpired attempts to 32, and cancels older active attempts for that provider. There is no global expiry-cleanup claim. Completion claims the code once; repeated completed requests succeed only while the resulting connection generation is still current.

### Provider configuration allowlist

`config` accepts only these provider-specific fields; other providers accept an empty object. Arbitrary URLs, environment variables, and file paths are not accepted.

| Provider | Allowed fields |
| --- | --- |
| `azure` | Required `resourceName`: 1–63 ASCII letters, digits, or hyphens, starting with a letter or digit. Optional `apiVersion`: 1–40 letters, digits, dots, or hyphens; defaults to `v1`. Optional `deploymentMap`: comma-separated `model=deployment` pairs; model characters are letters, digits, `.`, `_`, `:`, `/`, `-`; deployment characters are letters, digits, `_`, `-`. |
| `cloudflare-workers-ai` | Required `accountId`: 32 hexadecimal characters. |
| `cloudflare-ai-gateway` | Required `accountId`: 32 hexadecimal characters; required `gatewayId`: 1–64 letters, digits, `_`, or `-`. |
| `amazon-bedrock` | Required `region`: matches `^[a-z]{2}(?:-gov)?-[a-z]+-\d$`. |

Each configuration value is at most 4096 characters. Keys are nonempty, at most 8192 characters, contain no whitespace or control characters, and must not start with `!` or `$`.

### Encryption and connection lifecycle

Set `AI_CREDENTIAL_ENCRYPTION_KEY` to a separate 32-byte key encoded as exactly 64 hexadecimal characters. Do not reuse the TOTP key. Secrets use AES-256-GCM with a random 12-byte IV. Authenticated additional data (AAD) is the JSON array `["kestrel-ai-v1", userId, providerId, purpose]`, where purpose is `credential`, `verifier:<attemptId>`, or `code:<attemptId>`.

A missing or malformed key disables new credential methods and fails secret operations closed. A wrong but correctly formatted key cannot decrypt existing secrets. Local disconnect still works without decryption, including when policy changes: it clears ciphertext, advances connection generation, and cancels active provider attempts.

The credential store uses a database lease and generation fence across Backend processes, not a process-local mutex. Writes also check the session under a transaction lock. Before every OAuth credential mutation, including refresh before access-token expiry, the store commits `reconnect_required` under the full lease fence. A lost rotating-refresh response or process death requires reconnect; do not retry a possibly consumed refresh token. This is a store safety rule, not evidence that currently blocked OAuth providers work. Session revocation ends pending authorization attempts and prevents their completion; it does not delete saved user connections.

Disconnect does not revoke upstream credentials. For OpenRouter, open `https://openrouter.ai/keys`, identify the issued key, and delete/revoke it there. For other providers, use their credential or security dashboard. Cancelled or failed exchanges can also require upstream cleanup if a key was issued but not saved.

## Authorized operator maintenance

Key rotation and recovery require explicit authorization and a reviewed maintenance procedure. They are not automatic application operations.

1. Stop AI requests on every Backend process and cancel pending authorization attempts. Wait for in-flight work to stop before changing ciphertext.
2. Retain the old key in a secure secret manager. Do not put it in the database, repository, or database backups.
3. Use a reviewed offline rewrap procedure with the old and new keys. Decrypt and re-encrypt retained secrets with exactly the same owner/provider/purpose AAD, in a transaction. Preserve generations and disconnected tombstones; never restore deleted credentials or cancelled attempts.
4. Switch the key on all Backend instances atomically while traffic remains stopped, then restart them. Do not run mixed keys.
5. Verify decryption, ownership isolation, disconnect, and reconnect behavior before reopening AI requests.

Do not run an unreviewed database operation or restore tombstones to recover access. If the old key is lost, ciphertext cannot be recovered; use authorized local disconnect and user reconnect instead. Do not substitute the TOTP key.

## Verification and limits

Local Node.js 22 checks passed: Backend lint, 343 unit tests, 19 HTTP e2e tests, typecheck, build, and the real-library integration fixture; Web formatting/lint, 192 tests, typecheck, build, and the 18-locale i18n gate. The integration fixture imports the built production adapter with all 42 providers and 1,713 model operations, separate dummy user credentials, disabled ambient resolver credentials, no inference surface, and zero network calls.

Chrome DevTools Protocol checks passed at 1440×900 in light mode against an isolated dummy API: 29 assertions cover provider search/keyboard/focus, reconnect/disconnect, pending/cancelled authorization, settings failure/retry, callback retry and delayed-response cancellation, category/hash/history/language behavior, Security form retention, visible Map configuration, and both guarded settings links. External browser requests were blocked, including map tiles; no provider authorization page was visited. Screenshots remain outside Git. The configured Chrome DevTools MCP executable was unavailable; validation used an installed isolated Chrome through its DevTools Protocol directly. A stale-target harness run timed out; the final fresh-target run passed.

No database migration, live OAuth, real key validation, inference, or maintenance procedure was performed. In-memory tests do not verify PostgreSQL transaction locking, lease contention, or concurrency across processes. Those behaviors require separate authorized database and hosted-flow verification before operational claims are made. The complete catalog is not a claim that every provider's authentication method is enabled.

`npm audit` reports 24 advisories (20 moderate, four high). Every reported installed package version is unchanged from `origin/main`; dependency remediation is outside this change. Web checks also retain existing CSS-specificity and Biome schema-version diagnostics, plus i18n identical-technical-term review notices.
