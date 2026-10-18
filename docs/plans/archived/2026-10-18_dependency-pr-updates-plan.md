# Dependency PR updates

## Goal

Combine the nine open Dependabot updates (#333 and #337–#344) into one PR against `main`. Leave the original PRs open and unmerged. Do not deploy, change database or device state, or update unrelated dependencies.

## Plan

- [x] Inspect all nine dependency diffs, original CI results, review threads, and the clean base at `9db6400`. Each original PR has passing affected-workspace CI and no review threads.
- [x] Apply all nine updates and resolve only the overlapping Web dependency lines. Preserve package aliases and the original PR lockfile changes. Official Gradle checksums match: distribution `dce76f55f8e251a3a1f130eb120f30b3d271de2b76c9b0729d316b5a1b6dc01f`, wrapper JAR `3b8a25775a69158b5ad2b1d17a80a88dc7b40a352a73eb27d06c612a7ce68e98`.
- [x] Install both exact lockfiles with Node.js 22.23.2. `just backend-check` passes Prisma generation, lint, 258 unit tests, 11 mocked e2e tests, typecheck, and build. `just web-check`, `just web-lint`, 88 Web tests, typecheck, and production build pass.
- [x] Combined-branch CI run [39095867968](https://github.com/narumiruna/kestrel/actions/runs/39095867968) passes Android formatting, Detekt, JVM tests, and debug build under Java 26 at dependency commit `bf7f19b`; Backend and Web jobs also pass. Local discovery found Java 27 and no Android SDK; no unsupported runtime was substituted.
- [x] Review the final dependency and lockfile diff: only the nine requested updates are included, including the required checksum-verified Gradle wrapper JAR; no image or application binary is included. Restore the generated Web TypeScript cache before staging.
- [x] Push `narumi/chore/dependency-pr-updates` and open [PR #346](https://github.com/narumiruna/kestrel/pull/346) with local checks, official wrapper checksums, audit limitations, and combined-branch CI evidence.

## Completion Checklist

- [x] All nine updates are included without unrelated package upgrades.
- [x] Backend and Web checks pass locally and in CI; Android checks pass in combined-branch CI run `39095867968`.
- [x] PR #346 is open; remote inventory confirms all nine original dependency PRs remain open and unmerged.
- [x] All checks above have evidence; archive this completed plan. Android screenshot validation is not claimed: approved reference images are missing as documented in the separate active `dependency-refresh-plan.md`.

## Risks

- The original PRs test updates separately; combined-branch CI is required to check their interactions.
- The Gradle wrapper JAR is an existing required build asset, not a generated application binary. Include only the Dependabot update after official checksum verification; never stage image binaries.
- Existing missing Android screenshot reference images remain tracked by `dependency-refresh-plan.md`; this task does not alter or close that plan.
- Backend audit still reports the previously documented 24 transitive findings (20 moderate, 4 high); Web audit reports none. Do not use forced major downgrades or unrelated upgrades to change this scope. Existing Web Biome diagnostics remain at 44 warnings and one informational diagnostic.
