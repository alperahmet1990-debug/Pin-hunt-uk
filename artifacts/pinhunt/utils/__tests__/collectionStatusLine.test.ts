import { collectionStatusLine } from '../collectionStatusLine';

describe('collectionStatusLine', () => {
  it('counts For Trade pins as owned, with their quantity', () => {
    expect(collectionStatusLine('for_trade', 2)).toBe('You own 2 · all for trade');
    expect(collectionStatusLine('for_trade', 1)).toBe('You own 1 · for trade');
  });

  it('shows the owned quantity', () => {
    expect(collectionStatusLine('owned', 1)).toBe('You own 1');
    expect(collectionStatusLine('owned', 3)).toBe('You own 3');
  });

  it('keeps ISO distinct from owned', () => {
    expect(collectionStatusLine('wanted', 1)).toBe('On your ISO');
  });

  it('shows nothing for pins not in the collection', () => {
    expect(collectionStatusLine('none')).toBeNull();
    expect(collectionStatusLine(undefined)).toBeNull();
  });

  it('never reports zero copies of a pin in the collection', () => {
    expect(collectionStatusLine('for_trade', 0)).toBe('You own 1 · for trade');
  });
});
