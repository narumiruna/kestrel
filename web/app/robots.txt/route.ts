import { absoluteUrl, getSiteOrigin, SITEMAP_PATH } from '@/lib/agentDiscovery';

const RESTRICTED_AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'Google-Extended',
  'PerplexityBot',
] as const;

const PUBLIC_CRAWL_RULES = [
  'Content-Signal: ai-train=no, search=yes, ai-input=no',
  'Allow: /',
  'Allow: /login',
  'Allow: /docs/',
  'Allow: /.well-known/',
  'Allow: /sitemap.xml',
  'Allow: /status',
  'Disallow: /dashboard',
  'Disallow: /api/backend',
  'Disallow: /share',
] as const;

export function GET(request: Request) {
  const sitemapUrl = absoluteUrl(getSiteOrigin(request), SITEMAP_PATH);

  return new Response(createRobotsTxt(sitemapUrl), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

function createRobotsTxt(sitemapUrl: string): string {
  const records = [
    '# Kestrel crawler policy',
    ...RESTRICTED_AI_CRAWLERS.flatMap((crawler) => [
      `User-agent: ${crawler}`,
      'Content-Signal: ai-train=no, search=no, ai-input=no',
      'Disallow: /',
      '',
    ]),
    'User-agent: OAI-SearchBot',
    ...PUBLIC_CRAWL_RULES,
    '',
    'User-agent: *',
    ...PUBLIC_CRAWL_RULES,
    '',
    `Sitemap: ${sitemapUrl}`,
    '',
  ];

  return records.join('\n');
}
