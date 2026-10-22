# Personal AI Provider Settings

## Goal

Let each user use every authentication method, provider, and model offered by the pinned pi-ai registry. Setup order remains Auth method → searchable Provider → Model → Thinking level. Each user supplies their own credentials. Never use another user's credential or a host credential.

## Current decision

The user explicitly removed provider verification and permission-review gates: “不用 verify 讓使用者使用” and “不要阻擋”. Do not disable a method because it is unverified, because a live login was not tested, or because Kestrel has not reviewed provider policy. Users can start the built-in flows and receive an actual success or failure. Do not claim provider approval or guaranteed account entitlement.

Encryption, session authentication, owner checks, input bounds, state/PKCE, expiry, generation checks, and cancellation are still required. The user did not authorize live agent-operated logins, paid inference, deployment, database application, or physical device changes.

## Context

[PR #353](https://github.com/narumiruna/kestrel/pull/353) is merged. It added all 42 providers and 1,713 model operations from pi-ai 1.4.0, encrypted credential storage, saved defaults, Account UI, 18 translations, guarded Map navigation, and OpenRouter PKCE. Its implementation blocked the other OAuth methods. This follow-up removes those application restrictions and implements their Web interaction paths.

Baseline evidence: Node.js 22 Backend checks passed with 354 unit tests and 20 HTTP e2e tests. Web checks passed with 192 tests, 29 initial browser assertions, and 14 thinking-picker assertions. These counts describe the baseline, not the follow-up's final validation.

References: `~/src/pi-browser-agent/`, `~/src/sumire/apps/bot/src/admin/providers.ts`, `~/src/vibe-translator/`, and the pinned pi-ai auth types/provider implementations. The reference projects supply interaction patterns, not a shared credential store.

## Architecture

- Keep the complete registry and account-backed defaults. Chat models require an advertised thinking level. Image/classifier operations use null. Preserve operation type in model identity.
- Enable all registry API-key/token and OAuth methods when credential encryption is configured. Do not retain policy or `hosted_unverified` provider allowlists.
- Keep the existing hosted OpenRouter callback when a public HTTPS origin is configured. Otherwise use OpenRouter's headless PKCE code flow.
- Bridge pi-ai `AuthEvent` and `AuthPrompt` to authenticated polling and responses. Device-code links open in another tab. Manual code/full-callback responses are sent over the existing authenticated API and are never logged.
- Use headless choices for Anthropic (copy code), Codex (device code), and Radius (device code). Use public GitHub rather than accept arbitrary Enterprise hosts. Do not start CLI callback listeners in the Backend.
- OpenAI direct login uses a Kestrel manual-return adapter with state, PKCE, dynamic registration, and the issued client ID. The user pastes the full loopback redirect URL. No Backend loopback server is started. Do not use the provider ID token as a Kestrel identity assertion.
- Keep one encrypted connection per user/provider. A successful login stores the complete canonical OAuth credential through the generation-fenced store. A late result must not restore a cancelled, revoked, replaced, or disconnected connection.
- Store current login interaction and answers in the existing owner/provider/purpose-bound encrypted attempt fields. Add an attempt heartbeat so another Backend process can detect interrupted work. Do not resume a possibly consumed provider exchange after restart.
- Polling, responses, completion, and cancellation are bound to the original user and session. Response prompt IDs are single-use. Lost or stale responses require a reload, not silent submission to a newer prompt.
- Preserve generic safe errors, no-store/no-referrer responses, fixed provider endpoints, bounded credentials and prompts, and HTTPS provider-link checks. No ambient environment, file, executable key, AWS profile, ADC, or arbitrary URL fallback.
- Show that starting provider login can mint keys or enable model access. Saving credentials is not live verification. Server operators can decrypt credentials; users pay their provider charges. Disconnect does not revoke upstream credentials.

## Plan

- [x] Record the user's removal of verification-only provider gates. Keep all security and lifecycle checks.
- [x] Enable all registry authentication methods without policy/verification allowlists; prove catalog coverage with the actual pinned library and focused tests.
- [x] Add the owner-bound encrypted login bridge and additive heartbeat migration. Run Prisma generation/validation without applying the migration. Test polling, prompts, stale answers, cancellation, expiry, restart, session revocation, and replacement/disconnect races.
- [x] Implement headless/native pi-ai adapters plus manual OpenAI and OpenRouter adapters. Test URL/state/PKCE/client binding and fixed token exchange with dummy transports. Never start a loopback listener or run live logins.
- [x] Make every provider's OAuth control usable in Account. Render device codes, links, prompts, responses, errors, and cancellation. Keep existing callback recovery, generation/revision guards, thinking choices, Security state, and Map draft protection.
- [x] Add all new messages in all 18 catalogs and update provider setup, billing, server access, side-effect, restart, and disconnect documentation.
- [x] Run Backend lint/unit/e2e/typecheck/build, real-library offline integration, Web formatting/lint/tests/typecheck/build, i18n, migration/schema checks, and `git diff --check`. Use Node.js 22. Keep each command bounded and observable.
- [x] Run Chrome DevTools dummy-provider checks at 1440×900 light for device-code and manual-prompt login, response submission, failure, cancellation, and unchanged navigation. Keep captures outside Git. Do not use Playwright.
- [ ] Review the entire follow-up diff for correctness, security, lifecycle, compatibility, regressions, and scope; commit/push intended text files and open a follow-up PR to `main` that links #353.

## Follow-up verification

- Node.js `v22.23.2`: Backend lint, 32 suites / 416 unit tests, five suites / 21 HTTP e2e tests, typecheck, build, and the real-library production integration fixture passed. The fixture confirms 42 providers, 41 API-key interfaces, nine OAuth interfaces, 1,713 model operations, isolated auth resolution, worker failure handling, and zero provider requests.
- Prisma generation, formatting, and schema validation passed. The additive heartbeat migration was reviewed and not applied.
- Web formatting/lint, 193 tests, typecheck, production build, and the 18-locale i18n gate passed. Existing CSS/Biome and identical-term notices remain.
- Chrome DevTools Protocol: 29 assertions passed at 1440×900 light. The fixture uses real AI routes, real session authentication, real encryption and bridge logic, a Prisma protocol double, and dummy provider transports. It covers all nine enabled OAuth controls, device/manual flows, secret clearing, cancellation, real generic failures, formerly blocked API-key setup, settings retry, Security retention, and completion racing category recovery. No provider page was opened, no external browser request occurred, and no browser exception occurred. Captures remain outside Git.
- Independent read-only Backend review found no concrete issue. Frontend review found stale completed-recovery metadata; a fresh generation/revision-fenced settings fetch fixes it, and the browser fixture covers that race. Final diff review and whitespace checks passed. No image or binary file is intended for commit.
- Live-provider behavior and PostgreSQL locking are not claimed. They are not activation gates. Initial local formatting/type/lint and fixture startup/focus errors were fixed before the final passing runs.

## Risks and limits

- Providers can reject an account, client registration, scope, region, or authentication method. These are real runtime results, not reasons to disable a catalog method in advance. Provider terms still apply; Kestrel does not claim provider approval.
- Built-in provider login can create keys, enable model access, or change provider account policy after user consent. The agent must not perform those operations as a test.
- A Backend restart can interrupt a provider exchange. Mark interrupted work failed and require a new login. Do not retry a possibly consumed refresh token or authorization code without a safe rule.
- Actual PostgreSQL contention and live-provider behavior remain unverified unless separately authorized. Report that limit without using it as a provider activation gate.
- No logs or artifacts may contain real tokens, API keys, authorization codes, callback query strings, request bodies, or precise location payloads.

## Rollback / Recovery

- Roll back application entry points after stopping new login work. Retain additive schema columns during application rollback.
- Cancel pending jobs before key rotation or maintenance. Never restore disconnected credentials or cancelled attempts from caches or backups.
- Missing encryption fails closed; recover the operator key or reconnect. Do not store plaintext or reuse the TOTP key.
- Migration application, ciphertext rewrap, restore, deployment, and provider-side revocation remain separate authorized operations. No automatic down migration is provided.

## Completion Checklist

- [x] All 42 providers and every registry auth method can be selected and started when encryption is configured. No verification/policy allowlist or OpenRouter-only UI/API restriction remains.
- [x] Users see real provider interactions and can submit the required response; no false connected state or shared credential exists.
- [x] Ownership, encryption, state/PKCE, prompt single-use, expiry, restart, revocation, replacement, and disconnect tests pass.
- [x] Required repository checks and dummy browser checks pass. Remaining live/DB limits are stated accurately, not treated as activation blockers.
- [ ] Follow-up fixes are committed and pushed; the PR links #353 and records checks and risks. Archive this plan only after all applicable items have evidence.

Not applicable: provider permission reviews and agent-operated live-flow verification as release prerequisites. The user explicitly removed those gates. No live-provider or deployment success is claimed.
