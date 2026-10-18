export type AccountSection = 'preferences' | 'security';

const SECURITY_TARGETS = new Set([
  'security',
  'sign-in-heading',
  'sessions-heading',
  'devices-heading',
]);

export function resolveAccountNavigation(location: URL) {
  const url = new URL(location.href);
  const linked = url.searchParams.get('oidc') === 'linked';
  if (linked) {
    url.searchParams.delete('oidc');
    url.hash = '#security';
  }
  const target = url.hash.slice(1);
  const section: AccountSection = SECURITY_TARGETS.has(target) ? 'security' : 'preferences';
  return {
    section,
    linked,
    target: SECURITY_TARGETS.has(target) ? target : 'preferences',
    href: `${url.pathname}${url.search}${url.hash}`,
  };
}
