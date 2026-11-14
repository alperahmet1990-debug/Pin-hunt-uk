import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { CatalogueBrowsePageQuery } from '@workspace/pin-repository';
import { useCatalogueBrowseIndex, type BrowseFilters } from '../useCatalogueBrowseIndex';

let mockPins: Array<Record<string, unknown>> = [];
let mockRepository: { getCatalogueBrowsePage: jest.Mock; getAllSetNames: jest.Mock } | null = null;
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, repository: mockRepository }),
}));

const pin = (id: string, collection = 'Classics 2024') => ({ id, title: id, collection, brand: 'Disney Parks', characters: [] });
const NONE: BrowseFilters = { query: '', setName: null, year: null, edition: null };

/** Server stand-in: `named` pins in set "S" (ordered), plus `loose` with no set. */
function server(named: number, loose = 0) {
  const rows = [
    ...Array.from({ length: named }, (_, i) => ({ id: `n${String(i).padStart(4, '0')}`, title: `N${i}`, setName: `S${Math.floor(i / 10)}` })),
    ...Array.from({ length: loose }, (_, i) => ({ id: `u${i}`, title: `U${i}`, setName: 'Uncategorised' })),
  ];
  return jest.fn(async (q: CatalogueBrowsePageQuery) => {
    const match = rows.filter(r =>
      (q.setName === undefined || r.setName === q.setName)
      && (q.uncategorised !== true || r.setName === 'Uncategorised')
      && (q.uncategorised !== false || r.setName !== 'Uncategorised')
      && (!q.query || r.title.toLowerCase().includes(q.query.toLowerCase())));
    return { rows: match.slice(q.offset, q.offset + q.limit), total: q.withCount ? match.length : null };
  });
}

// The hook caches the unfiltered Supabase pages at module level, so the mock-mode test runs first.
describe('useCatalogueBrowseIndex', () => {
  it('mock mode: shows the catalogue once it loads after the first pass (#202)', async () => {
    mockRepository = null;
    mockPins = [];
    const { result, rerender } = await renderHook(() => useCatalogueBrowseIndex());
    expect(result.current.rows).toHaveLength(0);

    mockPins = [pin('a'), pin('b')];
    await rerender({});
    await waitFor(() => expect(result.current.rows.map(r => r.id)).toEqual(['a', 'b']));
    expect(result.current.rows[0].setName).toBe('Classics 2024');
  });

  it('mock mode: filters on the device', async () => {
    mockRepository = null;
    mockPins = [pin('stitch', 'A'), pin('mickey', 'B')];
    const { result } = await renderHook(() => useCatalogueBrowseIndex({ ...NONE, query: 'stit' }));
    await waitFor(() => expect(result.current.rows.map(r => r.id)).toEqual(['stitch']));
    expect(result.current.total).toBe(1);
    expect(result.current.catalogueTotal).toBe(2);
  });

  it('Supabase mode: loads one page, not the whole catalogue, and pages on loadMore', async () => {
    mockRepository = { getCatalogueBrowsePage: server(600, 3), getAllSetNames: jest.fn() };
    mockPins = [pin('a')];
    const { result, rerender } = await renderHook(() => useCatalogueBrowseIndex());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toHaveLength(240); // page of 240 ends exactly at a set boundary (sets of 10)
    expect(result.current.total).toBe(603);
    expect(result.current.hasMore).toBe(true);

    // A catalogue-context change doesn't refetch.
    const calls = mockRepository.getCatalogueBrowsePage.mock.calls.length;
    mockPins = [pin('a'), pin('b')];
    await rerender({});
    expect(mockRepository.getCatalogueBrowsePage.mock.calls.length).toBe(calls);

    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.rows).toHaveLength(480));
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.rows).toHaveLength(600));
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(result.current.rows).toHaveLength(603);
    expect(result.current.rows.slice(-3).every(r => r.setName === 'Uncategorised')).toBe(true);
  });

  it('Supabase mode: a filter change starts again from the server', async () => {
    mockRepository = { getCatalogueBrowsePage: server(50), getAllSetNames: jest.fn().mockResolvedValue(['S0', 'S1']) };
    let filters: BrowseFilters = NONE;
    const { result, rerender } = await renderHook(() => useCatalogueBrowseIndex(filters));
    await waitFor(() => expect(result.current.loading).toBe(false));

    filters = { ...NONE, setName: 'S2' };
    await rerender({});
    await waitFor(() => expect(result.current.rows.map(r => r.setName)).toEqual(Array(10).fill('S2')));
    expect(result.current.total).toBe(10);
    expect(mockRepository.getCatalogueBrowsePage).toHaveBeenCalledWith(expect.objectContaining({ setName: 'S2' }));
    expect(await result.current.loadSetNames()).toEqual(['S0', 'S1']);
  });
});
