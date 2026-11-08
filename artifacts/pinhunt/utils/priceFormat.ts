/**
 * Money and price wording for market and community prices (#511).
 * Pounds and dollars are never converted into each other.
 */
import type { PriceCurrency } from '@workspace/pin-repository';

export const CURRENCY_SYMBOL: Record<PriceCurrency, string> = { GBP: '£', USD: '$' };

/** "£14", "£13.50", "$20". Whole amounts drop the pence. */
export function formatPrice(amount: number, currency: PriceCurrency | string): string {
  const whole = Math.abs(amount - Math.round(amount)) < 0.005;
  return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
}

/** "£12 – £15", or one price when low and high match. */
export function formatPriceRange(low: number, high: number, currency: PriceCurrency | string): string {
  return Math.abs(low - high) < 0.005
    ? formatPrice(low, currency)
    : `${formatPrice(low, currency)} – ${formatPrice(high, currency)}`;
}

/** "£12 and £15" / "£9": the entries behind an early community price. */
export function formatEntries(entries: number[], currency: PriceCurrency): string {
  return entries.map(e => formatPrice(e, currency)).join(' and ');
}

/** Evidence steps shared by both prices (#511): one, two or three bars. */
export type EvidenceStep = 'early' | 'growing' | 'confident';
export const EVIDENCE_LABEL: Record<EvidenceStep, string> = { early: 'Early', growing: 'Growing', confident: 'Confident' };
export const EVIDENCE_BARS: Record<EvidenceStep, 1 | 2 | 3> = { early: 1, growing: 2, confident: 3 };

/**
 * How the two prices compare, when both are confident. Within 25% of each
 * other they "agree"; otherwise the line says which way collectors lean.
 */
export function agreementLine(marketMid: number, communityMid: number, currency: PriceCurrency): string | null {
  if (!(marketMid > 0) || !(communityMid > 0)) return null;
  const lo = Math.min(marketMid, communityMid);
  const hi = Math.max(marketMid, communityMid);
  if ((hi - lo) / hi <= 0.25) {
    return `The market and collectors agree: about ${formatPriceRange(Math.round(lo), Math.round(hi), currency)}`;
  }
  return communityMid > marketMid
    ? 'Collectors price this higher than the market'
    : 'Collectors price this lower than the market';
}
