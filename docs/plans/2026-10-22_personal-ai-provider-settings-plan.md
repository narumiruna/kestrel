# Personal AI Provider Settings

Status: Local implementation and checks verified; pull-request handoff in progress. Full provider-specific live acceptance remains open. The user authorized plan revision, implementation, and pull-request delivery for the full pi-ai provider/model scope. External gates apply only to the affected method's activation and final live acceptance, not to independent local implementation. No live provider login, paid inference, real account changes, database operations, or deployment was performed.

## Goal

Let each Kestrel user configure any built-in pi-ai provider and model with their own credential, then save account-backed defaults in Account settings. Setup order is Auth method → Provider → Model → Thinking level. Provider selection uses a searchable dropdown. Never use a shared AI account or another user's credential.

## Context

- `web/app/dashboard/account/page.tsx` and `accountNavigation.ts` currently provide Preferences and Security categories. Add AI assistant as a separate category; retain current hashes, legacy links, and pending Security state.
- `backend/prisma/schema.prisma` has no AI settings or credential models. Existing OIDC links identify a Kestrel user; they do not authorize AI inference.
- Research used the locally installed `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` 1.4.0. The pi-ai package declares Node.js `>=22.19.0` and ESM import exports. Verify package identity, exact compatible versions, Node.js 22 support, and Backend module loading before adding dependencies.
- User-specified references are `~/src/pi-browser-agent/`, `~/src/sumire/`, and `~/src/vibe-translator/`. Use their source patterns as references, not proof of hosted-Web authorization support or permission.
- Pi provides an app-owned `CredentialStore`, provider auth interfaces, and `getSupportedThinkingLevels(model)`. Built-in OAuth implementations can use Node-only localhost callbacks; they are not a hosted Web authorization flow.
- This is stage 1 of 3. [Route assistant drafts](2026-10-22_route-assistant-drafts-plan.md) consumes this plan's settings and credential boundary. [Road route planning](2026-10-22_road-route-planning-plan.md) extends the assistant later.

## Architecture

- Account → AI assistant owns provider connections and account-backed defaults. Map shows the selected configuration and a guarded settings link, not another credential form.
- Scope credential storage to `userId + providerId`, with one connection per provider. Separate non-secret preferences and connection status from encrypted credentials.
- Create user-scoped Pi model/auth objects. Disable ambient provider credentials, shared `auth.json`, cloud identity fallback, and executable key commands. An unconfigured or failed connection must stop, not select another credential.
- Derive provider/model coverage from the pinned pi-ai registry, not a hand-maintained launch allowlist. Filter the searchable Provider dropdown by the selected auth method; match provider names and IDs. Preserve distinct provider IDs, including regional and subscription variants.
- Preserve model operation type as well as provider ID and model ID: pi-ai can expose chat, image, and classifier entries with the same ID. Do not silently filter the requested catalog to chat models. Show operation type and mark thinking as not applicable when the operation has no thinking controls. This stage does not add image, classifier, or chat inference.
- Save only supported model/thinking combinations. Use `getSupportedThinkingLevels(model)` for chat models. On model change, show any required thinking adjustment before saving; do not silently substitute a model or billing source. Changing auth method or provider must invalidate incompatible unsaved selections and cancel the previous authorization attempt.
- Encrypt recoverable API keys and OAuth tokens with authenticated encryption and owner/provider binding. Keep encryption keys outside the database, backups, source, and API responses. Document rotation and recovery.
- Serialize refresh, replacement, and disconnect per user/provider across Backend processes. Recheck credential generation before persisting refresh results so a late refresh cannot restore a disconnected connection.
- Provider login is separate from Kestrel login and identity linking. Bind short-lived authorization attempts to the authenticated user/session/provider, with PKCE S256, state validation, exact callback rules, expiry, cancellation, and single-use completion.
- Kestrel never asks for a provider password. Secrets are submitted only through the selected provider flow or an explicit API-key field over HTTPS. Show that server-side inference lets the Kestrel server access the credential and required request data.

## Provider Scope and Discovery Gates

The user selected all built-in pi-ai providers and models, not an OpenRouter-only launch. API-key setup is part of this scope. Setup starts with auth method, followed by provider selection in a searchable dropdown, then model and thinking level. Do not request approval again for this scope or silently reduce it.

