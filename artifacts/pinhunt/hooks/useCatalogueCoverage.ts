/**
 * Catalogue photo coverage (photo status and missing info per pin), for
 * people who can use 'catalogue_contributions'.
 *
 * The catalogue is ~116k pins (Pin & Pop), so nothing here loads all of it:
 *  - useCoverageFor(ids): rows for specific pins — the pins on screen in
 *    Browse Catalogue, or the collector's own pins for photo gaps.
 *  - useCoveragePage(filters): the "Help build the catalogue" screen, filtered,
 *    counted and paged in the database (migration 077), 240 pins at a time.
 * Without 077 the repository answers the same calls from the old full list.
 *
 * Every row loaded either way goes into one module-level cache, so the
 * contribute flow can read a pin's row (getCachedCoverage) and suggest the
 * next pin to photograph, and `markCoverage*` can update a tile immediately
 * after a contribution, before the next refresh.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  createSupabaseUserRepository,
  type CatalogueImageCoverage,
  type CoverageFacetKey,
  type CoverageFacets,
  type CoverageFilter,
  type CoverageStats,
} from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const byId = new Map<string, CatalogueImageCoverage>();
/** Ids already asked for, including ones the server had no row for. */
const requested = new Set<string>();
const listeners = new Set<() => void>();
const publish = () => listeners.forEach(l => l());

function remember(rows: CatalogueImageCoverage[]) {
  for (const r of rows) byId.set(r.pinhuntId, r);
}

function useCoverageRepository() {
  return useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabaseUserRepository(supabase as any);
  }, []);
}

/** Re-render when the shared cache changes. */
function useCacheVersion() {
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => { listeners.delete(bump); };
  }, []);
  return version;
}

/** Mark a pin as having the caller's photo pending — callable from any screen. */
export function markCoveragePending(pinhuntId: string) {
  const row = byId.get(pinhuntId);
  if (!row) return;
  byId.set(pinhuntId, { ...row, myStatus: 'pending', pendingCount: row.myStatus === 'pending' ? row.pendingCount : row.pendingCount + 1 });
  publish();
}

/** Mark a pin's photo as live — admin/App Creator contributions skip review. */
export function markCoveragePublished(pinhuntId: string, imageUrl: string) {
  const row = byId.get(pinhuntId);
  if (!row) return;
  byId.set(pinhuntId, { ...row, imageUrl, imageSource: 'community', myStatus: 'approved' });
  publish();
}

/** Read a pin's coverage row from the cache (if a screen has loaded it). */
export function getCachedCoverage(pinhuntId: string): CatalogueImageCoverage | undefined {
  return byId.get(pinhuntId);
}

/**
 * The next pin worth photographing after `afterId`, from the rows loaded so
 * far: a pin with no photo that the caller hasn't already sent one for —
 * preferring pins they own.
 */
export function findNextContributionTarget(
  afterId: string,
  ownedIds: Set<string>,
): CatalogueImageCoverage | undefined {
  const open = [...byId.values()].filter(row =>
    row.pinhuntId !== afterId && row.imageSource === null && row.myStatus !== 'pending',
  );
  return open.find(row => ownedIds.has(row.pinhuntId)) ?? open[0];
}

/** For tests: forget everything cached. */
export function resetCoverageCache() {
  byId.clear();
  requested.clear();
  publish();
}

const ID_CHUNK = 1000;

/** Coverage rows for these pins (in the given order; pins with no row are left out). */
export function useCoverageFor(enabled: boolean, ids: string[]) {
  const repo = useCoverageRepository();
  const version = useCacheVersion();
  const key = ids.join(',');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force: boolean) => {
    if (!repo || !enabled || !key) return;
    const want = [...new Set(key.split(','))];
    const missing = force ? want : want.filter(id => !requested.has(id));
    if (!missing.length) return;
    missing.forEach(id => requested.add(id));
    setLoading(true);
    setError(null);
    try {
      for (let i = 0; i < missing.length; i += ID_CHUNK) {
        const chunk = missing.slice(i, i + ID_CHUNK);
        const { rows } = await repo.getCatalogueCoveragePage({ ids: chunk, offset: 0, limit: ID_CHUNK });
        remember(rows);
      }
      publish();
    } catch (e) {
      missing.forEach(id => requested.delete(id));
      setError(e instanceof Error ? e.message : 'Could not load photo status.');
    } finally {
      setLoading(false);
    }
  }, [repo, enabled, key]);

  useEffect(() => { void load(false); }, [load]);

  const rows = useMemo(
    () => (key ? key.split(',').map(id => byId.get(id)).filter((r): r is CatalogueImageCoverage => Boolean(r)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, version],
  );
  const refresh = useCallback(() => load(true), [load]);
  return { rows: enabled ? rows : [], loading: enabled && loading, error, refresh };
}

