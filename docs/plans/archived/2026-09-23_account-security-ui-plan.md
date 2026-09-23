# Account security UI

## Goal
Keep the Map account popover compact and move password changes to the existing `/dashboard/account` security page without changing the auth API or its 12–256 character password policy.

## Plan
- [x] Replace inline password controls in the Map account popover with appearance, security navigation, and separated logout; remove the redundant account-page popover.
- [x] Add a responsive password card to `/dashboard/account` with accessible visibility controls, client-side matching/length validation, and API success/error feedback.
- [x] Scope warm, opaque, light/dark styles to the popover and password card, including focus, hover, disabled, and feedback states.

## Completion Checklist
- [x] Web lint (44 existing warnings, no errors), targeted Biome check, typecheck, tests (30/30), and build pass.
- [x] Review diff for regressions, API contract, and small-screen behavior (single-column layout at 800px; existing `/auth/password/change` API and 12–256 character rule retained).