- Inventory every provider in `builtinProviders()` and every model operation in the pinned registry. Record each available auth method, required provider-specific fields, hosted-Web suitability, official permission evidence, and verification state.
- Keep the full provider/model catalog visible. Distinguish library capability, local implementation/test status, and permitted live availability for each auth method. Only verified permitted methods may start real authorization or accept real credentials. Methods awaiting external evidence must return a safe unavailable status with a reason, not a working-looking connect control. An unresolved provider blocks its own activation and final full-provider acceptance, not catalog, settings, storage, UI, or fixture work.
- OpenRouter OAuth PKCE yields a user-controlled API key billed to that user's OpenRouter account. Its official documentation supports a public callback URL, PKCE S256, and a returned `state` on successful authorization. Implement Kestrel-owned callback/session validation rather than exposing Pi's CLI listener.
- OpenAI / ChatGPT still requires a hosted-Web proof of concept: client registration, allowed callbacks, permissions, model access, token lifecycle, and current provider terms. Do not claim that Pi's CLI login or the reference projects' Codex device login proves this.
  - The OSS/local flow supports first-time `dynamic_agent_client` registration without a client secret or partner API key. Save the issued per-user/workspace client ID; do not use the registration entrypoint as the token-exchange client ID. Official OSS guidance requires a `127.0.0.1` HTTP callback and directs paid or remotely hosted applications to the interest process. This does not establish permission for Kestrel's hosted use. The VM guide documents local OAuth followed by protected credential transfer; credential import remains out of scope.
  - Implement contracts, validation, and dummy-flow tests without waiting for external evidence. Obtain evidence for a permitted Kestrel-hosted integration before enabling this method against real provider endpoints. Do not reuse another application's client identity without evidence of permission.
- Anthropic provider support uses a user-owned Claude Console API key. Do not expose Claude subscription login: official policy forbids third-party applications from offering Claude.ai login or collecting, storing, or intermediating Claude.ai credentials/session tokens. The reference projects do not override this rule.
- Bedrock bearer-token and Vertex API-key methods can be investigated without host credential fallback. Do not expose server AWS profiles, ADC, server file paths, workload identity, or executable key commands as user-owned credentials. Additional provider configuration must be bounded and allowlisted; tenant-specific endpoints require an SSRF-safe design.

Record supported, unavailable, and rejected methods with official references. Keep unresolved external acceptance items open in this plan; do not move them to another plan or claim full live support. Do not replace requested account login with API-key entry without explicit acceptance.

### Execution boundaries

- Proceed with the complete catalog, API contracts, additive migration files, encrypted storage, session/ownership checks, refresh/disconnect lifecycle, Account UI, translations, navigation protection, and dummy-provider tests without further provider approval.
- Develop provider adapters with injected dummy transports while external evidence is pending. Missing provider registration or live approval must not prevent independent local tests or required repository checks.
- Apply external permission and live-validation gates per provider/auth method. Enforce unavailable methods on the Backend as well as the UI. Do not add a bypass flag or use ambient credentials to make a method appear ready.
- Keep local implementation verification separate from live acceptance. A pull request may report verified local work and explicitly blocked external checks; it must not claim end-to-end live completion, archive this plan, or weaken unfinished acceptance criteria.

### Reference source findings

- `pi-browser-agent/src/browser/sidepanel/authentication.ts`: auth-method-first flow, provider filtering, searchable provider picker, prompt cancellation, and secret-input clearing.
- `pi-browser-agent/src/browser/auth/provider.ts`: registry-backed providers, disabled environment/file credential lookup, and provider-specific Azure/Vertex setup. It excludes Bedrock and removes most Node OAuth methods, so it does not prove full hosted coverage.
- `sumire/apps/bot/src/admin/providers.ts`: a Web bridge for Pi `AuthEvent`/`AuthPrompt`, owner-bound login lookup, cancellation, and supported-thinking validation. Its in-memory attempts and shared runtime are not Kestrel's persistent multi-user credential boundary.
- `vibe-translator/src/auth/providers.js` and `browser-oauth.js`: browser-specific provider setup and OAuth adapters. Browser extension permissions, local credential storage, copied client identities, and custom endpoints are not directly reusable in Kestrel.

