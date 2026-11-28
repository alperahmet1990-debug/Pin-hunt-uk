import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { CatalogueImageCoverage, CoveragePageQuery } from '@workspace/pin-repository';

const mockRepo = {
  getCatalogueCoveragePage: jest.fn(),
  getCatalogueCoverageSummary: jest.fn(),
  getCatalogueCoverageSetTotals: jest.fn(),
};
jest.mock('@/lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: true }));
jest.mock('@workspace/pin-repository', () => ({
  ...jest.requireActual('@workspace/pin-repository'),
  createSupabaseUserRepository: () => mockRepo,
}));

import {
  findNextContributionTarget, getCachedCoverage, markCoveragePending, resetCoverageCache,
  useCoverageFor, useCoveragePage, useNewestNeedingPhotos,
} from '../useCatalogueCoverage';

const row = (id: string, o: Partial<CatalogueImageCoverage> = {}): CatalogueImageCoverage => ({
  pinhuntId: id, title: id, setName: `Set ${id.slice(-1)}`, imageSource: null, pendingCount: 0, ...o,
});
const NO_STATS = { total: 0, withPhoto: 0, community: 0, reference: 0, needs: 0, pending: 0, mine: 0, info: 0, back: 0 };

beforeEach(() => {
  resetCoverageCache();
  jest.clearAllMocks();
  mockRepo.getCatalogueCoverageSummary.mockResolvedValue({ stats: NO_STATS, facet: null });
  mockRepo.getCatalogueCoverageSetTotals.mockResolvedValue({});
});

describe('useCoverageFor', () => {
  it('asks only for the given pins, once, and keeps them in the shared cache', async () => {
    mockRepo.getCatalogueCoveragePage.mockImplementation(async (q: CoveragePageQuery) => ({ rows: (q.ids ?? []).map(id => row(id)), total: q.ids?.length ?? 0 }));
    let ids = ['PHUK-1', 'PHUK-2'];
    const { result, rerender } = await renderHook(() => useCoverageFor(true, ids));
    await waitFor(() => expect(result.current.rows.map(r => r.pinhuntId)).toEqual(['PHUK-1', 'PHUK-2']));
    expect(mockRepo.getCatalogueCoveragePage).toHaveBeenLastCalledWith(expect.objectContaining({ ids: ['PHUK-1', 'PHUK-2'] }));

    ids = ['PHUK-1', 'PHUK-2', 'PHUK-3'];
    await rerender({});
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(mockRepo.getCatalogueCoveragePage).toHaveBeenLastCalledWith(expect.objectContaining({ ids: ['PHUK-3'] }));
    expect(getCachedCoverage('PHUK-3')?.pinhuntId).toBe('PHUK-3');

    await act(async () => { markCoveragePending('PHUK-3'); });
    expect(result.current.rows[2].myStatus).toBe('pending');
    expect(findNextContributionTarget('PHUK-1', new Set(['PHUK-2']))?.pinhuntId).toBe('PHUK-2');
  });

  it('loads nothing when the feature is off', async () => {
    const { result } = await renderHook(() => useCoverageFor(false, ['PHUK-1']));
    expect(result.current.rows).toEqual([]);
    expect(mockRepo.getCatalogueCoveragePage).not.toHaveBeenCalled();
  });
});

describe('useCoveragePage', () => {
  const view = { query: '', filter: 'all' as const, facets: {}, mineOnly: false };

  it('loads the first page, then the next on loadMore, with counts and set totals', async () => {
    const all = Array.from({ length: 300 }, (_, i) => row(`PHUK-${String(i).padStart(3, '0')}`));
    mockRepo.getCatalogueCoveragePage.mockImplementation(async (q: CoveragePageQuery) => ({ rows: all.slice(q.offset, q.offset + q.limit), total: all.length }));
    mockRepo.getCatalogueCoverageSummary.mockResolvedValue({ stats: { ...NO_STATS, total: 300, needs: 300 }, facet: null });
    mockRepo.getCatalogueCoverageSetTotals.mockResolvedValue({ 'Set 0': { total: 30, withPhoto: 0 } });

    const { result } = await renderHook(() => useCoveragePage(true, view, []));
    await waitFor(() => expect(result.current.rows).toHaveLength(240));
    expect(result.current.hasMore).toBe(true);
    await waitFor(() => expect(result.current.stats.total).toBe(300));
    await waitFor(() => expect(result.current.setTotals['Set 0']).toEqual({ total: 30, withPhoto: 0 }));

    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.rows).toHaveLength(300));
    expect(result.current.hasMore).toBe(false);
  });

  it('"mine only" sends the owned pins; filters and search go to the server', async () => {
    mockRepo.getCatalogueCoveragePage.mockResolvedValue({ rows: [], total: 0 });
    await renderHook(() => useCoveragePage(true, { query: 'stitch', filter: 'needs', facets: { year: 2024 }, mineOnly: true }, ['PHUK-9', 'PHUK-8']));
    await waitFor(() => expect(mockRepo.getCatalogueCoveragePage).toHaveBeenCalled());
    expect(mockRepo.getCatalogueCoveragePage).toHaveBeenCalledWith(expect.objectContaining({
      ids: ['PHUK-8', 'PHUK-9'], query: 'stitch', filter: 'needs', year: 2024, offset: 0, limit: 240,
    }));
    expect(mockRepo.getCatalogueCoverageSummary).toHaveBeenCalledWith({ year: 2024 }, ['PHUK-8', 'PHUK-9']);
  });
});

