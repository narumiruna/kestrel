---
name: resolving-pull-request-queues
description: Inspect, triage, fix, merge, or close every open pull request in a repository. Use when the user asks to read, review, or fix all PRs; clear the PR queue; resolve failing PR checks; merge ready PRs; or leave no actionable pull requests open.
---

# Resolving Pull Request Queues

Move the whole open PR queue to justified terminal states. Keep working through actionable failures instead of returning only a plan or review summary.

## Establish Scope

1. Identify the repository, default branch, remotes, clean/dirty working-tree state, hosting CLI, and authenticated account.
2. Interpret “all PRs” as every open PR targeting the default branch unless the user narrows the scope.
3. Read repository instructions before changing code, running commands, choosing a merge strategy, or writing commits.
4. Treat an explicit request to fix or clear the queue as authorization for ordinary PR branch updates, comments, merges, and evidence-backed closure of stale PRs. Still obey the safety rules below.

## Inventory Every PR

Collect the queue before acting. For each PR, inspect:

- number, title, URL, author, draft status, base/head branches, and head SHA
- body, commits, changed files, full diff, labels, mergeability, and merge state
- comments, submitted reviews, review decision, and unresolved review threads
- required checks and the failed logs, not only the check names

Use parallel reads when safe. Serialize merges and overlapping branch updates because each merge can change the status of the remaining queue.

## Classify by Evidence

Assign each PR one current disposition:

- **Ready** — intended change is sound, reviews are resolved, and required checks pass.
- **Fixable** — code, lockfile, conflicts, or CI needs work that can be completed now.
- **Superseded** — the exact change already exists on the current base, or the rebased PR has no meaningful diff.
- **Blocked** — a concrete external dependency, permission, secret, or maintainer decision prevents progress.
- **Needs maintainer judgment** — the PR is viable but product, security, compatibility, or ownership intent cannot be inferred safely.

Do not classify a PR as blocked merely because its checks fail. Read the logs and attempt a repair first.

## Resolve the Queue

1. Start with independent low-risk PRs or changes that unblock others.
2. For a superseded PR, compare it with the latest base and identify the commit or merged PR that contains the change. Leave that evidence in a comment before closing it.
3. For a fixable PR:
   - update from the latest base without discarding unrelated contributor work;
   - fix the root cause rather than weakening checks or hiding failures;
   - follow official upstream guidance for major dependency or toolchain incompatibilities;
   - use focused commits and the repository’s commit conventions;
   - use force-with-lease only on a maintainer-owned or bot branch, with the expected remote head verified first.
4. Run the narrow affected checks, then the repository’s required verification gate. Never run destructive device, data-reset, deploy, or release commands without the required approval.
5. Re-read the final diff and PR state after pushing. Wait for required CI, inspect any new failure, and continue until it passes or a real blocker is proven.
6. Merge using the repository’s established strategy only when the PR is non-draft, mergeable, reviewed as required, and green.
7. Refresh the entire queue after each merge. Reclassify conflicts, duplicate dependency updates, and newly superseded PRs against the new base.

## Safety Rules

- Never merge a draft, a PR with failing required checks, or a PR with unresolved change requests.
- Never close a viable human-authored PR merely to make the open count zero.
- Never bypass hooks, branch protection, signing requirements, tests, or security controls.
- Do not overwrite external contributor branches. Use maintainer-edit support or propose a separate repair when direct updates are unsafe.
- Preserve unrelated local changes and generated-file policy. Do not sync or clean the working tree destructively.
- If intent remains ambiguous after reading the PR and repository context, present the exact decision needed rather than guessing.

## Completion Audit

Before finishing:

1. Account for every PR that was open initially and every PR discovered during the run.
2. Confirm merged and closed states remotely, including final CI conclusions.
3. List any remaining open PR and the concrete reason it is intentionally still open.
4. Sync the local default branch only when doing so is safe, then confirm its working tree is clean and aligned with its remote.
5. Report PRs merged, fixed, closed as superseded, or left blocked, plus the verification evidence.

A resolved queue means no known actionable PR work remains. It does not require zero open PRs when a legitimate blocker or maintainer decision is outstanding.
