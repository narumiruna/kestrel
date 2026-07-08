## Goal

Add explicit `robots.txt` rules for AI crawlers such as GPTBot, OAI-SearchBot, Claude-Web, and Google-Extended, plus a wildcard policy that matches Kestrel's content-use preferences.

## Context

- This plan modifies the same `web/public/robots.txt` owned by the general robots and Content Signals plans.
- AI crawler user-agent tokens change over time, so the exact tokens should be verified against vendor documentation during implementation.
- References: RFC 9309, Cloudflare AI Crawl Control, and `https://isitagentready.com/.well-known/agent-skills/ai-rules/SKILL.md`.

## Unknowns

- Kestrel's policy for AI training, AI search indexing, and agent input over public share content.
- The current exact user-agent tokens for each vendor crawler.

## Plan

- [ ] Confirm the desired policy for AI crawlers, separating search/discovery bots from training crawlers; verify with explicit user acceptance or a committed policy note.
- [ ] Verify current vendor user-agent tokens for OpenAI, Anthropic, Google, and any additional crawlers to control; verify by citing the source links in the implementation PR.
- [ ] Update `web/public/robots.txt` with explicit AI crawler records and a wildcard record, preserving the general path rules and sitemap line; verify with `grep -nE 'GPTBot|OAI-SearchBot|Claude|Google-Extended|User-agent: \*' web/public/robots.txt`.
- [ ] Add comments or docs that explain the policy without relying on comments for machine behavior; verify the final `robots.txt` remains RFC 9309-compatible.
- [ ] Deploy and verify `curl -i "$SITE_ORIGIN/robots.txt"` returns the AI-specific records exactly as committed.

## Risks

- Nonstandard or misspelled user-agent tokens will not be honored by crawlers.
- Overly broad disallow rules can reduce search visibility for public content.

## Rollback / Recovery

- Revert the AI-specific records to the prior wildcard policy and redeploy; verify production `robots.txt` matches the rollback commit.

## Completion Checklist

- [ ] AI crawler records and a wildcard record exist in `robots.txt`, verified by grep and production curl output.
- [ ] The crawler policy is explicitly approved or documented, verified by a committed policy note or review comment.
- [ ] The file remains valid robots plain text, verified by the general robots validation checks.