These are source-inspection findings, not live-flow or integration-test evidence.

### Registry inventory and offline evidence

The isolated Node.js 22 fixture loaded `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` at exact version `1.4.0`. Library auth interfaces cover every registered built-in provider as follows:

| Library auth interfaces | Count | Provider IDs |
| --- | --- | --- |
| `api_key` only | 33 | `amazon-bedrock`, `ant-ling`, `azure`, `baseten`, `cerebras`, `cloudflare-ai-gateway`, `cloudflare-workers-ai`, `deepseek`, `fireworks`, `google`, `google-vertex`, `groq`, `huggingface`, `minimax`, `minimax-cn`, `mistral`, `moonshotai`, `moonshotai-cn`, `nvidia`, `opencode`, `opencode-go`, `qwen-token-plan`, `qwen-token-plan-cn`, `qwen-token-plan-individual`, `together`, `typesafe`, `vercel-ai-gateway`, `xiaomi`, `xiaomi-token-plan-ams`, `xiaomi-token-plan-cn`, `xiaomi-token-plan-sgp`, `zai`, `zai-coding-cn` |
| Both `api_key` and `oauth` | 8 | `anthropic`, `github-copilot`, `kimi-coding`, `meta`, `openai`, `openrouter`, `radius`, `xai` |
| `oauth` only | 1 | `openai-codex` |

`api_key` is a library discriminator, not a promise of a single API-key field: Bedrock also exposes bearer-token/profile/credential-chain choices, Vertex exposes API-key/ADC/file choices, and Cloudflare requires account/gateway fields. Azure needs endpoint/deployment configuration beyond its built-in key prompt. Kestrel must not expose host-owned credentials or arbitrary file paths.

The loaded static catalog contains 1,599 chat, 63 image, and 51 classifier entries. IDs are scoped by provider and operation type. These counts describe the pinned catalog, not live availability, account entitlement, or permission to use every entry in Kestrel.

Offline fixture evidence:

- Node.js `v22.23.4` loaded both exact-version packages. A TypeScript fixture compiled with Backend-compatible `nodenext`/`ES2023` settings to CommonJS and used native dynamic imports successfully.
- All 42 unconfigured provider resolvers returned no auth when the injected environment/file lookups were disabled, including with a dummy `OPENAI_API_KEY` in the fixture process environment.
- Independent in-memory stores resolved different dummy OpenAI keys for two users. Disconnecting one store did not change the other; metadata listing contained only provider ID and credential type.
- A stubbed expired OAuth refresh failed without falling back to a dummy ambient key; the stored OAuth credential remained present. This is resolver evidence, not a production reconnect-state or refresh-recovery test.
- Supported-thinking lookup respected non-reasoning models and explicit unsupported/extended levels. The fixture made zero network calls and did not start a provider login or inference request.
- Execution used an existing local container image (`sha256:583df2480e2f54987528a5b5da90f585c843bf85541cd6f026c1fd6d1612c04d`), no network, an empty allowlisted environment, read-only source/dependency mounts, a 64 MiB scratch tmpfs, 1 CPU, a 2 GiB memory limit, 64 processes, and a 120-second wall limit. Source was retained outside Git at `/tmp/kestrel-pi-node22-fixture.0Jfnz4/fixture.ts`; compiler settings are beside it. Initial macOS sandbox startup attempts and a 256 MiB compiler-heap attempt failed; the isolated container retry with a 1,536 MiB compiler heap passed.

This does not prove the complete Backend build, cross-process persistence, downstream SDK credential isolation, provider permission, or live authorization. The integration task and required provider gates remain open. `pi-agent-core` compatibility was checked, but this settings-only stage must not add it as a runtime dependency unless implementation actually requires it.

### Remaining authorization and isolation gates

