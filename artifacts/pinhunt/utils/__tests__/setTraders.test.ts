import { availablePinCount, groupByCollector, hasThemLabel, pinsToAddToIso } from '../setTraders';

const row = (pinId: string, traderId: string, traderUsername = traderId) =>
  ({ pinId, title: `Pin ${pinId}`, traderId, traderUsername });

describe('groupByCollector (UX-021)', () => {
  it('groups per collector, most missing pins first, then by name', () => {
    const traders = groupByCollector([
      row('a', 't1', 'zed'), row('a', 't2', 'bea'), row('b', 't2', 'bea'),
      row('c', 't3', 'amy'), row('b', 't3', 'amy'),
    ]);
    expect(traders.map(t => [t.username, t.pins.map(p => p.pinId)])).toEqual([
      ['amy', ['c', 'b']],
      ['bea', ['a', 'b']],
      ['zed', ['a']],
    ]);
    expect(availablePinCount(traders)).toBe(3);
  });

  it('counts a pin once per collector even with several copies listed', () => {
    const [t] = groupByCollector([row('a', 't1'), row('a', 't1')]);
    expect(t.pins).toHaveLength(1);
  });

  it('is empty for no rows', () => {
    expect(groupByCollector([])).toEqual([]);
    expect(availablePinCount([])).toBe(0);
  });
});

describe('hasThemLabel', () => {
  it.each([
    [1, 1, 'has it'],
    [3, 3, 'has all 3'],
    [1, 7, 'has 1 of them'],
    [2, 7, 'has 2 of them'],
  ])('%i of %i → %s', (count, total, label) => {
    expect(hasThemLabel(count, total)).toBe(label);
  });
});

describe('pinsToAddToIso', () => {
  it('skips pins already owned, For Trade or on the ISO', () => {
    const status: Record<string, string> = { b: 'wanted', c: 'owned', d: 'for_trade', e: 'none' };
    expect(pinsToAddToIso(['a', 'b', 'c', 'd', 'e'], id => status[id])).toEqual(['a', 'e']);
  });
});
