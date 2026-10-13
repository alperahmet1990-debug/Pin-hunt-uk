/**
 * Board sort (UX-019, #131): the same three orders My Collection offers.
 * "Recently added" follows the board's own pin order (pins are appended
 * when added), newest first.
 */
import type { CataloguePin } from '@workspace/pin-repository';

export type BoardSort = 'recent' | 'name' | 'year';

export const BOARD_SORT_OPTIONS: { value: BoardSort; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'name', label: 'Name' },
  { value: 'year', label: 'Release date' },
];

export function sortBoardPins(pins: CataloguePin[], pinIds: string[], sort: BoardSort): CataloguePin[] {
  if (sort === 'name') return [...pins].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  if (sort === 'year') {
    const release = (p: CataloguePin) => p.releaseDate || p.releaseYear?.toString() || '';
    return [...pins].sort((a, b) => release(b).localeCompare(release(a)));
  }
  const order = new Map(pinIds.map((id, i) => [id, i]));
  return [...pins].sort((a, b) => (order.get(b.id) ?? -1) - (order.get(a.id) ?? -1));
}
