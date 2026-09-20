# Repository simplification plan

## Goal

Reduce independent implementations of the same behavior across Backend, Web, Android, and repository tooling while preserving current API contracts, persisted data, UI behavior, security semantics, and user-visible text. Completion requires focused characterization tests, workspace quality gates, and a clean review showing no unintended schema, protocol, or generated-file changes.

## Context

The repository review confirmed these maintenance hotspots:

- Backend route-revision JSON is parsed independently in `library.models.ts` and `library.service.ts`, and serialized independently in library and sharing services.
- Backend sort-order allocation and sync-event insertion are duplicated across library, sync, and sharing services.
- Web share-link loading and mutation behavior is implemented in three components.
- Android stores library route modes as strings and repeatedly converts them to `MovementEngine.Mode`; random-route validation and route presentation formatting are also duplicated.
- Library and Map account menus independently implement the same password-change form.
- Validation configuration contains an obsolete NestJS binary check and hook commands that bypass canonical Just recipes.
- `web/tsconfig.tsbuildinfo` is a tracked generated cache.
- `SharingService` retains route-only forwarding methods that have no production callers.

The review baseline was clean. Focused Backend tests passed 38 cases, Web tests passed 13 cases, and focused ESLint, Biome, and Web TypeScript checks passed. Android tests could not start in the review environment because an Android SDK was not configured.

## Architecture

- Keep HTTP routes, request/response shapes, Prisma transactions, sync-event ordering, and security boundaries unchanged.
- Give Backend route-revision parsing and serialization one domain-owned codec; keep service orchestration explicit.
- Share only narrow Backend persistence primitives that represent existing library invariants; do not add a generic repository framework.
- Give Web share links one domain-specific hook and control surface while retaining item-specific copy and layout.
- Share the password form, not the distinct account-menu shells.
- Represent Android library route modes with `MovementEngine.Mode` in Kotlin while retaining the existing Room `TEXT` representation and legacy fallback.
- Keep domain validation near `RandomRoutePreference` and user-facing formatting in focused presentation helpers.
- Keep Just recipes authoritative for local validation and make hooks invoke those recipes or exact repository binaries.

## Non-Goals

- Do not change public HTTP endpoints, response payloads, route sharing semantics, sync conflict behavior, token/session behavior, or remote-control behavior.
- Do not change Prisma schema or existing migrations.
- Do not change the Android Room schema, persisted enum names, DataStore payloads, route generation, or `LocationService` behavior.
- Do not redesign Web or Android UI, alter user-visible copy, introduce another component library, or add a general request/state framework.
- Do not combine service orchestration merely to reduce line count.
- Do not run connected Android instrumentation, install/uninstall the app, clear app data, or add image binaries.

## Assumptions

- The Android Room converter can map `MovementEngine.Mode` to the existing `Once`, `Loop`, and `PingPong` strings without a schema migration.
- Share-link controls can share state and mutation behavior while accepting narrow presentation parameters for place/route wording and existing CSS classes.
- Web component behavior will be validated with existing static checks and Chrome because the repository has no React component-test harness.
- The obsolete NestJS prerequisite is not relied on by any supported Backend workflow; CI already invokes Hono/TypeScript commands directly.

## Discovery results

- Room schema identity is unchanged: version `2`, identity `ca31ac6542d7f35fc7552b09839c5db4`, legacy identity `00b698e68cd27dac7e1aca0157553714`. Generated `routes.mode` remains `TEXT NOT NULL`; no migration is needed.
- Share only the Web hook. Keep the three existing control surfaces because their loading policies, clipboard-failure copy, and dialog markup differ. Chrome verified close/reopen focus restoration for all four Map/Library × place/route workflows.
- The Android SDK exists at `/opt/homebrew/share/android-commandlinetools`. Set `ANDROID_HOME` to that directory; Java 26 comes from the existing Justfile default. Baseline JVM tests passed before Android implementation.

## Risks

- A route-revision codec change could alter malformed-data errors or waypoint sequence handling. Add characterization tests before replacing either implementation.
- Sharing Backend persistence primitives could accidentally reorder writes inside transactions. Preserve call sites and assert existing Prisma call order and payloads.
- Typing Android route modes could make unknown legacy values fail instead of falling back. Put the current `Once` fallback in the Room converter and test it directly.
- Shared Web controls could erase small place/route presentation differences. Keep copy, labels, and classes explicit and verify both workflows in Chrome.
- Password-form reuse touches an account-security path. Share only form state/submission UI and retain the existing authenticated request path.
- Android simplifications may invalidate evidence in the active Android workflow-redesign plan. Re-run affected Android checks and do not close or rescope that plan without its own acceptance evidence.

## Plan

### 1. Establish a reliable validation baseline

