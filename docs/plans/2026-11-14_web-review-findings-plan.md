# Web review findings plan

## Goal

Resolve the six source-review findings in Web uploads, coordinate previews, Place draft refresh, library request ordering, password retries, and browser history. Add regression evidence and open one pull request without changing database schema, physical devices, or production services.

## Context

- Review baseline: `a21c561` on `main`.
- The proxy bounds only AI and Route uploads; other mutation bodies are fully buffered before Backend's 100 KiB limit.
- Place preview accepts any finite latitude, while MapLibre rejects values outside `[-90, 90]`.
- Library loading depends on the complete authentication context and does not reject stale reads. The Map Place effect clears drafts on saved-object identity changes.
- The authentication wrapper retries domain 401 responses as expired sessions.
- Map protects explicit navigation and document unload, but not same-document Back/Forward. The same browser-history issue is already recorded in the workspace information architecture plan; this task does not take over its unrelated redesign scope.

## Architecture

- Reuse the existing bounded upload budget and deadlines for all proxy bodies. Public authentication endpoints remain available without a session.
- Keep invalid coordinate text local; only valid geographic coordinates enter map previews.
- Preserve dirty Place state across server refreshes, use stable authenticated transport dependencies, and commit only current per-resource library reads.
- Distinguish current-password rejection from token authentication failure without weakening session expiry recovery or password throttling. Backend adds `INVALID_CURRENT_PASSWORD` to existing 401 responses; Web excludes that code from refresh/replay. Deploy the matching Backend and Web changes together.
- Use one draft-exit policy for explicit actions, Sign out, Back/Forward, and document unload. A root history tracker tags existing entries and restores the current entry before requesting confirmation. It adds no sentinel entries. Capture-phase handling keeps Next.js from unmounting the dirty editor; accepted traversal replays once. Next.js state is preserved.

## Plan

- [x] Confirm available local dependencies, regression fixtures, and browser access. Web/Backend dependencies and local Chrome are present. The MCP browser path is invalid on this host; direct Chrome DevTools Protocol uses an isolated headless profile and dummy local fixtures instead.
- [x] Bound default proxy request bodies and add tests for declared/streamed oversize, valid public authentication bodies, cancellation, deadlines, and capacity release. `backendProxy.test.ts` exercises the same forwarding helper as the route; Chrome confirms anonymous oversize is rejected before fixture login receives it.
- [x] Prevent current-password rejection replay and test both one-attempt domain failure and retained expired-token recovery. Web retry tests and Backend password/step-up tests pass; Chrome confirms one rejected password submission with no credential refresh.
- [x] Add per-resource library read generations and tests for older refresh completion after deletion/new reads and route upserts. Remove token-only reload dependencies. Sixteen deferred-transport tests pass; Chrome verifies delayed refresh after Delete and cross-tab credential rotation.
- [x] Validate Place preview coordinates and preserve existing/new dirty drafts on refresh; add regressions for invalid text and same-session credential changes. Coordinate/draft tests cover invalid and incomplete text, clean/dirty refresh, discard baseline, and save rebasing; Chrome keeps latitude `100` and `-` editable without a workspace error.
- [x] Extend draft navigation protection to browser Back/Forward and Sign out. Test cancel/confirm, exact-once traversal, clean navigation, query entries, repeated cancellation, focus recovery, and history-state preservation. Ten history/action tests pass, including rapid Back and native fragments. Chrome verifies same-Place query discard, repeated Back cancellation, dirty Forward, focus recovery, and cancelled/confirmed Sign out.
- [x] Run Web format/lint/tests/typecheck/build, relevant Backend lint/tests/e2e/typecheck/build, and Chrome checks at 1440×900 in light mode. Keep captures outside Git and record results. All required local gates pass; details are below.
- [ ] Review the complete diff, update completion evidence, stage only intended text files, commit, push, and open a Conventional Commits pull request that summarizes the outcome.

## Validation

- Web: `just web-check`, `just web-lint`, `just web-test` (366 tests), `just web-typecheck`, and `just web-build` pass on Node.js 22.23.4. Biome reports 43 existing specificity warnings in unchanged CSS files, with no errors.
- Backend: lint, unit tests (39 suites / 517 tests), e2e tests (5 suites / 21 tests), typecheck, and production build pass.
- `just i18n-check` passes, including 16 validator tests; public documentation checks pass, including 10 generator tests.
- `scripts/verify-web-review-browser.mjs` passes 24 Chrome 157 checks against the current production Web build and loopback-only fixtures at 1440×900 in light mode. There are no application runtime exceptions. External page requests are intercepted; live tiles, provider inference, real accounts, production services, and physical devices are not used.
- Browser evidence: `/var/folders/1z/_34kfpzn7q37z3rk3t15jtgh0000gn/T/kestrel-web-review-8tkKiN/results.json` and `draft.png`, both outside Git.
- An independent final source review reports no actionable findings after the browser-history and Place discard integration corrections.

## Risks

- Browser traversal cannot be cancelled with `popstate.preventDefault()`; the draft must remain mounted until the user confirms. Validate Next.js integration in Chrome, not only with a pure model.
- Stale library reads and successful saves must use the same invalidation boundary.
- Domain authentication failures must still count once toward existing throttling and must never disable token-expiry recovery.

## Rollback / Recovery

Revert the scoped code changes if regression gates fail. There is no migration or data rewrite. Keep previous session, remote-command, and API ownership semantics; do not deploy or merge this pull request as part of this task.

## Completion Checklist

- [x] All six findings have tested fixes, with no unresolved implementation correctness issue.
- [x] Web and affected Backend gates pass; Chrome verifies draft/history and coordinate behavior with dummy data.
- [x] The final diff contains only intended text files, no binary images, generated caches, secrets, or unrelated changes. The staged diff contains 27 intended text paths; `git diff --cached --check` and the binary-file check pass.
- [ ] The commit is pushed and a pull request is open; no merge, release, deployment, or device operation was performed.
