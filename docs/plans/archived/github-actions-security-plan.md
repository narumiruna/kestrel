# GitHub Actions Security Plan

## Goal

Resolve the reported zizmor findings without changing version bump, tag, deployment, or signed-release behavior.

## Plan

- [x] Pin action references to verified commit hashes and set an exact `just` version.
- [x] Add seven-day Dependabot cooldowns, disable checkout credential persistence, and disable release Gradle caching.
- [x] Pass script inputs through quoted environment variables. Use step-scoped PAT authentication for Git network commands.
- [x] Replace the release action with GitHub CLI commands that support new and existing releases.
- [x] Validate workflows and review the diff.
- [x] Open a pull request: [PR #382](https://github.com/narumiruna/kestrel/pull/382).

## Completion Checklist

- [x] `zizmor .github/` and the repository-wide CI scan pass without new suppressions.
- [x] Workflow syntax and shell checks pass.
- [x] Local regression checks cover input quoting, temporary Git authentication, and release create/update commands without external writes.
- [x] Only the intended text files are committed; the pull request records validation and limits.

## Validation Evidence

- zizmor 1.32.0: `zizmor .github/`, `zizmor --offline .`, and authenticated `zizmor .` report no findings under the default persona. No ignore rules were added.
- actionlint 1.7.12 with ShellCheck 0.11.0: all workflows pass.
- Local regression fixtures pass in a network-disabled, read-only Docker container with an empty allowlisted environment, dummy credentials, a 1 MiB scratch filesystem, and CPU, memory, process, file-size, and time limits.
  - Inputs with shell syntax remain single literal arguments.
  - Git's credential helper receives the dummy PAT without persistent configuration.
  - Tag lookups distinguish existing tags, missing tags, and authentication/network errors.
  - New and existing releases retain titles, prerelease flags, and APK paths. New releases generate notes; existing drafts publish only after the asset upload.
  - APK signature verification remains required.
- `git diff --check` passes. No application source, signing requirements, or deployment commands were changed.

## Rollback / Recovery

Revert the workflow changes if needed. Do not run a release or deployment to validate this change. Live PAT permissions, signed APK creation, and publication remain unverified until the workflows run in GitHub Actions.