- [x] Replace the obsolete NestJS prerequisite in `justfile` with checks for the binaries actually used by Backend recipes, so `just backend-test` reaches Jest; accept with `just backend-test` passing from an installed lockfile.
- [x] Make `.pre-commit-config.yaml` use canonical Just recipes or exact local binaries for Spotless and Biome, so hooks cannot install an unrelated package or drift from documented commands; accept with `just android-check`, `just web-check`, and a non-writing hook check.
- [x] Remove tracked `web/tsconfig.tsbuildinfo` and ignore `*.tsbuildinfo` in `web/.gitignore`, so Web typechecking retains a local cache without generated Git diffs; accept by running Web typecheck twice and confirming `git status --short` remains clean for the cache.
- [x] Update only documentation or durable memory entries made obsolete by the validation changes, and verify every documented command against the final Justfile.

### 2. Consolidate Backend route and library persistence behavior

- [x] Add route-revision codec characterization tests for valid payload mapping, malformed top-level values, malformed waypoints, nullable metadata, out-of-order sequences, derived sequences for new routes, and retained explicit sequences for copied revisions; accept with the focused model/service suites passing before refactoring callers.
- [x] Introduce one library-owned route-revision parser and serializer, then replace the duplicate implementations in `library.models.ts`, `library.service.ts`, and `sharing.service.ts`; accept with unchanged API snapshots and the library/sharing tests passing.
- [x] Move next-sort-order allocation and sync-event insertion into a focused library persistence module without moving transaction orchestration out of services; accept with existing library, sync, and sharing Prisma expectations and event ordering unchanged.
- [x] Remove `SharingService.getSharedRoute` and `SharingService.copySharedRoute`, update tests to call the production `getSharedItem` and `copySharedItem` methods, and confirm no production caller remains with `rg`.
- [x] Run Backend formatting check or formatter as needed, lint, unit tests, E2E tests, typecheck, and build as separate bounded commands; record any unavailable gate rather than bypassing it.

### 3. Consolidate Web share and account behavior

- [x] Extract a domain-specific share-link hook that owns GET/404, POST, PATCH, mutation state, error formatting, notices, and clipboard outcomes for a supplied item kind and ID; accept by exercising the same state transitions for places and routes.
- [x] Replace the share implementations in `PlaceEditor`, `RouteSharePanel`, and `LibraryItemActions` with the shared hook and, where it stays simpler, shared controls; preserve each component's copy, CSS classes, loading text, and dialog structure.
- [x] Extract one password-change form for `DashboardShell` and `UserMark`, preserving autocomplete fields, minimum length, payload, success/error text, and each shell's theme, navigation, and logout controls.
- [x] Run Web tests, Biome check, TypeScript, and production build as separate bounded commands.
- [x] In Chrome, verify place and route share-link creation, disable/re-enable, copy, and public-page opening from Map and Library, then verify successful and rejected password changes from both account-menu variants; keep captures outside the repository.

### 4. Remove Android route and random-route representation duplication

- [x] Add focused tests for `MovementEngine.Mode` Room conversion, including existing names and an unknown legacy value falling back to `Once`; confirm the generated Room schema remains unchanged before proceeding.
- [x] Change library route models, entities, repository APIs, builders, and DAO-facing calls from `String` mode values to `MovementEngine.Mode`, and remove caller-side `valueOf` conversions while retaining the database `TEXT` representation.
- [x] Share one `CloudRouteMode` to `MovementEngine.Mode` conversion between cloud sync and remote-command execution; accept with cloud mapper and remote-command executor tests.
- [x] Move random-route point-count and spacing validity rules next to `RandomRoutePreference`, add boundary tests, and use them from Map and Settings.
- [x] Add focused presentation helpers for random-route meter/distance text and route mode/speed labels, replace duplicate Map, Favorites, Settings, workflow-summary, and playback-bar implementations, and preserve every asserted string.
- [x] Run the narrow Android JVM suites for library, cloud mapping, remote commands, Map workflow/rendering, Options, Favorites, and playback presentation during iteration.
- [ ] Run `just android-check`, `just android-lint`, `just android-test`, `just android-ui`, and `just android-build` as separate bounded commands; do not update or commit screenshot binaries.

### 5. Complete cross-workspace verification and review

- [x] Review the final diff for accidental API, Prisma schema, Room schema, migration, user-visible copy, CSS, generated output, or binary changes; reject unrelated cleanup.
- [ ] Run Backend, Web, and Android gates affected by the final diff, with each command bounded and independently recorded.
- [x] Confirm `git status --short` contains only intended source, test, documentation, ignore, and plan changes; confirm no image binary is tracked or staged.
- [ ] Perform a requirement-by-requirement review against this plan and obtain user acceptance before archiving or deleting the plan.

## Verification evidence and remaining gates

Implementation and available validation are complete; this plan remains active pending screenshot references and user acceptance. No unavailable check has been waived.

