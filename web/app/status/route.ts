import { API_CATALOG_PATH, SITEMAP_PATH } from '@/lib/agentDiscovery';

export function GET() {
  return Response.json({
    service: 'kestrel-cloud-web',
    status: 'ok',
    resources: {
      apiCatalog: API_CATALOG_PATH,
      sitemap: SITEMAP_PATH,
    },
  });
}
