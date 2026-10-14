import { buildLargeCatalogue, buildLargeCollection } from '../../mock-data/largeFixture';
import { setSummariesFromPins } from '../setSummariesFromPins';
import { buildSetGroups, compareIsoDesc, compareText, indexBySet, partitionByStatus } from '../collectionDerive';
import { previousLists, previousSetGroups } from './previousCollectionDerive';

// UX-051 (#159): the faster derivations give exactly what My Collection
// computed before (previousCollectionDerive.ts is the code they replace).
describe('collection derivations (UX-051)', () => {
  const catalogue = buildLargeCatalogue(2000);
  const collection = buildLargeCollection(catalogue);

  it('status lists match the previous three-filter version', () => {
    const now = partitionByStatus(catalogue, collection);
    const before = previousLists(catalogue, collection);
    expect(now.owned).toEqual(before.owned);
    expect(now.forTrade).toEqual(before.forTrade);
    expect(now.wanted).toEqual(before.wanted);
    expect(now.owned.length).toBe(1600);
  });

  it('set groups match the previous O(sets × catalogue) version', () => {
    const { owned } = partitionByStatus(catalogue, collection);
    const now = buildSetGroups(setSummariesFromPins(catalogue), indexBySet(catalogue), owned, collection);
    expect(now).toEqual(previousSetGroups(catalogue, collection));
    expect(now.length).toBeGreaterThan(100);
  });

  it('counts For Trade as owned toward set progress, never ISO', () => {
    const pins = buildLargeCatalogue(3, 3);
    const groups = buildSetGroups(setSummariesFromPins(pins), indexBySet(pins), [pins[0], pins[1]], {
      [pins[0].id]: { pinId: pins[0].id, status: 'owned', quantity: 1, notes: '', dateAdded: '' },
      [pins[1].id]: { pinId: pins[1].id, status: 'for_trade', quantity: 1, notes: '', dateAdded: '' },
      [pins[2].id]: { pinId: pins[2].id, status: 'wanted', quantity: 1, notes: '', dateAdded: '' },
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].subtitle).toBe('2 / 3 · 67%');
    expect(groups[0].complete).toBe(false);
  });

  it('sort helpers order like the previous localeCompare calls', () => {
    const dates = ['2026-01-02T00:00:00.000Z', '', '2025-12-31T23:59:00.000Z', '2026-01-02T00:00:00.000Z'];
    expect([...dates].sort(compareIsoDesc)).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
    const names = ['stitch', 'Ariel', 'belle', 'Éclair', 'Dumbo'];
    expect([...names].sort(compareText)).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
