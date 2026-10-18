import { normalizeLocale } from './config.ts';
import { loadMessages } from './messages.ts';

export async function resolveLocaleMessages(saved: unknown) {
  const locale = normalizeLocale(saved);
  return { locale, messages: await loadMessages(locale) };
}
