/**
 * Boards tab on My Collection (UX-067, #340): the cards to show, in order.
 * "All pins" always comes first; collector boards follow in the chosen order.
 * Pure, so the counts and sort can be tested without the screen.
 */
import type { CataloguePin } from '@workspace/pin-repository';
import type { Board } from '@/types/board';
import type { BoardMosaicItem } from '@/components/BoardMosaicCard';
import { compareText } from '@/utils/collectionDerive';

export type BoardSort = 'recent' | 'name' | 'size';
export type CollectionView = 'grid' | 'list';

export const BOARD_SORT_LABELS: Record<BoardSort, string> = {
  recent: 'Recent',
  name: 'Name',
  size: 'Most pins',
};

/** Where the grid/list choice is remembered on this device. */
export const COLLECTION_VIEW_KEY = '@pinhunt_collection_view_v1';
export const ALL_PINS_BOARD_ID = '__all__';

interface Entry { status: string }

export function buildBoardItems(
  boards: Board[],
  getBoardPins: (board: Board) => CataloguePin[],
  ownedPins: CataloguePin[],
  collection: Record<string, Entry | undefined>,
  sort: BoardSort,
  query = '',
  /** Counts for "All pins", so it agrees with the summary while pins load. */
  allCounts?: { count: number; tradeCount: number },
): BoardMosaicItem[] {
  const isForTrade = (pin: CataloguePin) => collection[pin.id]?.status === 'for_trade';
  const q = query.trim().toLowerCase();
  const custom = boards
    .map(board => {
      const pins = getBoardPins(board);
      return { board, item: {
        id: board.id,
        title: board.name,
        pins: pins.slice(0, 4),
        count: pins.length,
        tradeCount: pins.filter(isForTrade).length,
      } as BoardMosaicItem, allPins: pins };
    })
    .filter(({ item, allPins }) => !q || item.title.toLowerCase().includes(q) || allPins.some(p => (p.title || '').toLowerCase().includes(q)))
    .sort((a, b) => {
      if (sort === 'name') return compareText(a.item.title, b.item.title);
      if (sort === 'size') return b.item.count - a.item.count || compareText(a.item.title, b.item.title);
      // Newest board first.
      return (b.board.createdAt || '').localeCompare(a.board.createdAt || '');
    })
    .map(({ item }) => item);
  const all: BoardMosaicItem = {
    id: ALL_PINS_BOARD_ID,
    title: 'All pins',
    pins: ownedPins.slice(0, 4),
    count: allCounts?.count ?? ownedPins.length,
    tradeCount: allCounts?.tradeCount ?? ownedPins.filter(isForTrade).length,
    isAll: true,
  };
  return q ? custom : [all, ...custom];
}
