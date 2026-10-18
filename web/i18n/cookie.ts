import { isSupportedLocale, localeCookie } from './config.ts';
export const localeCookieMaxAge = 60 * 60 * 24 * 365;
export function localeCookieOptions(origin: string) {
  return {
    httpOnly: true,
    maxAge: localeCookieMaxAge,
    path: '/',
    sameSite: 'lax' as const,
    secure: new URL(origin).protocol === 'https:',
  };
}
export function validateLocaleWrite(
  value: unknown,
  origin: string | null,
  host: string | null,
  protocol: string | null,
) {
  if (!isSupportedLocale(value) || !origin || !host) return null;
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.host !== host || url.origin !== origin)
      return null;
    if (protocol && url.protocol !== `${protocol}:`) return null;
    return { name: localeCookie, options: localeCookieOptions(origin), value };
  } catch {
    return null;
  }
}

export function persistLocale(
  value: unknown,
  origin: string | null,
  host: string | null,
  protocol: string | null,
  write: (name: string, value: string, options: ReturnType<typeof localeCookieOptions>) => void,
): { ok: boolean } {
  const cookie = validateLocaleWrite(value, origin, host, protocol);
  if (!cookie) return { ok: false };
  try {
    write(cookie.name, cookie.value, cookie.options);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
