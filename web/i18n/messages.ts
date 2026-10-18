import english from '../messages/en.json' with { type: 'json' };
import { isSupportedLocale } from './config.ts';
export type Messages = typeof english;
export function mergeMessages(
  fallback: Record<string, unknown>,
  translated: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...fallback };
  for (const [key, value] of Object.entries(translated)) {
    if (!Object.hasOwn(fallback, key)) continue;
    if (typeof value === 'string' && value.trim() && typeof fallback[key] === 'string')
      result[key] = value;
    else if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof fallback[key] === 'object'
    ) {
      result[key] = mergeMessages(
        fallback[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    }
  }
  return result;
}
export async function loadMessages(locale: string): Promise<Messages> {
  if (!isSupportedLocale(locale) || locale === 'en') return english;
  try {
    const translated = (await import(`../messages/${locale}.json`, { with: { type: 'json' } }))
      .default;
    return mergeMessages(english, translated) as Messages;
  } catch {
    return english;
  }
}
