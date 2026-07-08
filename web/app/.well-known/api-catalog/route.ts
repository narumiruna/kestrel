import {
  API_SERVICE_ANCHOR_PATH,
  API_STATUS_PATH,
  absoluteUrl,
  getSiteOrigin,
  SERVICE_DOC_PATH,
} from '@/lib/agentDiscovery';

type LinkTarget = {
  href: string;
  title: string;
  type: string;
};

type ApiCatalog = {
  linkset: Array<{
    anchor: string;
    'service-doc': LinkTarget[];
    status: LinkTarget[];
  }>;
};

export function GET(request: Request) {
  const origin = getSiteOrigin(request);
  const catalog: ApiCatalog = {
    linkset: [
      {
        anchor: absoluteUrl(origin, API_SERVICE_ANCHOR_PATH),
        'service-doc': [
          {
            href: absoluteUrl(origin, SERVICE_DOC_PATH),
            title: 'Kestrel Remote Control API documentation',
            type: 'text/markdown',
          },
        ],
        status: [
          {
            href: absoluteUrl(origin, API_STATUS_PATH),
            title: 'Kestrel service status',
            type: 'application/json',
          },
        ],
      },
    ],
  };

  return new Response(`${JSON.stringify(catalog, null, 2)}\n`, {
    headers: {
      'Content-Type': 'application/linkset+json; charset=utf-8',
    },
  });
}
