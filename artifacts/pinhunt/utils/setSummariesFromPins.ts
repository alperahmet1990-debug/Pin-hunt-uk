import type { CataloguePin, PinSetSummary } from '@workspace/pin-repository';

/**
 * Set summaries built from catalogue pins, for mock mode only (no Supabase,
 * so no `getSetSummaries`). One summary per distinct `collection`, named the
 * way `CataloguePin.collection` and Set Detail name it (#202).
 */
export function setSummariesFromPins(pins: Pick<CataloguePin, 'collection' | 'releaseYear'>[]): PinSetSummary[] {
  const bySet = new Map<string, { count: number; year?: number }>();
  for (const pin of pins) {
    if (!pin.collection) continue;
    const entry = bySet.get(pin.collection) ?? { count: 0, year: pin.releaseYear };
    entry.count += 1;
    bySet.set(pin.collection, entry);
  }
  return [...bySet].map(([setName, { count, year }]) => ({
    id: `mock-set:${setName}`,
    normalisedSeries: setName,
    setName,
    releaseYear: year,
    releasedPinCount: count,
    isComplete: true,
  }));
}
