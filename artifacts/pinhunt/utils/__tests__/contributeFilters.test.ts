import type { CatalogueImageCoverage } from '@workspace/pin-repository';
import { charactersOf, facetOptions, matchesFacets, missingLabel, NO_FACETS } from '../contributeFilters';

// Contributor catalogue filters (#396).
const row = (over: Partial<CatalogueImageCoverage>): CatalogueImageCoverage => ({
  pinhuntId: 'PHUK-1', title: 'Pin', setName: 'Park Icons', imageSource: null, pendingCount: 0, ...over,
});

const rows = [
  row({ pinhuntId: 'a', releaseYear: 2024, origin: 'Disneyland Paris', allCharacters: 'Mickey, Minnie', setName: 'Park Icons' }),
  row({ pinhuntId: 'b', releaseYear: 2022, origin: 'Walt Disney World', mainCharacter: 'Stitch', setName: 'Ohana' }),
  row({ pinhuntId: 'c', releaseYear: 2024, origin: 'Disneyland Paris', allCharacters: 'Stitch', setName: 'Ohana' }),
];

describe('contributor catalogue filters', () => {
  it('combines year, park, character and set', () => {
    const pick = (f: Partial<typeof NO_FACETS>) => rows.filter(r => matchesFacets(r, { ...NO_FACETS, ...f })).map(r => r.pinhuntId);
    expect(pick({})).toEqual(['a', 'b', 'c']);
    expect(pick({ year: '2024' })).toEqual(['a', 'c']);
    expect(pick({ year: '2024', character: 'Stitch' })).toEqual(['c']);
    expect(pick({ origin: 'Walt Disney World', set: 'Ohana' })).toEqual(['b']);
    expect(pick({ character: 'Minnie', set: 'Ohana' })).toEqual([]);
  });

  it('reads characters from all_characters and the main character, once each', () => {
    expect(charactersOf(row({ allCharacters: 'Mickey, Minnie ,', mainCharacter: 'Mickey' }))).toEqual(['Mickey', 'Minnie']);
  });

  it('lists choices with counts: years newest first, others A–Z', () => {
    expect(facetOptions(rows, 'year')).toEqual([
      { value: '2024', label: '2024 (2)' },
      { value: '2022', label: '2022 (1)' },
    ]);
    expect(facetOptions(rows, 'character').map(o => o.label)).toEqual(['Mickey (1)', 'Minnie (1)', 'Stitch (2)']);
  });

  it('says what a pin is missing, in plain words', () => {
    expect(missingLabel(row({ missingFields: ['release_year', 'origin'] }))).toBe('Missing: year, park');
    expect(missingLabel(row({ missingFields: [] }))).toBeNull();
    expect(missingLabel(row({}))).toBeNull();
  });
});
