# Kestrel plans

Top-level `*-plan.md` files are active. Closed or superseded plans live in `archived/`.

## Active files

- `2026-09-23_web-workspace-information-architecture-plan.md` — clarify Map, Library, and Account ownership; add panel-aware Map layout, Library preview/sort/filter, dedicated Account settings, and consistent manual-save/sync semantics.
- `2026-09-12_android-favorites-preview-polish-plan.md` — searchable, scrollable Favorites and direct preview saving are implemented; retained for development on another computer, with Emulator verification pending and screenshot comparison awaiting approved reference images.
- `2026-08-09_android-app-workflow-redesign-plan.md` — redesign the Android app around previewable, confirmable mock-location workflows while preserving runtime, stored-data, cloud, remote-control, responsive, and accessibility behavior.

The Justfile workflow refinement, Web UI/UX optimization loop, Web Map workspace/route-inspector plans, 2026-08-10 Web Route editor redesign, 2026-09-22 Route workspace UI review, and the 2026-07-15 Options, Favorites, Web Library, and cross-platform UI regression plans are complete and archived in `archived/`.

## Security references

- `../device-session-security.md` — session/device trust boundaries, step-up rules, revocation semantics, and remote-command cancellation limits.
- `../remote-control-api.md` — Android device registration, playback-state reporting, command polling/ACK, and device revocation contract.

## Rules

- Keep active plans small enough to act on.
- Archive completed or superseded plans immediately.
- Do not keep conditional or speculative ideas as unchecked active tasks; create a focused plan only when there is a concrete need.
- Avoid duplicate tracking: detailed tasks belong to one plan, while roadmap items should link to that evidence.
