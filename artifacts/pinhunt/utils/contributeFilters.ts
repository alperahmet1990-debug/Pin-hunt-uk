/**
 * Filters for the contributor catalogue screen (#396): year, park/origin,
 * character and set, plus the label for what a pin is missing. Pure, so the
 * screen stays thin and the logic is unit-tested.
 */
import type { CatalogueImageCoverage } from '@workspace/pin-repository';

export type FacetKey = 'year' | 'origin' | 'character' | 'set';
export type FacetFilters = Record<FacetKey, string | null>;

export const NO_FACETS: FacetFilters = { year: null, origin: null, character: null, set: null };

export const FACET_TITLES: Record<FacetKey, string> = {
  year: 'Year', origin: 'Park', character: 'Character', set: 'Set',
};

/** Every character on the pin: all_characters (comma-separated) plus the main one. */
export function charactersOf(row: CatalogueImageCoverage): string[] {
  const names = (row.allCharacters ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (row.mainCharacter?.trim()) names.push(row.mainCharacter.trim());
  return [...new Set(names)];
}

function facetValues(row: CatalogueImageCoverage, key: FacetKey): string[] {
  switch (key) {
    case 'year': return row.releaseYear ? [String(row.releaseYear)] : [];
    case 'origin': return row.origin?.trim() ? [row.origin.trim()] : [];
    case 'character': return charactersOf(row);
    case 'set': return [row.setName];
  }
}

export function matchesFacets(row: CatalogueImageCoverage, filters: FacetFilters): boolean {
  return (Object.keys(filters) as FacetKey[]).every(key => {
    const want = filters[key];
    return want === null || facetValues(row, key).includes(want);
  });
}

/** The choices for one facet, with counts; years newest first, the rest A–Z. */
export function facetOptions(rows: CatalogueImageCoverage[], key: FacetKey): Array<{ value: string; label: string }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const v of facetValues(row, key)) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (key === 'year' ? Number(b) - Number(a) : a.localeCompare(b)))
    .map(([value, count]) => ({ value, label: `${value} (${count})` }));
}

const MISSING_LABEL: Record<string, string> = {
  release_year: 'year', set: 'set', characters: 'characters', origin: 'park',
};

/** "Missing: year, park" — or null when nothing is missing. */
export function missingLabel(row: CatalogueImageCoverage): string | null {
  const names = (row.missingFields ?? []).map(f => MISSING_LABEL[f] ?? f);
  return names.length ? `Missing: ${names.join(', ')}` : null;
}
