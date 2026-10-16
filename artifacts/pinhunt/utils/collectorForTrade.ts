/**
 * A collector's For Trade pins on their profile (UX-027, #139): pins on the
 * viewer's ISO first (the real matches), then the rest by name.
 */
import type { CollectorForTradePin } from '@workspace/pin-repository';
import { compareText } from '@/utils/collectionDerive';

export function sortCollectorForTrade(pins: CollectorForTradePin[], matchIds: Set<string>): CollectorForTradePin[] {
  return [...pins].sort((a, b) =>
    Number(matchIds.has(b.pinId)) - Number(matchIds.has(a.pinId)) || compareText(a.title, b.title));
}
