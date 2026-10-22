# Personal AI Provider Settings

Status: Proposed. This plan authorizes no implementation, live provider login, database operation, or deployment.

## Goal

Let each Kestrel user connect their own AI provider account and save their default provider, model, and thinking level in Account settings. Never use a shared AI account or another user's credential.

## Context

- `web/app/dashboard/account/page.tsx` and `accountNavigation.ts` currently provide Preferences and Security categories. Add AI assistant as a separate category; retain current hashes, legacy links, and pending Security state.
- `backend/prisma/schema.prisma` has no AI settings or credential models. Existing OIDC links identify a Kestrel user; they do not authorize AI inference.
- Research used the locally installed `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` 1.4.0. Verify package identity, exact compatible versions, Node.js 22 support, and Backend module loading before adding dependencies.
- Pi provides an app-owned `CredentialStore`, provider auth interfaces, and `getSupportedThinkingLevels(model)`. Built-in OAuth implementations can use Node-only localhost callbacks; they are not a hosted Web authorization flow.
- This is stage 1 of 3. [Route assistant drafts](2026-10-22_route-assistant-drafts-plan.md) consumes this plan's settings and credential boundary. [Road route planning](2026-10-22_road-route-planning-plan.md) extends the assistant later.

## Architecture

- Account → AI assistant owns provider connections and account-backed defaults. Map shows the selected configuration and a guarded settings link, not another credential form.
- Scope credential storage to `userId + providerId`, with one connection per provider. Separate non-secret preferences and connection status from encrypted credentials.
- Create user-scoped Pi model/auth objects. Disable ambient provider credentials, shared `auth.json`, cloud identity fallback, and executable key commands. An unconfigured or failed connection must stop, not select another credential.
- Save only supported model/thinking combinations. On model change, show any required thinking adjustment before saving; do not silently substitute a model or billing source.
- Encrypt recoverable API keys and OAuth tokens with authenticated encryption and owner/provider binding. Keep encryption keys outside the database, backups, source, and API responses. Document rotation and recovery.
- Serialize refresh, replacement, and disconnect per user/provider across Backend processes. Recheck credential generation before persisting refresh results so a late refresh cannot restore a disconnected connection.
- Provider login is separate from Kestrel login and identity linking. Bind short-lived authorization attempts to the authenticated user/session/provider, with PKCE S256, state validation, exact callback rules, expiry, cancellation, and single-use completion.
- Kestrel never asks for a provider password. Secrets are submitted only through the selected provider flow or an explicit API-key field over HTTPS. Show that server-side inference lets the Kestrel server access the credential and required request data.

## Provider Scope and Discovery Gates

1. OpenRouter OAuth PKCE is the proposed first hosted sign-in flow. Authorization yields a user-controlled API key charged to that user's OpenRouter account.
2. OpenAI / ChatGPT requires a hosted-Web proof of concept: client registration, allowed callbacks, permissions, model access, token lifecycle, and current provider terms. Do not claim that Pi's CLI login already proves this.
3. Anthropic must not expose Claude subscription login in Kestrel. A user-owned Claude Console API key can be offered only if the user approves API-key setup as part of the supported provider set.

Agree the launch provider matrix before implementation. Record supported methods and rejected methods with official references. An unresolved required provider is a blocker, not a reason to mark the plan complete. Do not replace requested account login with API-key entry without explicit acceptance.

## Non-Goals

- No shared platform inference account, arbitrary provider URLs, local-server discovery, multiple accounts for one provider, or credential import from a user's local Pi installation.
- No route assistant UI, model-generated route, persistent conversation history, Android settings UI, or device command changes.
- No provider-password collection or claim that local disconnect revokes the credential upstream.

## Plan

- [ ] Confirm the launch provider matrix and OAuth/API-key expectations with the user; record current official policy evidence and the accepted OpenAI proof-of-concept outcome before implementation.
- [ ] Verify the selected Pi package versions in an isolated Node.js 22 integration fixture; prove Backend import/build compatibility, supported-thinking lookup, user-scoped auth, and no ambient credential fallback without paid inference.
- [ ] Define the settings, connection-status, and authorization-attempt API contracts; include ownership, bounded input, safe error codes, configuration generation, expiry, and the existing session-auth boundary. Verify missing/expired sessions and cross-user access with fixtures.
- [ ] Add reviewable additive Prisma migrations for preferences, encrypted connections, and authorization attempts; define unique ownership keys, expiry cleanup, and credential generation. Run `npm run prisma:generate`; review schema and migration SQL without applying a database change until separately authorized.
- [ ] Implement the credential-store adapter and encryption boundary; test two-user isolation, secret-free listing, unavailable encryption keys, concurrent refresh, lost refresh responses, replacement during refresh, disconnect during refresh, and Backend restart. Failed refresh must retain a reconnect state without using another credential.
- [ ] Implement only approved hosted authorization adapters; test state/PKCE mismatch, callback replay, expiry, denial, cancelled attempts, wrong-user completion, duplicate completion, and session revocation. Do not expose a CLI loopback listener as a public callback.
- [ ] Add Account → AI assistant navigation and provider connect/reconnect/disconnect controls, model selection, supported thinking choices, and independent loading/error states. Test hash navigation, Back/Forward, language refresh, and retention of existing Security forms and operations.
- [ ] Route Map settings links and provider-authorization departures through the existing draft-action boundary; fix any bypass in that path. Test cancellation retaining the exact draft and confirmation navigating once. Do not implement auto-save or promise reload-safe drafts.
- [ ] Define disconnect as removal of Kestrel's stored connection plus invalidation of active runs and pending authorization attempts; distinguish upstream revocation and provide provider-specific instructions. Kestrel sign-out must end session-owned work but need not delete the user's saved provider connection.
- [ ] Add complete messages in all current `web/messages/*.json` catalogs and document connection methods, who pays for inference, server access to secrets, reconnect behavior, and disconnect limits.
- [ ] Verify at 1440×900 light mode with Chrome DevTools and dummy provider fixtures; cover keyboard/focus behavior, pending login, reconnect, and settings failures. Live authorization, paid calls, and real account changes require explicit approval; otherwise retain their acceptance gates as blocked.
- [ ] Run Web formatting/lint/tests/typecheck/build, `just i18n-check`, Backend lint/unit/e2e/typecheck/build, and `git diff --check`. Run commands separately, each within 180 seconds; split longer checks into observable steps. Use `npm ci` first when dependencies are absent or lockfiles change. Keep secrets, captures, generated caches, and unrelated files out of the diff.

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

- [ ] The user-approved provider matrix has implemented and verified sign-in methods; unsupported methods are absent, not placeholder controls.
- [ ] Two users can save different provider/model/thinking settings and cannot read, use, replace, or disconnect each other's credentials.
- [ ] OAuth and refresh failure/race tests pass; no shared credential, ambient fallback, or secret exposure is possible through the tested paths.
- [ ] Settings and authorization departures preserve unsaved Map drafts until explicit confirmation.
- [ ] All required checks and approved live-flow evidence are recorded. Unavailable live-provider acceptance remains open.
- [ ] Review the full diff and archive this plan only after every required item has evidence. Do not move unfinished work into another plan to close it.

## References

- [OpenRouter OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)
- [OpenAI Sign in with ChatGPT](https://developers.openai.com/siwc)
- [Anthropic authentication and credential use](https://code.claude.com/docs/en/legal-and-compliance)
- [Current Account settings baseline](archived/2026-10-18_web-account-settings-plan.md)
