/**
 * Derived collection lists for My Collection, built for large collections
 * (UX-051, #159): one pass over the catalogue for the status lists, and an
 * index of pins by set so set grouping is O(catalogue), not
 * O(sets × catalogue).
 */
import type { CataloguePin, PinSetSummary } from '@workspace/pin-repository';
import type { CollectionMap } from '@/types/collection';

export interface StatusLists {
  /** Owned and For Trade (both count as owned), in catalogue order. */
  owned: CataloguePin[];
  forTrade: CataloguePin[];
  wanted: CataloguePin[];
}

/** One pass over the catalogue instead of one filter per list. */
export function partitionByStatus(catalogue: CataloguePin[], collection: CollectionMap): StatusLists {
  const owned: CataloguePin[] = [];
  const forTrade: CataloguePin[] = [];
  const wanted: CataloguePin[] = [];
  for (const pin of catalogue) {
    const status = collection[pin.id]?.status;
    if (status === 'owned') owned.push(pin);
    else if (status === 'for_trade') { owned.push(pin); forTrade.push(pin); }
    else if (status === 'wanted') wanted.push(pin);
  }
  return { owned, forTrade, wanted };
}

/** Catalogue pins grouped by set name (catalogue order kept within each set). */
export function indexBySet(catalogue: CataloguePin[]): Map<string, CataloguePin[]> {
  const bySet = new Map<string, CataloguePin[]>();
  for (const pin of catalogue) {
    if (!pin.collection) continue;
    const list = bySet.get(pin.collection);
    if (list) list.push(pin);
    else bySet.set(pin.collection, [pin]);
  }
  return bySet;
}

export interface SetGroup {
  isGroup: true;
  id: string;
  setId: string;
  title: string;
  subtitle: string;
  pins: CataloguePin[];
  isSet: true;
  progress: number;
  complete: boolean;
}

/** Sets the collector has started, with progress, from the set index. */
export function buildSetGroups(
  summaries: PinSetSummary[],
  bySet: Map<string, CataloguePin[]>,
  ownedPins: CataloguePin[],
  collection: CollectionMap,
): SetGroup[] {
  const startedSets = new Set(ownedPins.map(p => p.collection).filter(Boolean));
  return summaries
    .filter(summary => startedSets.has(summary.setName))
    .map(summary => {
      const pins = bySet.get(summary.setName) ?? [];
      let ownedCount = 0;
      for (const pin of pins) {
        const status = collection[pin.id]?.status;
        if (status === 'owned' || status === 'for_trade') ownedCount++;
      }
      // Use the same catalogue membership that Set Detail renders.
      const total = pins.length;
      const complete = total > 0 && ownedCount >= total;
      return {
        isGroup: true as const,
        id: summary.id,
        setId: summary.id,
        title: summary.setName,
        subtitle: complete ? `${ownedCount} / ${total} · Complete ✓` : `${ownedCount} / ${total} · ${total ? Math.round((ownedCount / total) * 100) : 0}%`,
        pins,
        isSet: true as const,
        progress: total > 0 ? Math.min(ownedCount / total, 1) : 0,
        complete,
      };
    });
}

/** Shared collator: much cheaper than String#localeCompare per comparison. */
const collator = new Intl.Collator();
export const compareText = (a: string, b: string) => collator.compare(a, b);

/** ISO dates and years sort correctly as plain strings; no locale needed. */
export const compareIsoDesc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
