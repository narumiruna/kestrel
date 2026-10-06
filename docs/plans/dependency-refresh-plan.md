# Dependency refresh

## Goal

Update Android build tooling/libraries and Backend/Web direct and locked dependencies to current releases, including the eight listed Dependabot bumps, without deployments, database changes, or device operations.

## Plan

- [x] Inspect manifests, runtime requirements, update recipes, and available npm/Gradle releases. Branch `narumi/chore/dependency-refresh` starts at `origin/main`; preserve the unrelated untracked `PLAN.md`.
- [x] Update npm manifests and lockfiles, preserving TypeScript aliases and matched Prisma versions. Run `npm update` for compatible transitive releases and `npm ci` after lockfile changes. Stable Prisma remains 7.10.0; do not adopt 8.0.0-rc.20.
- [x] Update the Gradle wrapper to 9.8.0 with the published distribution checksum, regenerate the wrapper, and verify the JAR checksum. Refresh the version catalog: Core KTX 1.19.1 and Spotless 8.10.3. Check the separately configured Foojay plugin (already current at 1.0.0) and ktlint (updated to 1.8.0).
- [x] Resolve compatibility issues: transform ESM-only jose JavaScript with the existing ts-jest dependency in both Jest configurations; verify compiled CommonJS OIDC loading on Node.js 22.23.3. Apply ktlint's new branch formatting, clarify unchanged operator precedence, and extract the QR retry content to keep Detekt's 80-line limit. Replace the obsolete Nest binary prerequisite in the Backend Justfile guard with the TypeScript compiler actually used by this Hono workspace. Document the runtime/test loading distinction in `backend/README.md`.
- [x] Run Backend Prisma generation, lint, unit tests, mocked e2e, typecheck, and build through `just backend-check` under Node.js 22.23.3: 25 suites / 258 unit tests and 4 suites / 11 e2e tests pass. OIDC tests use real jose signing/verification, including invalid-token and retry cases; no live database is used.
- [x] Run Web formatting/lint, tests, typecheck, and production build under Node.js 22.23.3. `just web-check`, `just web-lint`, `npm test` (66 tests), `npm run typecheck`, and `npm run build` pass. Biome reports existing CSS warnings (44 warnings and one informational diagnostic); CSS is unchanged. `npm audit` reports zero Web vulnerabilities after transitive updates.
- [x] Run Android formatting, Detekt, JVM tests, and debug build under Java 26.0.2 with Gradle 9.8.0: `just android-check`, `just android-lint`, `just android-test` (40 suites / 215 tests), and `just android-build` pass.
- [ ] Complete Android screenshot validation. `just android-ui` compiles the screenshot sources but fails all 31 cases with `ScreenshotImageNotFoundException`: this checkout has no reference images. Approved reference images are required; no baseline updates, skipped tests, or image commits are used to bypass this gate.
- [x] Review source/configuration and lockfile diffs, wrapper provenance, npm upgrade availability, and final scope. `git -c core.whitespace=cr-at-eol diff --check` respects the generated Windows wrapper's CRLF line endings. Preserve unrelated work; do not stage generated images or caches.

## Completion Checklist

- [x] All direct dependencies have been checked for current compatible releases; the eight requested bumps are included or superseded by newer releases.
- [x] Lockfiles and wrapper checksums match the selected releases; clean npm installs and regeneration were verified.
- [ ] All affected workspace checks pass. Android screenshot validation remains blocked on missing approved reference images; keep this plan active and the PR in draft until that evidence exists.
- [x] Only intended source, package, wrapper, documentation, and recipe files changed; no schema/migration, image, database, or device changes occurred. Git push and PR creation are explicitly authorized; no publication, tag, release, deployment, or merge is authorized.

## Risks and unverified paths

- No Android screenshot comparison is available without approved reference images. Windows wrapper execution and browser/device interactions were not tested locally.
- Backend `npm audit` still reports 24 transitive findings (20 moderate, 4 high), including Prisma's deepmerge-ts/mysql2 graph and Jest/ts-jest's legacy parsing dependencies. `--omit=dev` still reports the four high Prisma-chain findings. Current stable direct dependencies and compatible transitive updates do not eliminate them; npm's proposed fixes downgrade major tooling. Do not apply forced downgrades, unsupported major overrides, or Prisma release candidates in this refresh. The application uses PostgreSQL, not MySQL; this does not mean the advisory graph is clean.
- Existing Gradle experimental/deprecation notices, Kotlin unused-expression warnings, and native-library strip notices remain. No checks or signing guards were weakened.
- PostgreSQL/container runtime major upgrades are outside this package/library refresh because they require a separate data migration and approval.
- Archive this plan only after screenshot validation passes; do not reclassify the missing evidence as completion.
