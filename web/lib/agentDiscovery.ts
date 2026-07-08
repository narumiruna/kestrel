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
  return (
    getConfiguredSiteOrigin() ??
    getForwardedSiteOrigin(request.headers) ??
    parseHttpOrigin(request.url) ??
    'http://localhost:3301'
  );
}

export function absoluteUrl(origin: string, path: string): string {
  return new URL(path, `${origin}/`).toString();
}

function getConfiguredSiteOrigin(): string | undefined {
  for (const key of SITE_ORIGIN_ENV_KEYS) {
    const origin = parseHttpOrigin(process.env[key]);

    if (origin != null) {
      return origin;
    }
  }

  return undefined;
}

function getForwardedSiteOrigin(headers: Headers): string | undefined {
  const forwardedHost = firstHeaderValue(headers.get('x-forwarded-host') ?? headers.get('host'));
  const forwardedProto = firstHeaderValue(headers.get('x-forwarded-proto'));

  if (forwardedHost == null || forwardedProto == null) {
    return undefined;
  }

  return parseHttpOrigin(`${forwardedProto}://${forwardedHost}`);
}

function firstHeaderValue(value: string | null): string | undefined {
  return value?.split(',')[0]?.trim() || undefined;
}

function parseHttpOrigin(value: string | undefined): string | undefined {
  if (value == null || value.trim() === '') {
    return undefined;
  }

  try {
    const url = new URL(value);

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.origin;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
