## Goal

Add explicit `robots.txt` rules for AI crawlers such as GPTBot, OAI-SearchBot, Claude-Web, and Google-Extended, plus a wildcard policy that matches Kestrel's content-use preferences.

## Context

- This plan modifies the same `/robots.txt` route owned by the general robots and Content Signals plans.
- The implemented policy allows search-style crawling of approved public paths and blocks training/user-input AI crawlers from all paths.
- References: RFC 9309, Cloudflare AI Crawl Control, and `https://isitagentready.com/.well-known/agent-skills/ai-rules/SKILL.md`.

## Unknowns

- AI crawler user-agent tokens can change over time and may need periodic review against vendor documentation.

## Plan

- [x] Confirm the desired policy for AI crawlers, separating search/discovery bots from training crawlers; verified by the active goal decision to implement AI crawler rules with Content Signals and avoid indexing `/share/[token]` capability URLs.
- [x] Verify current vendor user-agent tokens for OpenAI, Anthropic, Google, and additional crawlers to control; implemented explicit records for `GPTBot`, `ChatGPT-User`, `OAI-SearchBot`, `ClaudeBot`, `Claude-Web`, `Google-Extended`, and `PerplexityBot`.
- [x] Update `/robots.txt` with explicit AI crawler records and a wildcard record, preserving the general path rules and sitemap line; verified by local production-mode curl and Python assertions for `GPTBot`, `OAI-SearchBot`, `Claude-Web`, `Google-Extended`, and `User-agent: *`.
- [x] Add comments or docs that explain the policy without relying on comments for machine behavior; verified by `# Kestrel crawler policy` plus machine-readable rules in `web/app/robots.txt/route.ts`.
- [ ] Deploy and verify `curl -i "$SITE_ORIGIN/robots.txt"` returns the AI-specific records exactly as committed.

## Risks

- Nonstandard or misspelled user-agent tokens will not be honored by crawlers.
- Overly broad disallow rules can reduce search visibility for public content.

## Rollback / Recovery

- Revert the AI-specific records to the prior wildcard policy and redeploy; verify production `robots.txt` matches the rollback commit.

## Completion Checklist

- [x] AI crawler records and a wildcard record exist in `robots.txt`, verified by local production-mode curl and Python assertions.
- [x] The crawler policy is explicitly documented, verified by `web/app/robots.txt/route.ts` and this plan's Context section.
- [x] The file remains valid robots plain text, verified by the general robots validation checks.
- [ ] Production `robots.txt` returns the AI-specific records after deploy, verified by `curl -i "$SITE_ORIGIN/robots.txt"`.
