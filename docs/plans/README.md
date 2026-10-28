# Kestrel plans

Top-level `*-plan.md` files are active. Closed or superseded plans live in `archived/`.

## Active files

1. [Personal AI provider settings](2026-10-22_personal-ai-provider-settings-plan.md) — proposed stage 1: per-user provider login, encrypted credentials, and account-backed model/thinking settings.
2. [Route assistant drafts](2026-10-22_route-assistant-drafts-plan.md) — proposed stage 2, depends on stage 1: restricted agent tools, candidate preview, explicit Apply, and existing manual Save.
3. [Road route planning](2026-10-22_road-route-planning-plan.md) — proposed stage 3, depends on stages 1–2: service selection, place search, road geometry, and bounded distance-based loops.

- `2026-10-18_cross-platform-i18n-plan.md` — add Android and Web localization for 18 languages, with English as the default, persistent language selection, complete catalogs, and regression checks.

- `dependency-refresh-plan.md` — Android, Backend, and Web dependency upgrades are implemented and verified except Android screenshot comparison, which needs approved reference images; keep the delivery PR in draft.
- `2026-10-05_behavior-preserving-simplifications-plan.md` — eight refactors implemented and under verification; Android screenshot validation lacks reference images and the historical QR e2e failure is not reproducible. Keep open until completion criteria have evidence.
- `2026-09-23_android-qr-login-plan.md` — add a short-lived, dual-confirmed Web-to-Android QR login flow with independent retry-safe Android sessions and no credentials embedded in the QR.
- `2026-09-23_web-workspace-information-architecture-plan.md` — clarify Map, Library, and Account ownership; add panel-aware Map layout, Library preview/sort/filter, dedicated Account settings, and consistent manual-save/sync semantics.
- `2026-09-12_android-favorites-preview-polish-plan.md` — searchable, scrollable Favorites and direct preview saving are implemented; retained for development on another computer, with Emulator verification pending and screenshot comparison awaiting approved reference images.
- `2026-08-09_android-app-workflow-redesign-plan.md` — redesign the Android app around previewable, confirmable mock-location workflows while preserving runtime, stored-data, cloud, remote-control, responsive, and accessibility behavior.

The Justfile workflow refinement, Web UI/UX optimization loop, Web Map workspace/route-inspector plans, 2026-08-10 Web Route editor redesign, 2026-09-22 Route workspace UI review, and the 2026-07-15 Options, Favorites, Web Library, and cross-platform UI regression plans are complete and archived in `archived/`.

The [2026-10-05 Web UI feedback pass](archived/2026-10-05_web-ui-feedback-plan.md) is complete: screen-space route marker density, a compact mixed Library with sorting and contextual notes, and shared Account navigation with on-demand password changes. Web checks and isolated Chrome DevTools verification passed; the broader workspace information architecture plan remains active.

The [2026-10-05 Web workspace UI polish](archived/2026-10-05_web-workspace-ui-polish-plan.md) completes the remaining shared mockup refinements: Path/Playback tabs and read-only route preview, zoom-aware labels and selected-row synchronization, aligned Library columns, smaller panel rounding, and production-safe MapLibre worker modules. Node.js 22 Web gates and isolated Chrome DevTools checks passed; delivered in [PR #330](https://github.com/narumiruna/kestrel/pull/330).

The [2026-10-18 Web Account settings plan](archived/2026-10-18_web-account-settings-plan.md) is complete: Account settings is the first menu action, with Preferences and Security in a left-navigation layout. Web gates, 18-locale validation, and isolated Chrome DevTools checks passed; existing security state and API contracts remain unchanged.

The [2026-10-28 Project structure cleanup](archived/2026-10-28_project-structure-plan.md) is complete: canonical public API documentation, Account CSS and navigation ownership, application-level Android remote-control lifecycle wiring, and ignored build caches. All local checks passed; physical-device verification limits remain documented in the plan and [PR #368](https://github.com/narumiruna/kestrel/pull/368).

The [2026-10-28 Task-first Web place editing](archived/2026-10-28_web-place-editor-ux-plan.md) is complete: apply the generated design proposal to the Place inspector, separate saved-location actions, fix clipped completion controls, and preserve distinguishing Library link text. Web checks, all 18 catalogs, and 28 native Chrome checks passed; see [PR #369](https://github.com/narumiruna/kestrel/pull/369), based on #368.

## Security references

- `../device-session-security.md` — session/device trust boundaries, step-up rules, revocation semantics, and remote-command cancellation limits.
- `../remote-control-api.md` — Android device registration, playback-state reporting, command polling/ACK, and device revocation contract.

## Rules

- Keep active plans small enough to act on.
- Archive completed or superseded plans immediately.
- Do not keep conditional or speculative ideas as unchecked active tasks; create a focused plan only when there is a concrete need.
- Avoid duplicate tracking: detailed tasks belong to one plan, while roadmap items should link to that evidence.