- For `openai`, verify a permitted hosted integration before live activation, not before independent implementation or dummy-flow tests. Do not treat dynamic registration or Codex device login as approval for hosted ChatGPT plan usage. If this adapter is permitted, validate the ID-token signature, issuer, audience, expiry, and attempt nonce as required by the official sign-in guide; Pi 1.4.0's direct login checks ID-token presence but does not perform that validation.
- Pi has device-code paths for `github-copilot`, `kimi-coding`, `meta`, `openai-codex`, `radius`, and `xai`. Source inspection establishes transport feasibility, not provider permission or live success. GitHub's official multi-user Copilot SDK guide is evidence for that SDK path, not proof that Pi's direct Copilot adapter supports a Kestrel-owned OAuth client unchanged.
- Pi's Copilot login can POST model-policy enablement changes. Do not invoke it as a side-effect-free availability test or enable account models without explicit authorization.
- Pi's Kimi refresh implementation retries transport errors and some server responses. Establish a provider-specific safe retry rule before using it with potentially consumed rotating refresh tokens.
- Disabled `AuthContext.env()`/`fileExists()` only controls the resolver boundary. Some downstream helpers still consult `process.env`, and Vertex/Bedrock have credential-chain paths. Verify the complete request path with dummy ambient credentials and missing/invalid provider configuration; an empty request `env` object is not an isolation guarantee.
- Review subscription-product restrictions separately from API-key support. Alibaba's Token Plan Personal documentation excludes custom application backends; confirm applicability to the corresponding pinned provider before claiming Kestrel support. Do not equate a successful key form with permission for hosted inference.

## Non-Goals

- No shared platform inference account, arbitrary provider URLs, local-server discovery, multiple accounts for one provider, or credential import from a user's local Pi installation.
- No route assistant UI, model-generated route, persistent conversation history, Android settings UI, or device command changes.
- No provider-password collection or claim that local disconnect revokes the credential upstream.

## Plan

- [x] Record the user-approved scope: all built-in pi-ai providers/models; Auth method → searchable Provider dropdown → Model → Thinking level. Evidence: the user's clarification in the execution request.
- [ ] Inventory every pinned provider/model operation and its auth methods; record current official policy evidence and track the OpenAI hosted-Web proof-of-concept outcome as a provider-specific activation gate, not a prerequisite for common implementation.
  - [x] Enumerate all 42 providers and all three model operation types from the exact-version registry; record library auth interfaces above.
  - [ ] Resolve permitted hosted methods and required provider-specific configuration for the full matrix. External activation gate: permitted Kestrel-hosted OpenAI evidence and the accepted proof-of-concept outcome are unavailable. Continue independent local work. No live authorization has been approved or performed.
- [x] Verify the selected Pi package versions in an isolated Node.js 22 integration fixture; prove Backend import/build compatibility, supported-thinking lookup, user-scoped auth, and no ambient credential fallback without paid inference. Evidence: Node.js 22 production build and `npm run test:ai:integration` pass with zero network calls.
  - [x] Verify exact-version package imports, Backend-compatible CommonJS compilation/native dynamic import, static catalog coverage, thinking lookup, two-user in-memory resolver isolation, and failed-refresh no-fallback behavior with zero network calls. Evidence and execution limits are recorded above.
  - [x] Verify the complete Backend build and production auth-boundary isolation with `test/ai-library.fixture.cjs`. The fixture proves separate dummy credentials, no ambient resolver fallback, and no inference surface. Not applicable: downstream inference SDK execution in this settings-only stage; verify it before a later stage exposes inference.
