## Goal

Publish `/sitemap.xml` with canonical public URLs, keep it updated when public routes change, and reference it from `/robots.txt`.

## Context

- The web site is the Next.js app in `web/` with public pages such as `/login` and dynamic share pages under `/share/[token]`.
- A sitemap should list indexable canonical URLs only; authenticated dashboard/API routes should not be listed.
- References: Sitemap protocol and `https://isitagentready.com/.well-known/agent-skills/sitemap/SKILL.md`.

## Unknowns

- The canonical production origin for absolute sitemap URLs.
- Whether public share URLs should be indexable or excluded because tokens are capability URLs.

## Plan

- [ ] Inventory public routes in `web/app` and classify each as indexable or non-indexable; verify with a committed route inventory in this plan or a follow-up docs note.
- [ ] Add a canonical origin configuration such as `NEXT_PUBLIC_SITE_ORIGIN` for sitemap generation; verify the deploy workflow or runtime env sets it for production.
- [ ] Implement `web/app/sitemap.ts` or a generated `web/public/sitemap.xml` listing canonical public URLs with `lastmod` where available; verify with `curl -i http://127.0.0.1:3301/sitemap.xml` returning XML after local serve.
- [ ] Update `web/public/robots.txt` to include `Sitemap: $SITE_ORIGIN/sitemap.xml`; verify with `grep -n '^Sitemap:' web/public/robots.txt`.
- [ ] Add a route-change maintenance check to the web validation path, such as a script that compares `web/app` public routes with sitemap entries; verify with `cd web && npm run build` and the chosen script output.
- [ ] Deploy and verify `curl -i "$SITE_ORIGIN/sitemap.xml"` returns `200`, `Content-Type` XML, absolute canonical URLs, and no authenticated API/dashboard URLs.

## Risks

- Listing share-token URLs can make private-by-link content discoverable.
- Missing canonical origin configuration can produce localhost URLs in production.

## Rollback / Recovery

- Remove the sitemap reference from `robots.txt` and revert the sitemap generator/static file; verify production no longer advertises stale sitemap data.

## Completion Checklist

- [ ] `/sitemap.xml` lists only approved canonical public URLs, verified by reviewing the generated XML and route inventory.
- [ ] `/robots.txt` references the sitemap, verified by `grep -n '^Sitemap:' web/public/robots.txt` and production `curl` output.
- [ ] The sitemap stays current on publish, verified by a documented generation/check command in the web build or release workflow.
