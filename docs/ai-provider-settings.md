# AI provider settings

## User setup

1. Select **Auth method**: API key/token or provider account login.
2. Search **Provider** by name or ID.
3. Select **Model** by operation and ID.
4. Select an advertised **Thinking level**, then save the defaults. The selection prompt is not a level. Image/classifier operations have no thinking control.

The pinned pi-ai 1.4.0 catalog includes all 42 providers and 1,713 operations: 1,599 chat, 63 image, and 51 classifier entries. All 41 API-key/token interfaces and all nine OAuth interfaces are available when credential encryption is configured. Kestrel does not require a live verification or provider-policy review before the user can try a method. A provider can still reject the account, registration, scope, region, or request. Kestrel does not claim provider approval or account entitlement.

This stage stores settings and credentials. It does not run inference or store conversation history. Users supply credentials and pay their own provider charges. Saving a key does not test it, check a balance, or send a paid request. Server operators can decrypt saved credentials. Never enter a provider password in Kestrel.

## Account login

Click **Connect provider account**. Starting provider sign-in can create provider keys or enable model access after approval. The consent notice applies to built-in flows such as Copilot model enablement and Meta API-key creation. Kestrel does not perform those changes as an availability test.

| Provider | Web interaction |
| --- | --- |
| OpenRouter | Hosted state/PKCE callback when a valid public HTTPS origin exists. Otherwise, open the headless PKCE page and paste the displayed code. |
| OpenAI | Open the dynamic-registration page. Paste the full final `http://127.0.0.1:1455/auth/callback` URL into Kestrel if the browser cannot load that local URL. Kestrel checks the callback origin/path, state, issued client ID, and PKCE. It does not run a localhost listener. |
| Anthropic | Open the built-in copy-code flow and submit the displayed code. |
| OpenAI Codex, Kimi Code, Meta, Radius, xAI | Open the device-authorization link and enter the displayed device code. Kestrel polls the provider. |
| GitHub Copilot | Use the public GitHub device-code flow. Arbitrary Enterprise hosts are not accepted. |

Provider links open in another tab. Device codes, provider instructions, progress, and prompts appear in Account. Manual responses are masked and cleared when the prompt, provider, method, or Account section changes. They are not copied to browser storage. The provider can return a real failure; Kestrel does not substitute another account, provider, model, or billing source.

Each job expires after five minutes. Cancelling, signing out, replacing a connection, or disconnecting prevents a late result from saving credentials. Another Backend process can read encrypted interaction state and accept an owner-bound response. The process running the provider flow sends a heartbeat. A heartbeat older than 15 seconds marks the attempt failed on the next poll. Restart login after a Backend interruption; Kestrel does not replay an exchange whose result may have been lost. Each process permits at most 16 active bridged jobs; per-user limits remain eight active and 32 unexpired attempts.

Provider login and refresh run in bounded Node workers with an empty environment. They cannot read host provider credentials or endpoint overrides through `process.env`. Provider output is not logged. Built-in browser/loopback choices are replaced with their headless choices. OpenAI and fallback OpenRouter use manual adapters. Kimi rotating refresh is sent once, without the library's transport retry loop. The auth facade still exposes no inference methods; later inference work must check its full SDK request path.

## HTTP contract

Paths are relative to the Backend mount. Web uses `/api/backend`. All responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Session authentication is required except for the public hosted OpenRouter callback.

| Method and path | Body or result |
| --- | --- |
| `GET /ai/catalog` | `{ version, providers }`; all registry methods and models, bounded provider configuration fields, and operator configuration status. |
| `GET /ai/settings` | `{ generation, selection, connections, connectionGenerations }`; no credentials. |
| `PUT /ai/settings` | `{ generation, selection }`; validates provider/method, model operation/ID, and thinking. `selection` may be null. |
| `POST /ai/connections/:providerId` | `{ apiKey, config, expectedGeneration }`; save/replace a literal key. |
| `DELETE /ai/connections/:providerId` | `{ expectedGeneration }`; clear the local connection and cancel pending attempts. |
| `POST /ai/authorizations/:providerId` | Start any registry OAuth flow. Returns attempt metadata and, for hosted OpenRouter only, a top-level `authorizationUrl`. |
| `GET /ai/authorizations/:id` | Owner/session-bound attempt metadata and current interaction. |
| `POST /ai/authorizations/:id/respond` | `{ promptId, value }`; encrypted, single-use response to the current prompt. |
| `DELETE /ai/authorizations/:id` | Cancel active work and clear attempt secrets. |
| `POST /ai/authorizations/:id/complete` | Complete hosted OpenRouter code exchange. Repeated completion succeeds only while the saved connection generation is current. Other flows complete in their worker. |
| `GET /ai/oauth/openrouter/callback/:id` | Hosted callback: `state` plus `code`, or `error` with optional `state`. Redirects to Account with the attempt ID, not the code. |

A selection is `{ authMethod, providerId, modelType, modelId, thinkingLevel }`. Model identity includes operation type: an identical chat/image/classifier ID is not interchangeable. Chat thinking must equal an advertised level. Image/classifier thinking must be null. Unsupported input and unknown mutation fields are rejected.