- [x] Define the settings, connection-status, and authorization-attempt API contracts; include auth method, provider ID, model operation type/ID, applicable thinking level, ownership, bounded input, safe error codes, configuration generation, expiry, and the existing session-auth boundary. Verify missing/expired sessions and cross-user access with fixtures. Evidence: `docs/ai-provider-settings.md`, catalog/service specs, and HTTP e2e fixtures.
- [x] Add reviewable additive Prisma migrations for preferences, encrypted connections, and authorization attempts; define unique ownership keys, expiry cleanup, and credential generation. Run `npm run prisma:generate`; review schema and migration SQL without applying a database change until separately authorized. Evidence: schema and additive SQL reviewed; Prisma client generated. No migration applied.
- [x] Implement the credential-store adapter and encryption boundary; test two-user isolation, secret-free listing, unavailable encryption keys, concurrent refresh, lost refresh responses, replacement during refresh, disconnect during refresh, and Backend restart. Failed refresh must retain a reconnect state without using another credential. Evidence: secret-box/store specs cover these cases, including early refresh and a lost lease fence. Database locking remains an operational validation limit.
- [x] Implement hosted authorization contracts and adapters with injected dummy transports; test state/PKCE mismatch, callback replay, expiry, denial, cancelled attempts, wrong-user completion, duplicate completion, and session revocation. Enable real-provider transports only for permitted verified methods. Unavailable methods must fail closed on the Backend. Do not expose a CLI loopback listener as a public callback. Evidence: OpenRouter dummy exchange tests, all unavailable methods enforced by catalog/API, and session-revocation tests. Live flows remain gated below.
- [x] Add Account → AI assistant navigation and Auth method → searchable Provider dropdown → Model → Thinking level setup, plus connect/reconnect/disconnect controls and independent loading/error states. Verify registry coverage, provider name/ID search, method filtering, no-result feedback, keyboard/focus behavior, cancellation, and incompatible-selection handling. Test hash navigation, Back/Forward, language refresh, and retention of existing Security forms and operations. Evidence: Web tests and 29 final Chrome DevTools assertions, including callback lifecycle races and Security form retention.
- [x] Route Map settings links and provider-authorization departures through the existing draft-action boundary; fix any bypass in that path. Test cancellation retaining the exact draft and confirmation navigating once. Do not implement auto-save or promise reload-safe drafts. Evidence: draft-action guard tests and browser cancellation/confirmation for both Map AI settings and the account Settings menu.
- [x] Define disconnect as removal of Kestrel's stored connection plus invalidation of active runs and pending authorization attempts; distinguish upstream revocation and provide provider-specific instructions. Kestrel sign-out must end session-owned work but need not delete the user's saved provider connection. Evidence: generation/tombstone and exchange-race specs plus disconnect documentation. Not applicable: active inference runs; this stage exposes no inference.
- [x] Add complete messages in all current `web/messages/*.json` catalogs and document connection methods, who pays for inference, server access to secrets, reconnect behavior, and disconnect limits. Evidence: all 18 Web catalogs pass `just i18n-check`; user/operator limits are documented.
- [x] Verify at 1440×900 light mode with Chrome DevTools and dummy provider fixtures; cover keyboard/focus behavior, pending login, reconnect, and settings failures. Live authorization, paid calls, and real account changes require explicit approval; otherwise retain their acceptance gates as blocked. Evidence: final isolated Chrome DevTools Protocol run passed 29 assertions; screenshots are outside Git. No live provider/account changes.
- [x] Run Web formatting/lint/tests/typecheck/build, `just i18n-check`, Backend lint/unit/e2e/typecheck/build, and `git diff --check`. Run commands separately, each within 180 seconds; split longer checks into observable steps. Use `npm ci` first when dependencies are absent or lockfiles change. Keep secrets, captures, generated caches, and unrelated files out of the diff. Evidence: final Node.js 22 Backend checks: 343 unit + 19 e2e tests; Web: 192 tests; integration and i18n gates pass. Existing warnings and audit advisories are recorded below.

## Local verification and remaining gates

- Node.js `v22.23.2`: Backend lint, 29 unit suites / 343 tests, five HTTP e2e suites / 19 tests, typecheck, build, and `npm run test:ai:integration` passed. The production fixture enumerates 42 providers and 1,599 chat / 63 image / 51 classifier entries with zero network calls.
- Web formatting/lint, 192 tests, typecheck, production build, and the 18-locale i18n gate passed. Existing CSS specificity / Biome schema diagnostics and identical technical-term translation notices remain. Android code and resources are unchanged.
- Chrome DevTools Protocol: 29 final assertions passed at 1440×900 light against a dummy loopback API; external requests, including map tiles, were blocked. Coverage includes keyboard/focus/search, reconnect/disconnect, pending/cancelled authorization, callback retry and delayed-response races, independent settings errors, hashes/Back/Forward/language refresh, Security form retention, and guarded Map departures. The configured MCP Chrome executable was missing, so an isolated installed Chrome was used directly. A stale-target harness run timed out; the final fresh-target run passed. Captures and fixture artifacts remain outside Git.
- Full source/diff review covered correctness, security, lifecycle, compatibility, regressions, and scope. Fixed early-refresh durability/fencing, callback recovery races, stale response handling, and a Map summary hidden by existing CSS. Independent final source reviews found no remaining concrete issue in their reviewed paths. `git diff --check` passed.
- `npm audit`: 24 advisories (20 moderate / four high); every reported installed package version matches `origin/main`. Do not hide these or perform unrelated dependency upgrades in this change.
- Remaining external acceptance: provider-specific hosted permission evidence outside OpenRouter, real provider authorization/key validation, and actual PostgreSQL migration/locking/cross-process contention. No inference SDK is exposed by this stage. These gates remain here; they do not block review of the verified local implementation. See [AI provider settings](../ai-provider-settings.md) for contracts, recovery, and limits.

