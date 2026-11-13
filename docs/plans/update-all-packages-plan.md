# Consolidated package update

## Goal

Update Android, Backend, and Web packages to current stable releases and open one pull request that includes or supersedes all 13 listed Dependabot updates. Do not merge or close existing pull requests, deploy, change databases, or operate a device.

## Plan

- [x] Inspect manifests, the open Dependabot pull requests, runtime requirements, and available tools. Start from clean `origin/main` on `narumi/chore/update-all-packages`. Install the existing npm lockfiles before changes.
- [x] Check all direct npm and Gradle dependencies and update available stable versions. npm-check-updates reports no remaining stable direct updates. Keep both TypeScript aliases; align Prisma client, adapter, and CLI at 7.10.1 (8.0.0-rc.33 is not stable). Update eight Android catalog versions, Gradle to 9.9.1, the update recipe's npm-check-updates pin to 23.1.1, and CodeQL Action's verified commit pin to v4.39.3. Other action refs, pre-commit hooks, Foojay, and ktlint are current.
- [x] Refresh npm lockfiles with `npm update`, including `qs` 6.17.1 and `fast-uri` 3.1.9, then verify `npm ci` in both workspaces under Node.js 22.23.4. Use the published Gradle 9.9.1 distribution checksum and retain the verified existing wrapper JAR.
- [x] Resolve update-related compatibility failures without weakening gates. Replace Pi's removed `Type` re-export with its native `pi-schema` builders and test valid/invalid tool schemas. Refresh the pinned catalog fixture to 43 providers / 1,773 models. Migrate the Biome schema and correct one Markdown table's padding in its canonical source, then regenerate the published copy.
- [x] Run `just backend-check` under Node.js 22.23.4: Prisma generation, lint, 39 suites / 509 unit tests, 5 suites / 21 e2e tests, typecheck, and build pass. All three `npm run test:ai:integration` offline fixtures also pass, including source/compiled worker boundaries and zero provider network calls.
- [x] Run Web checks under Node.js 22.23.4: `just web-check`, `just web-lint`, `just web-test` (320 tests), `just web-typecheck`, `just web-build`, and `just i18n-check` (16 fixtures; 18 locale catalogs) pass. Biome reports 43 existing CSS warnings; CSS is unchanged. Production `next start` serves `/login` with HTTP 200. The changed CodeQL workflow passes `zizmor --offline` with no findings (two suppressed).
- [x] Run Android formatting, Detekt, resource lint, and JVM tests under Java 26.0.2 / Gradle 9.9.1. The checks pass: 50 suites / 269 JVM tests, no failures or skips; resource lint has zero errors, 83 warnings, and two hints.
- [ ] Finish Android debug build verification and rerun formatting after the update-recipe change.
- [ ] Complete Android screenshot comparison. `just android-ui` fails all 31 cases with `ScreenshotImageNotFoundException`: approved reference images are absent. No replacements were generated and the gate was not changed. This confirms the earlier `dependency-refresh-plan.md` blocker.
- [ ] Review dependency availability, audit output, final diffs, and staged paths. Commit only intended text files, push the branch, and create a consolidated pull request. Keep it in draft if a required gate remains blocked.

## Completion Checklist

- [x] Every listed Dependabot bump is included or superseded, and all direct package versions have been checked.
- [x] Lockfiles and wrapper checksums match the selected versions, with reproducible installs.
- [ ] Required workspace checks pass; retain any unavailable or failed checks as open items with evidence.
- [ ] The new pull request describes the update outcome, test evidence, remaining risks, and superseded pull requests.

## Scope and risks

- PostgreSQL and container runtime major upgrades need separate migration approval and are not part of this package update.
- Final npm audits: Web has zero findings; Backend production dependencies (`--omit=dev`) have zero findings. Backend's complete development graph has 29 findings (25 moderate, four low) from Jest/ESLint parsing dependencies. Current stable direct packages and compatible transitive updates do not remove them. Do not use forced audit downgrades, unsupported transitive overrides, or release candidates.
- Screenshot tooling remains on matched alpha16: the validation API advertises alpha17, but its matching Gradle plugin is not published (plugin POM returns HTTP 404).
- Chrome DevTools browser verification could not start because the MCP server's configured Linux Chromium executable is absent on this macOS host. HTTP startup was checked; browser hydration, map rendering, and physical-device behavior are not verified.
- A full offline zizmor scan also reports existing findings in unchanged workflows. The modified workflow passes its focused scan; no broad workflow-policy changes are included.
- Missing approved screenshot references can block Android screenshot comparison. Keep this plan active until the required evidence exists; do not alter the older plan to hide its unfinished check.
