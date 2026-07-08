## Goal

Declare Kestrel AI content-usage preferences in `robots.txt` using `Content-Signal` directives for `ai-train`, `search`, and `ai-input`.

## Context

- Content Signals are draft/nonstandard preferences layered on top of `robots.txt`; they should not replace RFC 9309 crawl rules.
- This plan modifies the same `web/public/robots.txt` as the robots and AI crawler rules plans.
- References: contentsignals.org, draft-romm-aipref-contentsignals, and `https://isitagentready.com/.well-known/agent-skills/content-signals/SKILL.md`.

## Unknowns

- The desired values for `ai-train`, `search`, and `ai-input` for public Kestrel content.
- Whether preferences should vary by path or apply site-wide.

## Plan

- [ ] Choose site-wide Content Signal values such as `ai-train=no`, `search=yes`, and `ai-input=no`, or document path-specific exceptions; verify with explicit user acceptance.
- [ ] Confirm the current directive syntax from the Content Signals draft before editing; verify the implementation cites the version/source used.
- [ ] Add `Content-Signal` directives to `web/public/robots.txt` without breaking existing `User-agent`, `Allow`, `Disallow`, or `Sitemap` records; verify with `grep -n '^Content-Signal:' web/public/robots.txt`.
- [ ] Deploy and verify the production `robots.txt` includes the directives with `curl -i "$SITE_ORIGIN/robots.txt"`.
- [ ] Document that Content Signals are preferences and not an access-control mechanism; verify the note appears in the implementation PR or policy docs.

## Risks

- Draft syntax can change and make the published directive stale.
- Content Signals may be ignored by crawlers that only implement RFC 9309.

## Rollback / Recovery

- Remove or adjust the `Content-Signal` line and redeploy; verify production `robots.txt` no longer advertises the old preferences.

## Completion Checklist

- [ ] `robots.txt` contains approved `Content-Signal` directives, verified by grep and production curl output.
- [ ] The directive syntax source is documented, verified by a cited reference in the implementation notes.
- [ ] The project documents that Content Signals are advisory preferences, verified by committed docs or PR text.
