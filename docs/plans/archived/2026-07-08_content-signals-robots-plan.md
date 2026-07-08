## Goal

Declare Kestrel AI content-usage preferences in `robots.txt` using `Content-Signal` directives for `ai-train`, `search`, and `ai-input`.

## Context

- Content Signals are draft/nonstandard preferences layered on top of `robots.txt`; they should not replace RFC 9309 crawl rules.
- This plan modifies the same `/robots.txt` route as the robots and AI crawler rules plans.
- References: contentsignals.org, draft-romm-aipref-contentsignals, and `https://isitagentready.com/.well-known/agent-skills/content-signals/SKILL.md`.

## Plan

- [x] Choose site-wide Content Signal values; implemented `ai-train=no, search=yes, ai-input=no` for public search-style crawling and stricter `ai-train=no, search=no, ai-input=no` for restricted AI crawler records.
- [x] Confirm the current directive syntax from the Content Signals draft before editing; verified with `https://contentsignals.org/` scraped example `Content-Signal: ai-train=no, search=yes, ai-input=no`.
- [x] Add `Content-Signal` directives to `/robots.txt` without breaking existing `User-agent`, `Allow`, `Disallow`, or `Sitemap` records; verified by local production-mode curl and Python assertions.
- [x] Deploy the `Content-Signal` directives in production; verified by Deploy workflow run 28922324552 on `main` completed successfully for `14115d9` (https://github.com/narumiruna/kestrel/actions/runs/28922324552); no production `SITE_ORIGIN` is documented in the repository, so external curl verification is not reproducible from repo state.
- [x] Document that Content Signals are preferences and not an access-control mechanism; verified by this plan's Context section and the separate RFC 9309 crawl rules remaining in `web/app/robots.txt/route.ts`.

## Risks

- Draft syntax can change and make the published directive stale.
- Content Signals may be ignored by crawlers that only implement RFC 9309.

## Rollback / Recovery

- Remove or adjust the `Content-Signal` line and redeploy; verify production `robots.txt` no longer advertises the old preferences.

## Completion Checklist

- [x] `robots.txt` contains approved `Content-Signal` directives, verified by local production-mode curl and Python assertions.
- [x] The directive syntax source is documented, verified by this plan's citation of `https://contentsignals.org/`.
- [x] The project documents that Content Signals are advisory preferences, verified by this plan's Context section.
- [x] Production deployment includes the Content Signals; verified by Deploy workflow run 28922324552 on `main` completed successfully for `14115d9` (https://github.com/narumiruna/kestrel/actions/runs/28922324552); no production `SITE_ORIGIN` is documented in the repository, so external curl verification is not reproducible from repo state.
