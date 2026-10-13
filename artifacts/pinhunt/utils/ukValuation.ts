/**
 * When to show a price (B-P1-19, #45): only a single "Typical UK price"
 * range, and only when the GB estimate is at least medium confidence and
 * GB comparable listings exist. GB and US comparables often describe
 * different pins, so the US figure is never shown. Prices are eBay
 * asking prices, never sold prices (memory: catalogue-validation).
 */
export type Confidence = 'insufficient' | 'low' | 'medium' | 'high';

export interface EstimateLike {
  marketplace: 'EBAY_GB' | 'EBAY_US';
  currency: string;
  estimatedLow: number | null;
  estimatedMid: number | null;
  estimatedHigh: number | null;
  comparableCount: number;
  confidence: Confidence;
}

export interface ComparableLike {
  marketplace: 'EBAY_GB' | 'EBAY_US';
}

const CONFIDENT: ReadonlySet<Confidence> = new Set(['medium', 'high']);

/** The GB estimate to show, or null when the price section should be hidden. */
export function confidentUkEstimate<E extends EstimateLike>(
  estimates: readonly E[],
  comparables: readonly ComparableLike[],
): E | null {
  const gb = estimates.find(e => e.marketplace === 'EBAY_GB');
  if (!gb || !CONFIDENT.has(gb.confidence)) return null;
  if (gb.estimatedLow == null || gb.estimatedHigh == null) return null;
  if (gb.comparableCount < 1 || !comparables.some(c => c.marketplace === 'EBAY_GB')) return null;
  return gb;
}