export interface CoverageView {
  query: string;
  filter: CoverageFilter;
  facets: CoverageFacets;
  mineOnly: boolean;
}

const PAGE = 240;
const NO_STATS: CoverageStats = { total: 0, withPhoto: 0, community: 0, reference: 0, needs: 0, pending: 0, mine: 0, info: 0, back: 0 };

/** The contributor screen: one filtered view, paged, with its counts and set totals. */
export function useCoveragePage(enabled: boolean, view: CoverageView, ownedIds: string[]) {
  const repo = useCoverageRepository();
  const version = useCacheVersion();
  const [ids, setIds] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<CoverageStats>(NO_STATS);
  const [setTotals, setSetTotals] = useState<Record<string, { total: number; withPhoto: number }>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0);
  const generation = useRef(0);
  const busy = useRef(false);
  const knownSets = useRef(new Set<string>());

  const viewKey = JSON.stringify(view);
  const ownedKey = ownedIds.slice().sort().join(',');
  const facetsKey = JSON.stringify(view.facets);

  const fetchSetTotals = useCallback(async (rows: CatalogueImageCoverage[]) => {
    if (!repo) return;
    const fresh = [...new Set(rows.map(r => r.setName))].filter(s => !knownSets.current.has(s));
    if (!fresh.length) return;
    fresh.forEach(s => knownSets.current.add(s));
    try {
      const t = await repo.getCatalogueCoverageSetTotals(fresh);
      setSetTotals(prev => ({ ...prev, ...t }));
    } catch { fresh.forEach(s => knownSets.current.delete(s)); }
  }, [repo]);

  const load = useCallback(async (reset: boolean) => {
    if (!repo || !enabled) { setLoading(false); return; }
    if (!reset && (busy.current || offset.current >= total)) return;
    const gen = reset ? ++generation.current : generation.current;
    const v = JSON.parse(viewKey) as CoverageView;
    busy.current = true;
    setError(null);
    if (reset) { setLoading(true); offset.current = 0; } else setLoadingMore(true);
    try {
      const page = await repo.getCatalogueCoveragePage({
        ...v.facets,
        ids: v.mineOnly ? (ownedKey ? ownedKey.split(',') : []) : null,
        query: v.query,
        filter: v.filter,
        offset: offset.current,
        limit: PAGE,
      });
      if (gen !== generation.current) return;
      remember(page.rows);
      offset.current += page.rows.length;
      setIds(prev => (reset ? page.rows.map(r => r.pinhuntId) : [...prev, ...page.rows.map(r => r.pinhuntId)]));
      setTotal(page.total);
      publish();
      void fetchSetTotals(page.rows);
    } catch (e) {
      if (gen === generation.current) setError(e instanceof Error ? e.message : 'Could not load the catalogue.');
    } finally {
      if (gen === generation.current) {
        busy.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [repo, enabled, viewKey, ownedKey, total, fetchSetTotals]);

  // Any change to the view starts again at the first page.
  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, enabled, viewKey, ownedKey]);

  // Counts follow the facets (and owned pins), not the search or photo filter.
  const loadStats = useCallback(async () => {
    if (!repo || !enabled) return;
    try {
      const s = await repo.getCatalogueCoverageSummary(JSON.parse(facetsKey), ownedKey ? ownedKey.split(',') : []);
      setStats(s.stats);
    } catch { /* counts are informational; the list still works */ }
  }, [repo, enabled, facetsKey, ownedKey]);
  useEffect(() => { void loadStats(); }, [loadStats]);

  /** Choices (with counts) for one facet, under the other facets. */
  const loadFacet = useCallback(async (facet: CoverageFacetKey) => {
    if (!repo || !enabled) return [];
    const s = await repo.getCatalogueCoverageSummary(JSON.parse(facetsKey), [], facet);
    return s.facet ?? [];
  }, [repo, enabled, facetsKey]);

  const rows = useMemo(
    () => ids.map(id => byId.get(id)).filter((r): r is CatalogueImageCoverage => Boolean(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids, version],
  );

  const loadMore = useCallback(() => { void load(false); }, [load]);
  const refresh = useCallback(async () => {
    knownSets.current.clear();
    setSetTotals({});
    await Promise.all([load(true), loadStats()]);
  }, [load, loadStats]);

  return {
    rows, total, stats, setTotals, loading: enabled && loading, loadingMore, hasMore: rows.length < total,
    error, loadMore, refresh, loadFacet,
  };
}
