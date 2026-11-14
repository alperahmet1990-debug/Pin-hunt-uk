/**
 * Contributor coverage filtering, paging and counting on the device.
 *
 * Used when the database doesn't have migration 077 (catalogue_coverage_page
 * and friends): the repository then loads get_catalogue_image_coverage (048)
 * once and answers the same queries here. The rules match 077's
 * pinhunt_private.coverage_where exactly, so both paths give the same rows.
 */
import type {
  CatalogueImageCoverage, CoverageFacetKey, CoverageFacets, CoverageFilter,
  CoveragePageQuery, CoverageStats, CoverageSummary,
} from './types';

export const isCoveragePending = (r: CatalogueImageCoverage) => r.myStatus === 'pending' || r.pendingCount > 0;

export function matchesCoverageFilter(r: CatalogueImageCoverage, filter: CoverageFilter = 'all'): boolean {
  switch (filter) {
    case 'needs': return r.imageSource === null && r.pendingCount === 0 && r.myStatus !== 'pending';
    case 'reference': return r.imageSource === 'reference';
    case 'community': return r.imageSource === 'community';
    case 'pending': return isCoveragePending(r);
    case 'info': return (r.missingFields?.length ?? 0) > 0;
    case 'back': return r.needsBackImage === true;
    default: return true;
  }
}

/** Every character on the pin: all_characters (comma-separated) plus the main one. */
export function coverageCharacters(r: CatalogueImageCoverage): string[] {
  const names = (r.allCharacters ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (r.mainCharacter?.trim()) names.push(r.mainCharacter.trim());
  return [...new Set(names)];
}

export function matchesCoverageFacets(r: CatalogueImageCoverage, f: CoverageFacets): boolean {
  if (f.year != null && r.releaseYear !== f.year) return false;
  if (f.origin != null && r.origin !== f.origin) return false;
  if (f.set != null && r.setName !== f.set) return false;
  if (f.character != null && !coverageCharacters(r).includes(f.character)) return false;
  return true;
}

function matchesQuery(r: CatalogueImageCoverage, query: string | null | undefined): boolean {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return true;
  if (r.pinhuntId.toLowerCase().startsWith(q)) return true;
  const words = q.replace(/[,().]/g, ' ').split(/\s+/).filter(Boolean);
  const hay = [r.title, r.setName, r.mainCharacter, r.allCharacters, r.origin].join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
}

const compare = (a: CatalogueImageCoverage, b: CatalogueImageCoverage) =>
  a.setName.localeCompare(b.setName) || a.title.localeCompare(b.title) || a.pinhuntId.localeCompare(b.pinhuntId);

export function coveragePageLocal(all: CatalogueImageCoverage[], q: CoveragePageQuery): { rows: CatalogueImageCoverage[]; total: number } {
  const ids = q.ids ? new Set(q.ids) : null;
  const match = all
    .filter(r => (!ids || ids.has(r.pinhuntId))
      && matchesCoverageFacets(r, q)
      && matchesQuery(r, q.query)
      && matchesCoverageFilter(r, q.filter))
    .sort(compare);
  return { rows: match.slice(q.offset, q.offset + q.limit), total: match.length };
}

export function coverageSummaryLocal(
  all: CatalogueImageCoverage[], facets: CoverageFacets, owned: string[], facet: CoverageFacetKey | null,
): CoverageSummary {
  const ownedSet = new Set(owned);
  const stats: CoverageStats = { total: 0, withPhoto: 0, community: 0, reference: 0, needs: 0, pending: 0, mine: 0, info: 0, back: 0 };
  for (const r of all) {
    if (!matchesCoverageFacets(r, facets)) continue;
    stats.total++;
    if (r.imageSource) stats.withPhoto++;
    if (r.imageSource === 'community') stats.community++;
    if (r.imageSource === 'reference') stats.reference++;
    if (matchesCoverageFilter(r, 'needs')) stats.needs++;
    if (isCoveragePending(r)) stats.pending++;
    if (ownedSet.has(r.pinhuntId)) stats.mine++;
    if (matchesCoverageFilter(r, 'info')) stats.info++;
    if (matchesCoverageFilter(r, 'back')) stats.back++;
  }
  let options: CoverageSummary['facet'] = null;
  if (facet) {
    const counts = new Map<string, number>();
    const others: CoverageFacets = { ...facets, [facet]: null };
    for (const r of all) {
      if (!matchesCoverageFacets(r, others)) continue;
      const values = facet === 'year' ? (r.releaseYear ? [String(r.releaseYear)] : [])
        : facet === 'origin' ? (r.origin?.trim() ? [r.origin.trim()] : [])
          : facet === 'set' ? [r.setName]
            : coverageCharacters(r);
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    options = [...counts.entries()]
      .sort(([a], [b]) => (facet === 'year' ? Number(b) - Number(a) : a.localeCompare(b)))
      .map(([value, count]) => ({ value, count }));
  }
  return { stats, facet: options };
}

export function coverageSetTotalsLocal(all: CatalogueImageCoverage[], sets: string[]): Record<string, { total: number; withPhoto: number }> {
  const want = new Set(sets);
  const out: Record<string, { total: number; withPhoto: number }> = {};
  for (const r of all) {
    if (!want.has(r.setName)) continue;
    const t = (out[r.setName] ??= { total: 0, withPhoto: 0 });
    t.total++;
    if (r.imageSource) t.withPhoto++;
  }
  return out;
}
