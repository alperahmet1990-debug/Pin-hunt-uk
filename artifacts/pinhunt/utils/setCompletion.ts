/**
 * Set-completion moment (UX-023, #136): which sets a collector has just
 * finished, and which they've already been congratulated on.
 */
import type { CataloguePin } from '@workspace/pin-repository';

/** A "set" needs at least two pins to celebrate (single-pin collections, B-P1-06). */
export const MIN_SET_SIZE = 2;

/** Where the sets already celebrated are remembered, per account on this device. */
export const celebratedSetsKey = (userId: string | undefined) => `@pinhunt_sets_celebrated_v1:${userId ?? 'local'}`;

interface Entry { status?: string }

/**
 * The first of `setNames` that is now complete and hasn't been celebrated:
 * every pin of the full set (loaded via ensureCollections) is owned or For
 * Trade, and the set has at least MIN_SET_SIZE pins.
 */
export function newlyCompletedSet(
  setNames: string[],
  pins: CataloguePin[],
  collection: Record<string, Entry | undefined>,
  celebrated: Set<string>,
): { name: string; pins: CataloguePin[] } | null {
  for (const name of setNames) {
    if (!name || celebrated.has(name)) continue;
    const setPins = pins.filter(p => p.collection === name);
    if (setPins.length < MIN_SET_SIZE) continue;
    const held = (p: CataloguePin) => ['owned', 'for_trade'].includes(collection[p.id]?.status ?? '');
    if (setPins.every(held)) return { name, pins: setPins };
  }
  return null;
}
