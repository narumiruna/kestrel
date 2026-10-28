# Project structure cleanup

## Goal

Resolve the five directory-structure review findings without changing user workflows, remote-control permissions, or playback behavior.

## Plan

- [x] Publish the remote-control API and its security reference from canonical `docs/` sources. Keep generated public copies for the Web-only Docker build context; add generation checks and failure tests.
- [x] Consolidate Account CSS ownership while preserving current styles. Move generic navigation click handling and its tests beside shared navigation code; keep the Map draft guard route-local.
- [x] Remove the location-to-cloud dependency. Put remote-control lifecycle wiring at the application boundary, initialize cloud services only when remote control is enabled, and preserve foreground/service polling leases and runtime-state notifications. Add JVM regression tests for lifecycle transitions.
- [x] Ignore TypeScript build caches and remove the tracked Web cache from the Git index without deleting the local cache.
- [x] Run Android formatting, lint, resource checks, JVM tests, and debug build; run Web formatting, lint, tests, typecheck, production build, and canonical-document checks. Verify the unchanged Account layout in Chrome DevTools when local browser execution is available.
- [x] Review the full diff, commit only intended text files, push a new branch, and open a pull request.

## Completion Checklist

- [x] Public documentation matches canonical sources, and linked security documentation is available.
- [x] Account styling has one owner; shared navigation does not import Map route internals.
- [x] Local playback has no cloud dependency or unconditional cloud initialization; remote-control lease behavior has regression coverage.
- [x] No generated TypeScript cache or image binary is staged.
- [x] All affected checks pass, or concrete blockers remain recorded without a completion claim.
- [x] The new pull request summarizes the outcome, checks, and unverified external behavior.

## Validation Evidence

- Delivery: [PR #368](https://github.com/narumiruna/kestrel/pull/368) opened from `narumi/refactor/project-structure`; implementation commit `bf6ad8a` passed all Git hooks. The pull request includes the check results and physical-device verification limits.

- Android: `just android-check`, `just android-lint`, `just android-resource-lint`, `just android-test` (259 tests), and `just android-build` passed with Java 26. The first resource-lint invocation exceeded the bounded execution window; the separate rerun passed.
- Web: `just web-check`, `just web-lint`, `just web-test` (198 tests), `just web-typecheck`, and `just web-build` passed with Node.js 22. Biome reports 41 CSS-specificity warnings and no errors.
- Documentation: `just public-docs-check` passed, including 10 generator regression tests. All three published documents match their canonical sources and retain their relative links.
- Localization: `just i18n-check` passed, including 16 validator tests and all 18 locale catalogs.
- Backend: `just backend-check` passed (418 unit tests and 21 e2e tests); `npm run test:ai:integration` passed with zero network calls. An initial unit-test timeout during concurrent checks did not recur in the separate full rerun.
- Chrome 156 DevTools Protocol: compared baseline and current computed styles, pseudo-elements, and geometry for a 105-element Account fixture at 1440×900 in light mode, both idle and with a focused password input. Both comparisons had zero differences. The screenshot is outside the repository at `/tmp/kestrel-project-structure-account.png`. This fixture check does not verify an authenticated end-to-end Account workflow.
- Source checks confirm that `core/location` imports no `core/cloud` code and shared Web components import no route-internal modules. The Web cache remains on disk and is ignored after index removal. `git diff --check` passed; the pre-existing root `PLAN.md` retains its original modification time and is excluded from staging.

## Risks

- Lifecycle changes must retain command polling during active background playback, after process restart, and while the app is foregrounded. Stop, failure, replacement, and teardown must release only the correct lease.
- CSS consolidation must retain selector specificity and responsive behavior. This task does not redesign the UI.

## External Handoff

Physical-device remote-control smoke tests require the device owner's explicit approval because connected instrumentation can change app-private and mock-location state. No device commands are authorized by this task. JVM and compile checks do not verify Android process death or physical-device command delivery; report this limit in the pull request.
