/**
 * Demo-mode community prices (#511). Mock data only: used by the screenshot
 * harness, never by a build that talks to Supabase.
 *
 * Other collectors' prices are seeded per demo pin so every state can be
 * shown; the demo collector's own prices live in memory. The totals follow
 * the same rules as migration 065's get_community_prices: median, confident
 * from 3 collectors, entries only for 1–2, outliers trimmed from 5.
 */
import {
  normalisePriceAmount,
  type CommunityPrice,
  type MyPinPrice,
  type PriceCurrency,
} from '@workspace/pin-repository';
import type { CommunityPriceService } from '@/lib/communityPriceService';

const CONFIDENT_MIN = 3;

/** Other collectors' prices, by pin and currency. */
const SEED: Record<string, Partial<Record<PriceCurrency, number[]>>> = {
  // Confident in both currencies.
  'dp-001': { GBP: [12, 13, 14, 14, 15, 16, 12, 18, 14, 13, 15], USD: [16, 18, 19, 20] },
  // Early: two collectors.
  'dp-002': { GBP: [12, 15] },
  // Early: one collector.
  'dp-003': { GBP: [9] },
  // dp-004: nobody yet.
  // Confident, far above the market.
  'dp-005': { GBP: [25, 28, 30, 30, 32, 35, 26, 29, 31] },
  'dp-010': { GBP: [6, 7, 8] },
};

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarise(pinId: string, currency: PriceCurrency, amounts: number[]): CommunityPrice | null {
  if (amounts.length === 0) return null;
  let kept = [...amounts].sort((a, b) => a - b);
  if (kept.length >= 5) {
    const m = median(kept);
    kept = kept.filter(a => a <= m * 3 && a >= m / 3);
  }
  const n = kept.length;
  return {
    pinId,
    currency,
    collectorCount: n,
    median: round2(median(kept)),
    low: round2(n >= 5 ? percentile(kept, 0.1) : kept[0]),
    high: round2(n >= 5 ? percentile(kept, 0.9) : kept[n - 1]),
    ...(n <= 2 ? { entries: kept } : {}),
    step: n >= CONFIDENT_MIN ? 'confident' : 'early',
  };
}

export function createDemoCommunityPrices(): CommunityPriceService {
  const mine = new Map<string, MyPinPrice>();
  let include = true;
  const key = (pinId: string, currency: PriceCurrency) => `${pinId}|${currency}`;

  const amountsFor = (pinId: string, currency: PriceCurrency) => {
    const own = include ? mine.get(key(pinId, currency)) : undefined;
    return [...(SEED[pinId]?.[currency] ?? []), ...(own ? [own.amount] : [])];
  };

  return {
    async setMyPinPrice(pinId, currency, amount) {
      mine.set(key(pinId, currency), {
        pinId, currency, amount: normalisePriceAmount(amount), updatedAt: new Date().toISOString(),
      });
    },
    async clearMyPinPrice(pinId, currency) {
      mine.delete(key(pinId, currency));
    },
    async getMyPinPrices(pinIds) {
      const wanted = new Set(pinIds);
      return [...mine.values()].filter(p => wanted.has(p.pinId));
    },
    async getCommunityPrice(pinId, currency) {
      return summarise(pinId, currency, amountsFor(pinId, currency));
    },
    async getCommunityPrices(pinIds, currency) {
      return [...new Set(pinIds)]
        .map(id => summarise(id, currency, amountsFor(id, currency)))
        .filter((p): p is CommunityPrice => p !== null);
    },
    async getMyCommunityPriceSetting() {
      return include;
    },
    async setMyCommunityPriceSetting(value) {
      include = value;
    },
  };
}
