import { ALL_PINS_BOARD_ID, buildBoardItems } from '../collectionBoards';
import type { Board } from '@/types/board';
import type { CataloguePin } from '@workspace/pin-repository';

// UX-067 (#340): the Boards tab's cards and their counts.
const pin = (id: string, title = id) => ({ id, title, characters: [] }) as unknown as CataloguePin;
const pins = ['a', 'b', 'c', 'd', 'e'].map(id => pin(id, `Pin ${id}`));
const board = (id: string, name: string, pinIds: string[], createdAt: string): Board =>
  ({ id, name, pinIds, createdAt, isCustom: true });
const boards = [
  board('b1', 'Zoo', ['a'], '2026-10-01'),
  board('b2', 'Apples', ['a', 'b', 'c'], '2026-10-03'),
  board('b3', 'Mid', ['d', 'e'], '2026-10-02'),
];
const getBoardPins = (b: Board) => pins.filter(p => b.pinIds.includes(p.id));
const collection = { b: { status: 'for_trade' }, d: { status: 'for_trade' }, a: { status: 'owned' } };

describe('buildBoardItems', () => {
  it('puts All pins first, then boards newest first, with pin and for-trade counts', () => {
    const items = buildBoardItems(boards, getBoardPins, pins, collection, 'recent');
    expect(items.map(i => i.id)).toEqual([ALL_PINS_BOARD_ID, 'b2', 'b3', 'b1']);
    expect(items[0]).toMatchObject({ title: 'All pins', count: 5, tradeCount: 2, isAll: true });
    expect(items[1]).toMatchObject({ title: 'Apples', count: 3, tradeCount: 1 });
    expect(items[1].pins).toHaveLength(3);
  });

  it('sorts by name and by most pins', () => {
    expect(buildBoardItems(boards, getBoardPins, pins, collection, 'name').map(i => i.title))
      .toEqual(['All pins', 'Apples', 'Mid', 'Zoo']);
    expect(buildBoardItems(boards, getBoardPins, pins, collection, 'size').map(i => i.title))
      .toEqual(['All pins', 'Apples', 'Mid', 'Zoo']);
  });

  it('previews at most four pins, and All pins can take counts from the summary', () => {
    const items = buildBoardItems(boards, getBoardPins, pins, collection, 'recent', '', { count: 9, tradeCount: 4 });
    expect(items[0]).toMatchObject({ count: 9, tradeCount: 4 });
    expect(items[0].pins).toHaveLength(4);
  });

  it('search matches board names or their pins, and hides All pins', () => {
    expect(buildBoardItems(boards, getBoardPins, pins, collection, 'recent', 'zoo').map(i => i.id)).toEqual(['b1']);
    expect(buildBoardItems(boards, getBoardPins, pins, collection, 'recent', 'pin e').map(i => i.id)).toEqual(['b3']);
  });
});
