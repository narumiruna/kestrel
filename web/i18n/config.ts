export const locales = [
  'zh-TW',
  'en',
  'ja',
  'ko',
  'hi',
  'es',
  'fr',
  'pt',
  'id',
  'de',
  'vi',
  'tr',
  'fil',
  'th',
  'it',
  'pl',
  'ms',
  'nl',
] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
export const localeCookie = 'kestrel-locale';
export const localeNames: Record<Locale, string> = {
  'zh-TW': '繁體中文 · Traditional Chinese',
  en: 'English',
  ja: '日本語 · Japanese',
  ko: '한국어 · Korean',
  hi: 'हिन्दी · Hindi',
  es: 'Español · Spanish',
  fr: 'Français · French',
  pt: 'Português · Portuguese',
  id: 'Bahasa Indonesia · Indonesian',
  de: 'Deutsch · German',
  vi: 'Tiếng Việt · Vietnamese',
  tr: 'Türkçe · Turkish',
  fil: 'Filipino',
  th: 'ไทย · Thai',
  it: 'Italiano · Italian',
  pl: 'Polski · Polish',
  ms: 'Bahasa Melayu · Malay',
  nl: 'Nederlands · Dutch',
};
export function normalizeLocale(value: unknown): Locale {
  if (typeof value !== 'string' || !value.trim()) return defaultLocale;
  try {
    const [canonical] = Intl.getCanonicalLocales(value.trim());
    const parsed = new Intl.Locale(canonical);
    if (
      parsed.language === 'zh' &&
      (parsed.script === 'Hant' || (parsed.region === 'TW' && parsed.script !== 'Hans'))
    )
      return 'zh-TW';
    const base = parsed.language;
    return (locales as readonly string[]).includes(base) ? (base as Locale) : defaultLocale;
  } catch {
    return defaultLocale;
  }
}
export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}
