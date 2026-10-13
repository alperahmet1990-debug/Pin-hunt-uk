/**
 * Who has the pins you're missing from a set (UX-021, #129). Pure grouping
 * of `getForTradeInventory` rows into one entry per collector, most useful
 * first: the collector with the most of your missing pins leads.
 */
import type { ForTradeInventoryItem } from '@workspace/pin-repository';

export interface SetTraderPin {
  pinId: string;
  title: string;
  imageUrl?: string;
}

export interface SetTrader {
  traderId: string;
  username: string;
  pins: SetTraderPin[];
}

export function groupByCollector(items: ForTradeInventoryItem[]): SetTrader[] {
  const byTrader = new Map<string, SetTrader>();
  for (const item of items) {
    let trader = byTrader.get(item.traderId);
    if (!trader) {
      trader = { traderId: item.traderId, username: item.traderUsername, pins: [] };
      byTrader.set(item.traderId, trader);
    }
    // A collector listing two copies of one pin still covers one missing slot.
    if (!trader.pins.some(p => p.pinId === item.pinId)) {
      trader.pins.push({ pinId: item.pinId, title: item.title, imageUrl: item.imageUrl });
    }
  }
  return [...byTrader.values()].sort(
    (a, b) => b.pins.length - a.pins.length || a.username.localeCompare(b.username),
  );
}

/** Distinct missing pins at least one collector has for trade. */
export function availablePinCount(traders: SetTrader[]): number {
  return new Set(traders.flatMap(t => t.pins.map(p => p.pinId))).size;
}

export function hasThemLabel(count: number, total: number): string {
  if (total === 1) return 'has it';
  if (count === total) return `has all ${count}`;
  return count === 1 ? 'has 1 of them' : `has ${count} of them`;
}

/** Missing pins that "Add missing to ISO" would change: not owned, For Trade or already ISO. */
export function pinsToAddToIso(pinIds: string[], statusOf: (id: string) => string | undefined): string[] {
  return pinIds.filter(id => {
    const status = statusOf(id);
    return !status || status === 'none';
  });
}
