import { absoluteUrl, CANONICAL_PUBLIC_PATHS, getSiteOrigin } from '@/lib/agentDiscovery';

const LAST_MODIFIED = '2026-07-08';

export function GET(request: Request) {
  const origin = getSiteOrigin(request);
  const sitemap = createSitemap(origin);

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}

function createSitemap(origin: string): string {
  const urls = CANONICAL_PUBLIC_PATHS.map((path) => {
    return [
      '  <url>',
      `    <loc>${escapeXml(absoluteUrl(origin, path))}</loc>`,
      `    <lastmod>${LAST_MODIFIED}</lastmod>`,
      '  </url>',
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
