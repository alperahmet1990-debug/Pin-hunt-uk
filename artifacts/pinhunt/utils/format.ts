/**
 * Money and dates, formatted for the collector's home market (HM-03, #563).
 *
 * Every screen formats through here instead of hard-coding 'en-GB', so a US
 * collector sees "Nov 8, 2026" and "$20" while UK output stays exactly as
 * before. The wording of the app stays British English for everyone; only
 * numbers, currency and dates follow the market (#560, decision 4).
 *
 * The market defaults to UK. ProfileContext sets it from the collector's
 * profile (setFormatMarket, HM-04).
 */
/** Same values as the profile's home market (HM-01); kept local so this has no dependency on it. */
export type HomeMarket = 'UK' | 'US';

const LOCALE: Record<HomeMarket, string> = { UK: 'en-GB', US: 'en-US' };

let currentMarket: HomeMarket = 'UK';
const marketListeners = new Set<(market: HomeMarket) => void>();

/** Set from the collector's profile (ProfileContext, HM-04). Listeners hear changes. */
export function setFormatMarket(market: HomeMarket) {
  if (market === currentMarket) return;
  currentMarket = market;
  marketListeners.forEach(l => l(market));
}

/** Hear when the home market changes; returns an unsubscribe. */
export function subscribeFormatMarket(listener: (market: HomeMarket) => void): () => void {
  marketListeners.add(listener);
  return () => { marketListeners.delete(listener); };
}

export function formatMarket(): HomeMarket {
  return currentMarket;
}

export function localeFor(market: HomeMarket = currentMarket): string {
  return LOCALE[market];
}

/**
 * - short:   8 Nov            / Nov 8
 * - medium:  8 Nov 2026       / Nov 8, 2026
 * - long:    8 November 2026  / November 8, 2026
 * - numeric: 08/11/2026       / 11/08/2026
 * - time:    14:05            / 02:05 PM
 */
export type DateStyle = 'short' | 'medium' | 'long' | 'numeric' | 'time';

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: 'numeric', month: 'short' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  numeric: { day: '2-digit', month: '2-digit', year: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit' },
};

export function formatDate(
  value: string | number | Date,
  style: DateStyle = 'medium',
  options: { market?: HomeMarket; timeZone?: string } = {},
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = localeFor(options.market);
  const opts = { ...DATE_OPTIONS[style], ...(options.timeZone ? { timeZone: options.timeZone } : {}) };
  return style === 'time' ? date.toLocaleTimeString(locale, opts) : date.toLocaleDateString(locale, opts);
}

/** "13" and "NOV" for date pills, in the market's month names. */
export function formatDayMonth(value: string | Date, market?: HomeMarket): { day: string; month: string } {
  const date = value instanceof Date ? value : new Date(value);
  const locale = localeFor(market);
  return {
    day: date.toLocaleDateString(locale, { day: '2-digit' }),
    month: date.toLocaleDateString(locale, { month: 'short' }).toUpperCase(),
  };
}

/**
 * "£14", "£13.50", "$20". Currency decides the symbol; the market decides
 * the number style. `whole` rounds to whole units (price ranges).
 */
export function formatMoney(
  amount: number,
  currency: string,
  options: { whole?: boolean; market?: HomeMarket } = {},
): string {
  const isWhole = options.whole || Math.abs(amount - Math.round(amount)) < 0.005;
  return new Intl.NumberFormat(localeFor(options.market ?? (currency === 'USD' ? 'US' : currency === 'GBP' ? 'UK' : undefined)), {
    style: 'currency',
    currency,
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(amount);
}
