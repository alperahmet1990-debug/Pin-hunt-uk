import type { CollectionPlace, PinLocation } from '@workspace/pin-repository';
import { pagesOf, planHomes } from '../utils/pinHomes';

const book: CollectionPlace = { id: 'b', name: 'Trade book 2', kind: 'book', pages: 3, pocketsPerPage: 2, sortOrder: 0, createdAt: '' };
const frame: CollectionPlace = { id: 'f', name: 'Display frame, hallway', kind: 'display', pages: null, pocketsPerPage: null, sortOrder: 1, createdAt: '' };
const at = (pinId: string, page: number, pocket: number): PinLocation => ({ pinId, placeId: 'b', page, pocket, note: null, updatedAt: '' });

describe('planHomes (#547)', () => {
  it('puts every pin in a frame or lanyard without pages', () => {
    expect(planHomes(frame, [], ['a', 'b'])).toEqual({ inputs: [{ placeId: 'f' }, { placeId: 'f' }], overflow: 0 });
  });

  it('fills free pockets from the chosen page, then wraps to earlier pages', () => {
    const taken = [at('x', 2, 1)];
    expect(planHomes(book, taken, ['a', 'b', 'c'], { startPage: 2 }).inputs).toEqual([
      { placeId: 'b', page: 2, pocket: 2 },
      { placeId: 'b', page: 3, pocket: 1 },
      { placeId: 'b', page: 3, pocket: 2 },
    ]);
    expect(planHomes(book, taken, ['a', 'b', 'c', 'd'], { startPage: 3 }).inputs[2]).toEqual({ placeId: 'b', page: 1, pocket: 1 });
  });

  it("counts a moving pin's own pocket as free, and reports overflow when the book is full", () => {
    const full = [at('a', 1, 1), at('x', 1, 2), at('y', 2, 1), at('z', 2, 2), at('w', 3, 1), at('v', 3, 2)];
    expect(planHomes(book, full, ['a']).inputs).toEqual([{ placeId: 'b', page: 1, pocket: 1 }]);
    const plan = planHomes(book, full, ['new1', 'new2']);
    expect(plan.overflow).toBe(2);
    expect(plan.inputs).toEqual([{ placeId: 'b' }, { placeId: 'b' }]);
  });

  it('uses the exact pocket picked for a single pin', () => {
    expect(planHomes(book, [], ['a'], { page: 3, pocket: 2 }).inputs).toEqual([{ placeId: 'b', page: 3, pocket: 2 }]);
  });

  it('lays out a book page by page', () => {
    const pages = pagesOf(book, [at('a', 1, 2), at('b', 3, 1), { ...at('c', 1, 1), placeId: 'other' }]);
    expect(pages.get(1)?.get(2)).toBe('a');
    expect(pages.get(1)?.get(1)).toBeUndefined();
    expect(pages.get(3)?.get(1)).toBe('b');
  });
});