| Area | Evidence |
| --- | --- |
| Baseline/tooling | `npm ci` completed in both workspaces without lockfile changes. `just backend-test` reaches Jest (131 baseline tests). `prek validate-config .pre-commit-config.yaml` and non-writing `prek run check-yaml check-json check-toml check-merge-conflict biome --all-files` pass. Canonical Android/Web hooks also executed successfully. |
| Backend | Focused codec tests passed before caller replacement. Final lint, unit tests (21 suites / 139 tests), E2E (3 suites / 8 tests), typecheck, and build pass under Node.js 22.23.2. Existing library/sync/sharing payload and ordered event expectations remain unchanged. Changed TypeScript files pass Prettier. |
| Web | `just web-check` (69 files), 13 tests, typecheck, and production build pass, including under Node.js 22.23.2. Typecheck ran twice; the local `.tsbuildinfo` cache is ignored and absent from the index. |
| Chrome | A production Next.js server on loopback and a separate headless Chrome profile were driven through Chrome DevTools Protocol, not Playwright. All 67 API requests were intercepted with synthetic fixtures; no real account or database was changed. Map/Library × places/routes passed GET error/404, rejected/successful POST and PATCH, clipboard rejection/success, disable/re-enable, dialog close/reopen focus, and public-page navigation. Public anchors retain `_blank` and `noreferrer`. Both password menus passed rejection/success, exact payload, autocomplete/minimum length, successful field clearing, and their original close/reopen lifetimes. This validates UI behavior, not a live PostgreSQL integration. |
| Android | With the discovered SDK and Java 26, `just android-check`, `just android-lint`, `just android-test` (154 tests; no failures/errors/skips), and `just android-build` pass. Iteration included library, cloud mapper, remote-command, Map/render/workflow, Options, Favorites, and playback suites. New tests cover three Room names, unknown fallback, all cloud modes, inclusive/random invalid boundaries, locale behavior, and distinct fractional speed precision. Room identity and SQL are unchanged. |
| Screenshot blocker | `just android-ui` ran but all 12 cases failed with `ScreenshotImageNotFoundException`: reference images are absent. No baselines were created/updated and no images were staged. Existing references or explicit user disposition are needed; Android and aggregate completion gates remain open. |
| Review | Reviewed every source/test/tooling diff and new helper, checked duplicate removal with `rg`, and ran `git diff --check`. No HTTP routes, Prisma schema/migrations, DataStore schema, service lifecycle code, CSS, dependency versions, or lockfiles changed. Only the intended generated TypeScript cache is untracked. |

Risk disposition:

- Codec and persistence risks are covered by characterization and existing service assertions; transaction ownership and event order stay at their original call sites.
- Room conversion uses the original supported names and moves the existing unknown-value `Once` fallback to the storage boundary. It performs no database rewrite.
- The shared password hook is called in each original state-owning shell: Map retains state on close; Library resets when its account content unmounts. Authentication requests remain in their existing callers.
- A broad hook probe found a pre-existing missing final newline in `.github/workflows/deploy.yml`; its automatic edit was reverted. The focused non-writing hook check passes, and that unrelated workflow is not part of this change.
- `npm ci` reports existing dependency audit findings (Backend: 2 moderate / 5 high; Web: 1 moderate). Dependency remediation is outside this behavior-preserving refactor; no audit fix or dependency update was applied.
- Screenshot evidence and explicit user acceptance remain unresolved. Do not archive/delete this plan or close the separate Android workflow plan on this PR's evidence.

## Rollback / Recovery

- No production migration or data rewrite is planned. If Prisma or Room reports a schema change, stop before release and revert the representation change or create a separately reviewed migration plan.
- Each workspace phase is independently revertible because public protocols remain unchanged. If a shared helper cannot preserve existing behavior, restore the prior caller and keep the characterization tests.
- If Web manual verification finds focus or presentation regressions, retain the shared share-link hook or password submission logic while restoring the affected component markup.

## Completion Checklist

- [x] Backend has one route-revision codec and one implementation of library sort-order and sync-event persistence primitives.
- [x] Web has one share-link state/mutation workflow and one password-change form implementation.
- [x] Android library routes use a typed mode with unchanged Room storage and legacy fallback.
- [x] Random-route validation and route presentation labels are each defined once at an appropriate ownership boundary.
- [x] Just recipes and hooks use current Hono, Gradle, and repository Biome tooling without obsolete or implicit package resolution.
- [x] Generated TypeScript build info is ignored and absent from tracked changes.
- [x] SharingService forwarding aliases are removed with no production caller or HTTP change.
- [x] Backend lint, unit tests, E2E tests, typecheck, and build pass.
- [x] Web tests, Biome, typecheck, build, and specified Chrome workflows pass.
- [ ] Android formatting, Detekt, JVM tests, screenshot validation, and debug build pass without connected-device or destructive operations.
- [x] No public API, Prisma schema, Room schema, persisted value, security behavior, user-visible text, or image binary changed unintentionally.
- [ ] User acceptance is recorded and the completed plan is archived or deleted according to repository plan policy.
