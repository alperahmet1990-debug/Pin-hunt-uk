import { setSummariesFromPins } from '../setSummariesFromPins';

describe('setSummariesFromPins (mock mode)', () => {
  it('makes one summary per set, named like CataloguePin.collection', () => {
    const summaries = setSummariesFromPins([
      { collection: 'Classics 2024', releaseYear: 2024 },
      { collection: 'Classics 2024', releaseYear: 2024 },
      { collection: 'Park Icons', releaseYear: 2023 },
      { collection: '', releaseYear: 2020 },
    ]);
    expect(summaries.map(s => [s.setName, s.releasedPinCount, s.releaseYear])).toEqual([
      ['Classics 2024', 2, 2024],
      ['Park Icons', 1, 2023],
    ]);
    expect(new Set(summaries.map(s => s.id)).size).toBe(2);
  });

  it('is empty for an empty catalogue', () => {
    expect(setSummariesFromPins([])).toEqual([]);
  });
});
