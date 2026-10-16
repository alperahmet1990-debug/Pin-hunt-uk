import { newlyCompletedSet } from '../setCompletion';

const pin = (id: string, collection: string) => ({ id, title: id, collection }) as never;
const pins = [pin('a1', 'Alpha'), pin('a2', 'Alpha'), pin('a3', 'Alpha'), pin('s1', 'Solo'), pin('b1', 'Beta'), pin('b2', 'Beta')];

describe('newlyCompletedSet (UX-023, #136)', () => {
  it('finds a set whose every pin is owned or For Trade', () => {
    const col = { a1: { status: 'owned' }, a2: { status: 'for_trade' }, a3: { status: 'owned' } };
    expect(newlyCompletedSet(['Alpha'], pins, col, new Set())?.name).toBe('Alpha');
    expect(newlyCompletedSet(['Alpha'], pins, col, new Set())?.pins).toHaveLength(3);
  });

  it('ignores ISO pins and sets that are still missing a pin', () => {
    const col = { a1: { status: 'owned' }, a2: { status: 'wanted' }, a3: { status: 'owned' } };
    expect(newlyCompletedSet(['Alpha'], pins, col, new Set())).toBeNull();
  });

  it('never celebrates a single-pin "set" (B-P1-06)', () => {
    expect(newlyCompletedSet(['Solo'], pins, { s1: { status: 'owned' } }, new Set())).toBeNull();
  });

  it('only once per set: celebrated sets are skipped', () => {
    const col = { b1: { status: 'owned' }, b2: { status: 'owned' } };
    expect(newlyCompletedSet(['Beta'], pins, col, new Set(['Beta']))).toBeNull();
  });
});
