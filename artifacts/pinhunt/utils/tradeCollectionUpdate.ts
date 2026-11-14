/**
 * "Update your collection?" after a trade completes (WP1 step 3).
 *
 * Built from the agreed pins (migration 070) and the collector's collection:
 *   - Pins they sent: take one copy off per pin sent, or remove the pin when
 *     that was their last copy. A pin they still hold keeps its status (more
 *     copies For Trade stay For Trade).
 *   - Pins they received: mark Owned, or add the copies to a pin they
 *     already hold. A received pin that was on their ISO comes off it.
 *
 * Rows are applied in order on a working copy, so a pin on both sides, or
 * the same pin twice, ends up right. The result is one restoreEntries call,
 * and its snapshots are the Undo.
 */
import type { TradeItem } from '@workspace/pin-repository';
import type { CollectionEntry, CollectionMap } from '@/types/collection';
import { sideFor, type TradeSide } from '@/utils/tradeItems';

export interface CollectionUpdateRow {
  key: string;
  pinhuntId: string;
  title: string;
  side: TradeSide;
  quantity: number;
  /** What ticking it does, e.g. "Remove from your collection". */
  action: string;
}

const held = (e?: CollectionEntry) => e?.status === 'owned' || e?.status === 'for_trade';

function describe(row: { side: TradeSide; quantity: number }, entry: CollectionEntry | undefined): string | null {
  if (row.side === 'give') {
    if (!held(entry)) return null; // Nothing to take off.
    const left = (entry!.quantity ?? 1) - row.quantity;
    return left >= 1 ? `Keep ${left} ${left === 1 ? 'copy' : 'copies'}` : 'Remove from your collection';
  }
  if (held(entry)) {
    const total = (entry!.quantity ?? 1) + row.quantity;
    return `Add to your copies (${total} in all)`;
  }
  return entry?.status === 'wanted' ? 'Mark Owned and take off your ISO' : 'Mark Owned';
}

/** One row's effect on an entry, or undefined when the pin leaves the collection. */
function applyRow(
  row: { pinhuntId: string; side: TradeSide; quantity: number }, entry: CollectionEntry | undefined, now: string,
): CollectionEntry | undefined {
  if (row.side === 'give') {
    if (!held(entry)) return entry;
    const left = (entry!.quantity ?? 1) - row.quantity;
    return left >= 1 ? { ...entry!, quantity: left } : undefined;
  }
  if (held(entry)) return { ...entry!, quantity: (entry!.quantity ?? 1) + row.quantity };
  return { pinId: row.pinhuntId, status: 'owned', quantity: row.quantity, notes: entry?.notes ?? '', dateAdded: now };
}

/**
 * The rows to offer, pre-ticked. Pins with nothing to change are left out.
 * Each row is worded from the collection as the rows before it leave it, so
 * a pin on both sides reads the way it will end up.
 */
export function collectionUpdateRows(
  items: TradeItem[], viewerIsInitiator: boolean, collection: CollectionMap,
): CollectionUpdateRow[] {
  const rows: CollectionUpdateRow[] = [];
  const working: Record<string, CollectionEntry | undefined> = {};
  const current = (pinId: string) => (pinId in working ? working[pinId] : collection[pinId]);
  for (const item of items) {
    if (!item.pinhuntId) continue;
    const side = sideFor(item.direction, viewerIsInitiator);
    const quantity = Math.max(1, item.quantity ?? 1);
    const entry = current(item.pinhuntId);
    const action = describe({ side, quantity }, entry);
    if (!action) continue;
    const row = {
      key: `${side}:${item.pinhuntId}:${item.id}`,
      pinhuntId: item.pinhuntId,
      title: item.title ?? item.pinhuntId,
      side,
      quantity,
      action,
    };
    rows.push(row);
    working[item.pinhuntId] = applyRow(row, entry, '');
  }
  return rows;
}

/**
 * The new entries for the ticked rows, and the snapshots that undo them.
 * Both are restoreEntries input: [pinId, entry or undefined to remove].
 */
export function planCollectionUpdate(
  rows: CollectionUpdateRow[], ticked: Set<string>, collection: CollectionMap, now = new Date().toISOString(),
): { apply: Array<[string, CollectionEntry | undefined]>; undo: Array<[string, CollectionEntry | undefined]> } {
  const working: Record<string, CollectionEntry | undefined> = {};
  const touched: string[] = [];
  const current = (pinId: string) => (pinId in working ? working[pinId] : collection[pinId]);

  for (const row of rows) {
    if (!ticked.has(row.key)) continue;
    if (!touched.includes(row.pinhuntId)) touched.push(row.pinhuntId);
    working[row.pinhuntId] = applyRow(row, current(row.pinhuntId), now);
  }

  return {
    apply: touched.map(pinId => [pinId, working[pinId]]),
    undo: touched.map(pinId => [pinId, collection[pinId]]),
  };
}

/** Remembers, per collector and trade, that they answered the sheet (updated or "Not Now"). */
export const collectionUpdateOfferedKey = (userId: string, tradeId: string) =>
  `@pinhunt_trade_collection_update_v1:${userId}:${tradeId}`;

/**
 * Remembers, per collector and trade, that the update was applied, so the
 * same trade can't be applied twice. Undo clears it.
 */
export const collectionUpdateAppliedKey = (userId: string, tradeId: string) =>
  `@pinhunt_trade_collection_applied_v1:${userId}:${tradeId}`;
