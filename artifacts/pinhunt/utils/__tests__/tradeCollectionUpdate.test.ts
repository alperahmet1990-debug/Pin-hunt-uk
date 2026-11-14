/**
 * WP1 step 3: "Update your collection?" after a trade completes, and the
 * "UK asking ~£x" chip rule.
 */
import type { CataloguePin, TradeItem } from '@workspace/pin-repository';
import type { CollectionEntry, CollectionMap } from '@/types/collection';
import { collectionUpdateRows, planCollectionUpdate } from '../tradeCollectionUpdate';
import { buildSetGroups, indexBySet, partitionByStatus } from '../collectionDerive';
import { ukAskingLine } from '@/hooks/useMarketValue';

const entry = (pinId: string, status: CollectionEntry['status'], quantity = 1): CollectionEntry =>
  ({ pinId, status, quantity, notes: 'kept', dateAdded: '2026-01-01T00:00:00Z' });
const item = (id: string, direction: TradeItem['direction'], pinhuntId: string, quantity = 1): TradeItem =>
  ({ id, tradeId: 't1', direction, pinhuntId, title: `Pin ${pinhuntId}`, quantity, createdAt: '' });
const NOW = '2026-11-14T12:00:00Z';
const all = (rows: { key: string }[]) => new Set(rows.map(r => r.key));

describe('collectionUpdateRows', () => {
  // The viewer proposed the trade, so 'offered' pins are the ones they sent.
  const collection: CollectionMap = {
    A: entry('A', 'for_trade', 3),
    B: entry('B', 'for_trade', 1),
    D: entry('D', 'wanted'),
    E: entry('E', 'owned', 2),
  };
  const items = [
    item('1', 'offered', 'A'),
    item('2', 'offered', 'B'),
    item('3', 'offered', 'C'), // not in their collection: nothing to take off
    item('4', 'requested', 'D'),
    item('5', 'requested', 'E'),
    item('6', 'requested', 'F'),
  ];

  it('offers one pre-ticked row per change, worded for what it does', () => {
    const rows = collectionUpdateRows(items, true, collection);
    expect(rows.map(r => [r.pinhuntId, r.side, r.action])).toEqual([
      ['A', 'give', 'Keep 2 copies'],
      ['B', 'give', 'Remove from your collection'],
      ['D', 'get', 'Mark Owned and take off your ISO'],
      ['E', 'get', 'Add to your copies (3 in all)'],
      ['F', 'get', 'Mark Owned'],
    ]);
  });

  it('reads the same trade from the other side', () => {
    const rows = collectionUpdateRows(items, false, collection);
    expect(rows.find(r => r.pinhuntId === 'A')?.side).toBe('get');
    expect(rows.find(r => r.pinhuntId === 'E')?.side).toBe('give');
  });

  it('plans one write per pin, and an Undo that puts every pin back', () => {
    const rows = collectionUpdateRows(items, true, collection);
    const { apply, undo } = planCollectionUpdate(rows, all(rows), collection, NOW);
    const after = Object.fromEntries(apply);
    expect(after.A).toMatchObject({ status: 'for_trade', quantity: 2, notes: 'kept' }); // still For Trade
    expect(after.B).toBeUndefined(); // removed
    expect(after.D).toMatchObject({ status: 'owned', quantity: 1 }); // off the ISO
    expect(after.E).toMatchObject({ status: 'owned', quantity: 3 });
    expect(after.F).toEqual({ pinId: 'F', status: 'owned', quantity: 1, notes: '', dateAdded: NOW });
    expect(Object.fromEntries(undo)).toEqual({ A: collection.A, B: collection.B, D: collection.D, E: collection.E, F: undefined });
  });

  it('leaves unticked rows alone', () => {
    const rows = collectionUpdateRows(items, true, collection);
    const { apply } = planCollectionUpdate(rows, new Set([rows[0].key]), collection, NOW);
    expect(apply.map(([id]) => id)).toEqual(['A']);
  });

  it('handles the same pin on both sides and quantities above one', () => {
    const swap = [item('1', 'offered', 'A', 2), item('2', 'requested', 'A')];
    const rows = collectionUpdateRows(swap, true, { A: entry('A', 'for_trade', 3) });
    const { apply } = planCollectionUpdate(rows, all(rows), { A: entry('A', 'for_trade', 3) }, NOW);
    expect(apply).toEqual([['A', expect.objectContaining({ quantity: 2, status: 'for_trade' })]]);
    // Each row reads the way the collection will be by then.
    expect(rows.map(r => r.action)).toEqual(['Keep 1 copy', 'Add to your copies (2 in all)']);
  });
});

describe('set progress counts unique pins', () => {
  it("doesn't change when copies change", () => {
    const pins = ['A', 'B', 'C'].map(id => ({ id, title: id, collection: 'Park Icons', characters: [], brand: 'Disney Parks' })) as unknown as CataloguePin[];
    const summaries = [{ setName: 'Park Icons', releasedPinCount: 3 }] as never;
    const progress = (collection: CollectionMap) =>
      buildSetGroups(summaries, indexBySet(pins), partitionByStatus(pins, collection).owned, collection)[0].subtitle;
    expect(progress({ A: entry('A', 'owned', 1) })).toBe(progress({ A: entry('A', 'owned', 5) }));
  });
});

describe('ukAskingLine', () => {
  const v = { marketplace: 'EBAY_GB' as const, currency: 'GBP', mid: 14.4, confidence: 'medium', calculatedAt: '', stale: false };
  it('shows only confident UK values', () => {
    expect(ukAskingLine(v)).toBe('UK asking ~£14');
    expect(ukAskingLine({ ...v, confidence: 'high', mid: 9.6 })).toBe('UK asking ~£10');
    expect(ukAskingLine({ ...v, confidence: 'low' })).toBeNull();
    expect(ukAskingLine({ ...v, confidence: undefined })).toBeNull();
    expect(ukAskingLine({ ...v, marketplace: 'EBAY_US', currency: 'USD' })).toBeNull();
    expect(ukAskingLine(null)).toBeNull();
  });
});
