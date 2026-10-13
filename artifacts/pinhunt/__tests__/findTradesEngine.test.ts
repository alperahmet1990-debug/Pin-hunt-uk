import { buildDiscoveryItems, deriveCollectionInterests } from '../utils/findTradesEngine';

const pin = (id: string, title: string) => ({ id, title });
const forTrade = (pinId: string, title: string, traderId = 't1') => ({
  pinId, title, traderId, traderUsername: traderId, imageUrl: undefined,
}) as never;

describe('deriveCollectionInterests (B-P2-11)', () => {
  it('finds recurring subjects across owned and ISO pins, strongest first', () => {
    const interests = deriveCollectionInterests([
      pin('a', 'Hawaii Series - Stitch Surfing'),
      pin('b', 'Holiday 2024 - Stitch'),
      pin('c', 'Park Icons - Stitch and Scrump'),
      pin('d', 'Classics - Mickey Mouse'),
      pin('e', 'Retro - Mickey Mouse Ears'),
      pin('f', 'Castle - Fireworks'),
    ]);
    expect(interests[0]).toEqual({ label: 'Stitch', keywords: ['stitch'] });
    // Words that always appear together merge into one interest.
    expect(interests[1]).toEqual({ label: 'Mickey Mouse', keywords: ['mickey', 'mouse'] });
    // One-off subjects aren't an interest once there's more than one pin.
    expect(interests.some(i => i.keywords.includes('fireworks'))).toBe(false);
  });

  it('uses the subject of a single pin', () => {
    expect(deriveCollectionInterests([pin('a', 'Classics - Dumbo')])).toEqual([{ label: 'Dumbo', keywords: ['dumbo'] }]);
  });

  it('caps the number of interests and returns none for no pins', () => {
    const pins = ['Ariel', 'Belle', 'Jasmine', 'Mulan'].flatMap((n, i) => [pin(`${i}a`, `A - ${n}`), pin(`${i}b`, `B - ${n}`)]);
    expect(deriveCollectionInterests(pins)).toHaveLength(3);
    expect(deriveCollectionInterests([])).toEqual([]);
  });
});

describe('Based on your collection without Boards', () => {
  it('recommends For Trade pins matching what the collector owns and wants, excluding their own', () => {
    const interests = deriveCollectionInterests([
      pin('own1', 'Hawaii Series - Stitch Surfing'),
      pin('iso1', 'Holiday 2024 - Stitch'),
    ]);
    const items = buildDiscoveryItems(
      [
        forTrade('x1', 'Valentine - Stitch', 't1'),
        forTrade('x1', 'Valentine - Stitch', 't2'),
        forTrade('iso1', 'Holiday 2024 - Stitch', 't3'),
        forTrade('x2', 'Classics - Dumbo', 't1'),
      ],
      interests,
      new Set(['own1', 'iso1']),
    );
    expect(items).toEqual([{ pinId: 'x1', title: 'Valentine - Stitch', imageUrl: undefined, collectorCount: 2, tags: ['Stitch'] }]);
  });
});
