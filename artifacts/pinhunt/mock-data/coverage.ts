/**
 * Demo catalogue photo coverage (screenshot demo mode only, never a real
 * build). Loaded by hooks/useCatalogueCoverage when lib/demoMode says so, and
 * only for a demo contributor (`?demo_contributor=1`, see demoIsContributor).
 *
 * Rows: the mock catalogue (mock-data/pins.ts), about half with a community
 * photo, plus a few "just pulled from Pin & Pop" pins with no photo, so Home's
 * "New to the catalogue" strip and Contribute pictures → Newest have content.
 * Paging, filters and counts use the repository's on-device rules
 * (coverage-filter), the same ones the app falls back to without migration 077.
 */
import {
  coveragePageLocal, coverageSetTotalsLocal, coverageSummaryLocal,
  type CatalogueImageCoverage, type CoverageFacetKey, type CoverageFacets, type CoveragePage, type CoveragePageQuery,
  type CoverageSummary,
} from '@workspace/pin-repository';
import { PINS } from './pins';

const NEW_FROM_PIN_AND_POP: Array<[title: string, setName: string]> = [
  ['Stitch Snowman', 'Festive Friends 2026'],
  ['Mickey Wreath', 'Festive Friends 2026'],
  ['Minnie Gingerbread', 'Festive Friends 2026'],
  ['Figment Lantern', 'Epcot Lights'],
  ['Dumbo Bauble', 'Christmas Baubles'],
  ['Tinker Bell Star', 'Christmas Baubles'],
  ['Castle Snow Globe', 'Disneyland Paris Winter'],
  ['Olaf Skating', 'Disneyland Paris Winter'],
];

function demoRows(): CatalogueImageCoverage[] {
  const catalogue: CatalogueImageCoverage[] = PINS.map((p, i) => ({
    pinhuntId: p.id,
    title: p.title,
    setName: p.collection,
    origin: p.origin,
    allCharacters: p.characters.join(', '),
    imageSource: i % 2 === 0 ? 'community' : null,
    pendingCount: i === 3 ? 1 : 0,
    catalogueSource: 'pinhunt',
  }));
  const fresh: CatalogueImageCoverage[] = NEW_FROM_PIN_AND_POP.map(([title, setName], i) => ({
    pinhuntId: `PHUK-${10_000_900 + i}`,
    title,
    setName,
    releaseYear: 2026,
    origin: 'Disneyland Paris',
    imageSource: null,
    pendingCount: 0,
    catalogueSource: 'pin_and_pop',
  }));
  return [...catalogue, ...fresh];
}

export function createDemoCoverage() {
  const rows = demoRows();
  return {
    async getCatalogueCoveragePage(q: CoveragePageQuery): Promise<CoveragePage> {
      return coveragePageLocal(rows, q);
    },
    async getCatalogueCoverageSummary(facets: CoverageFacets, owned: string[], facet: CoverageFacetKey | null = null): Promise<CoverageSummary> {
      return coverageSummaryLocal(rows, facets, owned, facet);
    },
    async getCatalogueCoverageSetTotals(sets: string[]) {
      return coverageSetTotalsLocal(rows, sets);
    },
  };
}
