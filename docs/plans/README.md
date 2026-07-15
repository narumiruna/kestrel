# Kestrel plans

Top-level `*-plan.md` files are active. Closed or superseded plans live in `archived/`.

## Active files

Recommended execution order:

1. `2026-07-15_android-options-progressive-disclosure-plan.md` — reduce Options density while preserving safety/status state.
2. `2026-07-15_android-favorites-action-hierarchy-plan.md` — remove duplicate row actions without losing management capability.
3. `2026-07-15_web-mobile-library-density-plan.md` — compact mobile Library actions and unify route-mode labels.
4. `2026-07-15_cross-platform-ui-regression-accessibility-plan.md` — add stable visual/a11y regression coverage after the UI changes settle.

## Security references

- `../device-session-security.md` — session/device trust boundaries, step-up rules, revocation semantics, and remote-command cancellation limits.
- `../remote-control-api.md` — Android device registration, playback-state reporting, command polling/ACK, and device revocation contract.

## Rules

- Keep active plans small enough to act on.
- Archive completed or superseded plans immediately.
- Do not keep conditional or speculative ideas as unchecked active tasks; create a focused plan only when there is a concrete need.
- Avoid duplicate tracking: detailed tasks belong to one plan, while roadmap items should link to that evidence.
