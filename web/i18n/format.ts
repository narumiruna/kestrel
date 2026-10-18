export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}
export function formatDistance(km: number, locale: string): string {
  return formatNumber(km, locale, {
    style: 'unit',
    unit: 'kilometer',
    maximumFractionDigits: km < 10 ? 1 : 0,
  });
}
export function formatSpeed(kmh: number, locale: string): string {
  return formatNumber(kmh, locale, {
    style: 'unit',
    unit: 'kilometer-per-hour',
    maximumFractionDigits: 1,
  });
}
export function formatRelativeUpdated(date: Date, now: number, locale: string): string {
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (seconds < 10) return formatter.format(0, 'second');
  if (seconds < 60) return formatter.format(-seconds, 'second');
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return formatter.format(-Math.floor(seconds / 3600), 'hour');
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}