Attempt metadata is `{ id, providerId, status, expiresAt, interaction? }`. Status is `pending`, `code_received`, `processing`, `completed`, `cancelled`, `failed`, or `expired`. Interaction may include `authorizationUrl`, `instructions`, `userCode`, `message`, and `prompt`. A prompt contains an unguessable `id`, `type`, `message`, and optional `placeholder`/`options`. Responses must match that prompt ID and the original session. Response values and raw provider errors are never returned. URLs must use HTTPS without user information, custom ports, or local/IP hosts. The Backend does not fetch an arbitrary browser interaction URL.

Settings `generation` protects defaults only. Connection writes use the provider's `connectionGenerations[providerId]`, defaulting to zero only if no row exists. Disconnected tombstones retain their generations. Stale writes return `AI_CONFIGURATION_CHANGED` (409). Reload before another user-directed write.

Hosted OpenRouter success always requires matching state. OpenRouter omits state on denial. A bounded error-only callback can only fail an unexpired pending attempt for an active owning session. Supplied state must still match. Mixed error/code input is rejected. Knowledge of a pending callback URL permits denial of that attempt, not authorization, code exchange, or a saved-connection change.

## Keys and provider configuration

Set a separate `AI_CREDENTIAL_ENCRYPTION_KEY` to exactly 64 hexadecimal characters (32 bytes). Do not reuse the TOTP key. Missing encryption disables credential methods; it is not a provider verification gate. A wrong key fails decryption closed. Metadata listing and local disconnect do not require decryption.

API keys must be nonempty, at most 8192 characters, with no whitespace/control characters or leading `!`/`$`. Kestrel never executes key commands or imports host auth files. Provider configuration is bounded and allowlisted:

| Provider | Configuration |
| --- | --- |
| Azure | Required `resourceName`: 1–63 letters/digits/hyphens, starting with a letter or digit. Optional bounded `apiVersion` (default `v1`) and comma-separated `deploymentMap` entries (`model=deployment`). No arbitrary endpoint. |
| Cloudflare Workers AI | Required 32-hex-character `accountId`. |
| Cloudflare AI Gateway | Required `accountId` and 1–64-letter/digit/underscore/hyphen `gatewayId`. |
| Amazon Bedrock | Required region matching `^[a-z]{2}(?:-gov)?-[a-z]+-\d$`; bearer token only, no host AWS profiles or credential chains. |

Other providers accept an empty configuration object. Configuration values are at most 4096 characters. No arbitrary URLs, environment variable names, files, or workload identities are accepted.

Credentials and interaction data use AES-256-GCM, fresh 12-byte IVs, and owner/provider/purpose AAD: `["kestrel-ai-v1", userId, providerId, purpose]`. Purposes are `credential`, `verifier:<attemptId>` (PKCE verifier or bridged interaction), and `code:<attemptId>` (hosted code or bridged response). OAuth credentials retain provider metadata needed for refresh. No credential reaches an API response.

The database lease and generation fence serialize refresh/replacement/disconnect across Backend processes. Every OAuth mutation records `reconnect_required` before its callback. A lost rotating-refresh response requires reconnect; no ambient credential is selected. Session locks fence credential commits against revocation. The new nullable `heartbeat_at` column is additive. Apply its versioned migration through the normal authorized deployment procedure; this task does not apply it.

Disconnect does not revoke upstream credentials or billing. For OpenRouter, revoke the issued key at `https://openrouter.ai/keys`. Use each other provider's key/security dashboard as needed. An interrupted exchange can require upstream cleanup if a key was issued but not saved.

## Authorized maintenance and rollback

Key rotation, database changes, and recovery require separate authorization. Stop all AI jobs first. Keep the old key in a secret manager, not the database or backups. Rewrap retained ciphertext with the same AAD using a reviewed offline transaction. Preserve generations/tombstones and never restore cancelled attempts or disconnected credentials. Switch all Backend instances together, then check decryption and isolation before reopening traffic. A lost old key cannot recover ciphertext; disconnect and reconnect instead.

Application rollback can retain additive columns. Stop pending work and remove entry points before rollback. Prisma has no automatic down migration. Never restore credentials from an old cache to recover access.

## Local verification

Node.js 22 checks passed: Backend lint, 416 unit tests, 21 HTTP e2e tests, typecheck/build, Prisma validation/generation, and the offline production fixture. The fixture confirms all 41 API-key and nine OAuth interfaces are enabled, plus all 42 providers and 1,713 model operations, with zero provider calls. Web formatting/lint, 193 tests, typecheck/build, and all 18 locale catalogs passed.

Chrome DevTools checks passed 29 assertions at 1440×900 light against real AI HTTP routes, session authentication, encryption, and the login bridge, with a Prisma double and dummy provider transports. They cover device/manual input, enabled methods, cancellation, safe failure, connection metadata recovery, and existing Security state. No provider page was visited or external browser request made. Captures are outside Git.

## Verification limits

Tests use dummy providers, tokens, and accounts. No agent-operated live login, key validation, inference, migration application, deployment, or provider account change is performed. Real PostgreSQL locking/contention and provider availability are not proven by protocol doubles. Those limits are reported; they do not disable registry methods. Provider terms still apply to the user's use.

The baseline had 24 npm audit advisories (20 moderate/four high) in unchanged dependencies. This follow-up does not upgrade dependencies or hide audit findings. Browser captures stay outside Git. Use Chrome DevTools, not Playwright.
