import { isSnoozed, photoGaps, PHOTO_CARD_SNOOZE_MS } from '../photoGaps';

const row = (pinhuntId: string, imageSource: 'community' | 'reference' | null, myStatus?: string) =>
  ({ pinhuntId, title: pinhuntId, setName: 'S', imageSource, pendingCount: 0, myStatus }) as any;

describe('photoGaps (UX-056)', () => {
  const rows = [
    row('a', null), row('b', null, 'pending'), row('c', 'community'), row('d', 'reference'), row('e', null),
  ];

  it('lists only owned pins with no catalogue photo, splitting out ones already sent', () => {
    const { todo, sent } = photoGaps(rows, new Set(['a', 'b', 'c', 'd']));
    expect(todo.map(r => r.pinhuntId)).toEqual(['a']);
    expect(sent.map(r => r.pinhuntId)).toEqual(['b']);
  });

  it('limits to the given pins, and still only owned ones (an ISO pin is not in hand)', () => {
    const { todo } = photoGaps(rows, new Set(['a', 'e']), ['e', 'x']);
    expect(todo.map(r => r.pinhuntId)).toEqual(['e']);
    expect(photoGaps(rows, new Set(), ['a', 'e']).todo).toEqual([]);
  });
});

describe('isSnoozed', () => {
  const now = 1_000_000_000_000;
  it.each([
    [null, false],
    ['nonsense', false],
    [String(now - 1000), true],
    [String(now - PHOTO_CARD_SNOOZE_MS - 1), false],
  ])('%s → %s', (at, expected) => {
    expect(isSnoozed(at as string | null, now)).toBe(expected);
  });
});
