// The My Collection derivations as they were before UX-051 (#159), kept as
// the reference the faster versions in utils/collectionDerive.ts must match,
// and as the "before" side of __tests__/collection.bench.tsx.
import type { CataloguePin } from '@workspace/pin-repository';
import type { CollectionMap } from '@/types/collection';
import { setSummariesFromPins } from '../setSummariesFromPins';

export function previousLists(catalogue: CataloguePin[], collection: CollectionMap) {
  const entries = Object.values(collection);
  const ownedIds = new Set(entries.filter(e => e.status === 'owned' || e.status === 'for_trade').map(e => e.pinId));
  const forTradeIds = new Set(entries.filter(e => e.status === 'for_trade').map(e => e.pinId));
  const wantedIds = new Set(entries.filter(e => e.status === 'wanted').map(e => e.pinId));
  return {
    owned: catalogue.filter(p => ownedIds.has(p.id)),
    forTrade: catalogue.filter(p => forTradeIds.has(p.id)),
    wanted: catalogue.filter(p => wantedIds.has(p.id)),
    ownedIds,
    forTradeIds,
  };
}

export function previousSetGroups(catalogue: CataloguePin[], collection: CollectionMap) {
  const { owned, ownedIds, forTradeIds } = previousLists(catalogue, collection);
  const ownedSetNames = new Set(owned.map(p => p.collection).filter(Boolean));
  return setSummariesFromPins(catalogue)
    .filter(summary => ownedSetNames.has(summary.setName))
    .map(summary => {
      const pins = catalogue.filter(pin => pin.collection === summary.setName);
      const ownedCount = pins.filter(pin => ownedIds.has(pin.id) || forTradeIds.has(pin.id)).length;
      const total = pins.length;
      const complete = total > 0 && ownedCount >= total;
      return {
        isGroup: true as const, id: summary.id, setId: summary.id, title: summary.setName,
        subtitle: complete ? `${ownedCount} / ${total} · Complete ✓` : `${ownedCount} / ${total} · ${total ? Math.round((ownedCount / total) * 100) : 0}%`,
        pins, isSet: true as const, progress: total > 0 ? Math.min(ownedCount / total, 1) : 0, complete,
      };
    });
}