## Risks

- Library support does not establish provider permission or hosted-Web compatibility. Launch methods need both evidence and an accepted support matrix.
- Token rotation can fail after an ambiguous response. Record the provider-specific recovery path; never retry a consumed refresh token without a proven safe rule.
- Existing Settings navigation can bypass Map draft protection. Authorization must not make that data-loss path more accessible.
- No logs, telemetry, errors, or test artifacts may contain API keys, tokens, authorization codes, callback query strings, request bodies, or precise location payloads.

## Rollback / Recovery

- Remove AI settings and authorization entry points and stop new AI requests; keep existing Kestrel authentication and route APIs usable.
- Cancel pending attempts/runs before removing the feature. Do not restore disconnected credentials from caches or a database backup.
- Keep additive tables during application rollback after verifying old-code compatibility. Prisma has no automatic down migration; schema rollback, credential deletion, key rotation, backup restore, and production changes require separate approval and the operations procedure.
- If the encryption key is unavailable, fail closed and request operator recovery or user reconnect. Do not replace encrypted data with plaintext.

## Completion Checklist

- [x] All built-in providers and model operations from the pinned pi-ai registry are represented. Auth method precedes searchable provider selection; model and applicable thinking choices follow. Permitted implemented methods work through tested local paths; unavailable methods have explicit reasons and cannot start authorization or store credentials through either the UI or API. Evidence: actual pinned registry fixture and method-gating tests pass.
- [ ] Required provider-specific permission and live-flow acceptance gates are satisfied. Unavailable external evidence remains open for the affected method and full live completion, without blocking independent local implementation or its pull-request review.
- [x] Two users can save different provider/model/thinking settings and cannot read, use, replace, or disconnect each other's credentials. Evidence: defaults ownership/CAS, encrypted store isolation, HTTP cross-user attempts, and production Pi auth fixture tests pass.
- [x] OAuth and refresh failure/race tests pass; no shared credential, ambient fallback, or secret exposure is possible through the tested paths. Evidence: fake-transport/store tests and real-library auth-boundary fixture pass; this is not PostgreSQL or live-provider proof.
- [x] Settings and authorization departures preserve unsaved Map drafts until explicit confirmation. Evidence: Map settings links cross the draft guard; provider authorization starts only on Account after that navigation. Browser tests retain name and both waypoint coordinates on cancellation.
- [ ] All required checks and approved live-flow evidence are recorded. Unavailable live-provider acceptance remains open.
- [ ] Review the full diff and archive this plan only after every required item has evidence. Do not move unfinished work into another plan to close it.

## References

- [OpenRouter OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)
- [OpenAI Sign in with ChatGPT](https://developers.openai.com/siwc)
- [OpenAI client registration](https://developers.openai.com/siwc/request-client-id)
- [OpenAI OSS/local integration scope](https://developers.openai.com/siwc/token-sharing-open-source)
- [OpenAI dynamic registration and sign-in validation](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [OpenAI open-source self-hosted VM guidance](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)
- [OpenAI ChatGPT plan inference limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Anthropic authentication and credential use](https://code.claude.com/docs/en/legal-and-compliance)
- [GitHub multi-user Copilot SDK OAuth setup](https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/github-oauth)
- [Kimi Code official third-party API-key setup](https://www.kimi.com/code/docs/en/)
- [Alibaba Token Plan Personal usage scope](https://www.alibabacloud.com/help/en/model-studio/token-plan-personal-overview)
- [Current Account settings baseline](archived/2026-10-18_web-account-settings-plan.md)
