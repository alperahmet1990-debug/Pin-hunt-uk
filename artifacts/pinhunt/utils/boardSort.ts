/**
 * Board page sort and counts (UX-019 #131, UX-067b #342).
 * "Date added" follows the board's own pin order (pins are appended when
 * added), newest first; the other orders fall back to it on ties.
 */
import type { CataloguePin } from '@workspace/pin-repository';
import { compareText } from '@/utils/collectionDerive';

export type BoardPinSort = 'recent' | 'name' | 'set' | 'trade';

export const BOARD_SORT_OPTIONS: { value: BoardPinSort; label: string }[] = [
  { value: 'recent', label: 'Date added' },
  { value: 'name', label: 'Pin name' },
  { value: 'set', label: 'Set' },
  { value: 'trade', label: 'For trade first' },
];

interface Entry { status?: string; quantity?: number }
type Collection = Record<string, Entry | undefined>;

export function sortBoardPins(
  pins: CataloguePin[],
  pinIds: string[],
  sort: BoardPinSort,
  collection: Collection = {},
): CataloguePin[] {
  const order = new Map(pinIds.map((id, i) => [id, i]));
  const byRecent = (a: CataloguePin, b: CataloguePin) => (order.get(b.id) ?? -1) - (order.get(a.id) ?? -1);
  const forTrade = (p: CataloguePin) => (collection[p.id]?.status === 'for_trade' ? 0 : 1);
  return [...pins].sort((a, b) => {
    if (sort === 'name') return compareText(a.title || '', b.title || '') || byRecent(a, b);
    if (sort === 'set') return compareText(a.collection || '', b.collection || '') || compareText(a.title || '', b.title || '');
    if (sort === 'trade') return forTrade(a) - forTrade(b) || byRecent(a, b);
    return byRecent(a, b);
  });
}

/** The board's stats card: pins, pins up for trade, and pins owned more than once. */
export function boardStats(pins: CataloguePin[], collection: Collection) {
  return {
    pins: pins.length,
    forTrade: pins.filter(p => collection[p.id]?.status === 'for_trade').length,
    duplicates: pins.filter(p => (collection[p.id]?.quantity ?? 0) > 1).length,
  };
}
