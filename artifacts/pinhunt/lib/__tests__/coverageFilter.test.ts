import {
  coveragePageLocal, coverageSetTotalsLocal, coverageSummaryLocal, matchesCoverageFilter,
  type CatalogueImageCoverage,
} from '@workspace/pin-repository';

// The on-device rules used without migration 077; they must match 077's SQL (coverage_where).
const row = (o: Partial<CatalogueImageCoverage> & { pinhuntId: string }): CatalogueImageCoverage => ({
  title: o.pinhuntId, setName: 'Set A', imageSource: null, pendingCount: 0, ...o,
});
const ROWS = [
  row({ pinhuntId: 'PHUK-10000003', title: 'Stitch Surf', setName: 'Ohana', releaseYear: 2024, origin: 'Disneyland Paris', allCharacters: 'Stitch, Lilo' }),
  row({ pinhuntId: 'PHUK-10000001', title: 'Mickey Castle', setName: 'Park Icons', releaseYear: 2025, imageSource: 'reference', missingFields: ['origin'] }),
  row({ pinhuntId: 'PHUK-10000002', title: 'Lilo Hula', setName: 'Ohana', releaseYear: 2024, pendingCount: 1, needsBackImage: true }),
  row({ pinhuntId: 'PHUK-10000004', title: 'Figment', setName: 'Epcot', imageSource: 'community', myStatus: 'pending' }),
];

describe('coverage filters (same rules as migration 077)', () => {
  it.each([
    ['needs', ['PHUK-10000003']],
    ['reference', ['PHUK-10000001']],
    ['community', ['PHUK-10000004']],
    ['pending', ['PHUK-10000002', 'PHUK-10000004']],
    ['info', ['PHUK-10000001']],
    ['back', ['PHUK-10000002']],
  ] as const)('%s', (filter, ids) => {
    expect(ROWS.filter(r => matchesCoverageFilter(r, filter)).map(r => r.pinhuntId).sort()).toEqual([...ids].sort());
  });

  it('orders by set, then title, and pages with the total', () => {
    const p1 = coveragePageLocal(ROWS, { offset: 0, limit: 2 });
    expect(p1.rows.map(r => r.title)).toEqual(['Figment', 'Lilo Hula']);
    expect(p1.total).toBe(4);
    expect(coveragePageLocal(ROWS, { offset: 2, limit: 2 }).rows.map(r => r.title)).toEqual(['Stitch Surf', 'Mickey Castle']);
  });

  it('searches words or a PHUK id prefix, and narrows by facets and ids', () => {
    expect(coveragePageLocal(ROWS, { query: 'lilo', offset: 0, limit: 10 }).rows.map(r => r.pinhuntId)).toEqual(['PHUK-10000002', 'PHUK-10000003']);
    expect(coveragePageLocal(ROWS, { query: 'phuk-10000001', offset: 0, limit: 10 }).rows.map(r => r.title)).toEqual(['Mickey Castle']);
    expect(coveragePageLocal(ROWS, { character: 'Lilo', offset: 0, limit: 10 }).rows.map(r => r.title)).toEqual(['Stitch Surf']);
    expect(coveragePageLocal(ROWS, { year: 2024, set: 'Ohana', offset: 0, limit: 10 }).total).toBe(2);
    expect(coveragePageLocal(ROWS, { ids: ['PHUK-10000004'], offset: 0, limit: 10 }).rows.map(r => r.title)).toEqual(['Figment']);
  });

  it('counts under the facets and lists one facet ignoring its own filter', () => {
    const s = coverageSummaryLocal(ROWS, { year: 2024 }, ['PHUK-10000003', 'PHUK-10000001'], 'year');
    expect(s.stats).toEqual({ total: 2, withPhoto: 0, community: 0, reference: 0, needs: 1, pending: 1, mine: 1, info: 0, back: 1 });
    expect(s.facet).toEqual([{ value: '2025', count: 1 }, { value: '2024', count: 2 }]);
  });

  it('totals whole sets', () => {
    expect(coverageSetTotalsLocal(ROWS, ['Ohana', 'Epcot'])).toEqual({ Ohana: { total: 2, withPhoto: 0 }, Epcot: { total: 1, withPhoto: 1 } });
  });
});