describe('useCoveragePage sort', () => {
  type View = { query: string; filter: 'needs'; facets: Record<string, never>; mineOnly: boolean; sort: 'set' | 'newest' };
  const view = (sort: 'set' | 'newest'): View => ({ query: '', filter: 'needs', facets: {}, mineOnly: false, sort });

  it('reports newest as unavailable only after a newest page comes back in set order', async () => {
    mockRepo.getCatalogueCoveragePage.mockResolvedValue({ rows: [row('PHUK-1')], total: 1, sort: 'set' });
    const hook = await renderHook(({ v }: { v: View }) => useCoveragePage(true, v, []), { initialProps: { v: view('set') } });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.sortUnavailable).toBe(false);

    await act(async () => { hook.rerender({ v: view('newest') }); });
    await waitFor(() => expect(mockRepo.getCatalogueCoveragePage).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'newest' })));
    await waitFor(() => expect(hook.result.current.sortUnavailable).toBe(true));
  });

  it('stays available when the newest page really is newest', async () => {
    mockRepo.getCatalogueCoveragePage.mockImplementation(async (q: CoveragePageQuery) => ({ rows: [row('PHUK-1')], total: 1, sort: q.sort ?? 'set' }));
    const hook = await renderHook(({ v }: { v: View }) => useCoveragePage(true, v, []), { initialProps: { v: view('set') } });
    await act(async () => { hook.rerender({ v: view('newest') }); });
    await waitFor(() => expect(hook.result.current.sort).toBe('newest'));
    expect(hook.result.current.sortUnavailable).toBe(false);
  });
});

describe('useNewestNeedingPhotos', () => {
  it('asks for the newest pins needing a photo and keeps only Pin & Pop ones', async () => {
    mockRepo.getCatalogueCoveragePage.mockResolvedValue({
      rows: [
        row('PHUK-10000009', { catalogueSource: 'pin_and_pop' }),
        row('PHUK-00000042', { catalogueSource: 'pinhunt' }),
        row('PHUK-10000008', { catalogueSource: 'pin_and_pop' }),
      ],
      total: 3,
      sort: 'newest',
    });
    const { result } = await renderHook(() => useNewestNeedingPhotos(true, 12));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(mockRepo.getCatalogueCoveragePage).toHaveBeenCalledWith(expect.objectContaining({ filter: 'needs', sort: 'newest', offset: 0 }));
    expect(result.current.rows.map(r => r.pinhuntId)).toEqual(['PHUK-10000009', 'PHUK-10000008']);

    // A photo sent from the strip drops that pin straight away.
    await act(async () => { markCoveragePending('PHUK-10000009'); });
    expect(result.current.rows.map(r => r.pinhuntId)).toEqual(['PHUK-10000008']);
  });

  it('shows nothing when the database could only answer in set order (088 not applied)', async () => {
    mockRepo.getCatalogueCoveragePage.mockResolvedValue({ rows: [row('PHUK-10000001', { catalogueSource: 'pin_and_pop' })], total: 1, sort: 'set' });
    const { result } = await renderHook(() => useNewestNeedingPhotos(true, 12));
    await waitFor(() => expect(mockRepo.getCatalogueCoveragePage).toHaveBeenCalled());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
  });

  it('reuses its answer for a few minutes instead of asking again on every Home visit', async () => {
    mockRepo.getCatalogueCoveragePage.mockResolvedValue({ rows: [row('PHUK-10000009', { catalogueSource: 'pin_and_pop' })], total: 1, sort: 'newest' });
    const first = await renderHook(() => useNewestNeedingPhotos(true, 12));
    await waitFor(() => expect(first.result.current.rows).toHaveLength(1));
    const second = await renderHook(() => useNewestNeedingPhotos(true, 12));
    expect(second.result.current.rows.map(r => r.pinhuntId)).toEqual(['PHUK-10000009']);
    expect(mockRepo.getCatalogueCoveragePage).toHaveBeenCalledTimes(1);
    await act(async () => { await second.result.current.refresh(); });
    expect(mockRepo.getCatalogueCoveragePage).toHaveBeenCalledTimes(2);
  });

  it('loads nothing for people who cannot contribute', async () => {
    const { result } = await renderHook(() => useNewestNeedingPhotos(false, 12));
    expect(result.current.rows).toEqual([]);
    expect(mockRepo.getCatalogueCoveragePage).not.toHaveBeenCalled();
  });
});
