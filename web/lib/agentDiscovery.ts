export const API_CATALOG_PATH = '/.well-known/api-catalog';
export const API_STATUS_PATH = '/status';
export const API_SERVICE_ANCHOR_PATH = '/api/backend/';
export const SERVICE_DOC_PATH = '/docs/remote-control-api.md';
export const SITEMAP_PATH = '/sitemap.xml';

export const CANONICAL_PUBLIC_PATHS = ['/login', SERVICE_DOC_PATH] as const;

export const AGENT_DISCOVERY_LINK_HEADER = [
  `<${API_CATALOG_PATH}>; rel="api-catalog"; type="application/linkset+json"`,
  `<${SITEMAP_PATH}>; rel="sitemap"; type="application/xml"`,
].join(', ');

const SITE_ORIGIN_ENV_KEYS = ['KESTREL_SITE_ORIGIN', 'NEXT_PUBLIC_SITE_ORIGIN'] as const;

export function getSiteOrigin(request: Request): string {
  const configuredOrigin = getConfiguredSiteOrigin();

  if (configuredOrigin != null) {
    return configuredOrigin;
  }

  const forwardedHost = firstHeaderValue(
    request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
  );
  const forwardedProto = firstHeaderValue(request.headers.get('x-forwarded-proto'));

  if (forwardedHost != null && forwardedProto != null) {
    return normalizeOrigin(`${forwardedProto}://${forwardedHost}`);
  }

  return normalizeOrigin(new URL(request.url).origin);
}

export function absoluteUrl(origin: string, path: string): string {
  return new URL(path, `${normalizeOrigin(origin)}/`).toString();
}

function getConfiguredSiteOrigin(): string | undefined {
  for (const key of SITE_ORIGIN_ENV_KEYS) {
    const value = process.env[key]?.trim();

    if (value != null && value !== '') {
      return normalizeOrigin(value);
    }
  }

  return undefined;
}

function firstHeaderValue(value: string | null): string | undefined {
  return value?.split(',')[0]?.trim() || undefined;
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}
