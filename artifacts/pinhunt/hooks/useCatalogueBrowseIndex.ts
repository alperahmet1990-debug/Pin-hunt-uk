/**
 * useCatalogueBrowseIndex — browsable catalogue pins as lightweight rows,
 * for the Browse Entire Catalogue (multi-select add) screen.
 *
 * The catalogue is ~116k pins (Pin & Pop), so with Supabase the rows are
 * filtered (search, set, year, edition) and paged on the server: the first
 * page comes back in well under a second and `loadMore` fetches the next as
 * the list scrolls (utils/catalogueBrowsePager keeps each set whole).
 * Previously this downloaded the whole catalogue: ~43 s at 116k pins.
 *
 * In mock mode (no Supabase) it filters the context's cached pins on the
 * device, as before.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogueBrowsePin } from '@workspace/pin-repository';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import {
  START, browseTotal, nextBrowsePage, splitYear,
  type BrowseCursor, type BrowseFilters,
} from '@/utils/catalogueBrowsePager';

export type { BrowseFilters } from '@/utils/catalogueBrowsePager';

const NO_FILTERS: BrowseFilters = { query: '', setName: null, year: null, edition: null };

// The unfiltered first pages, kept so reopening the screen shows them instantly.
let cachedUnfiltered: { rows: CatalogueBrowsePin[]; cursor: BrowseCursor; total: number } | null = null;

const isUnfiltered = (f: BrowseFilters) => !f.query.trim() && f.setName === null && f.year === null && f.edition === null;

function matchesQuery(pin: CatalogueBrowsePin, tokens: string[]) {
  if (tokens.length === 0) return true;
  const haystack = [
    pin.title, pin.setName, pin.brand, pin.mainCharacter, pin.allCharacters, pin.id,
    pin.releaseYear ? String(pin.releaseYear) : '',
  ].join(' ').toLowerCase();
  return tokens.every(t => haystack.includes(t));
}

export function useCatalogueBrowseIndex(filters: BrowseFilters = NO_FILTERS) {
  const { repository, pins } = usePinCatalogue();
  const unfiltered = isUnfiltered(filters);
  const startFromCache = Boolean(repository) && unfiltered && cachedUnfiltered !== null;
  const [rows, setRows] = useState<CatalogueBrowsePin[]>(startFromCache ? cachedUnfiltered!.rows : []);
  const [total, setTotal] = useState<number | null>(startFromCache ? cachedUnfiltered!.total : null);
  const [catalogueTotal, setCatalogueTotal] = useState<number | null>(cachedUnfiltered?.total ?? null);
  const [loading, setLoading] = useState(!startFromCache);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<BrowseCursor>(startFromCache ? cachedUnfiltered!.cursor : START);
  const [hasMore, setHasMore] = useState(startFromCache ? cachedUnfiltered!.cursor.phase !== 'done' : false);
  // Each filter change starts a new generation; late responses from an older one are dropped.
  const generation = useRef(0);
  const busy = useRef(false);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const key = JSON.stringify(filters);
  const effective = useCallback(() => splitYear(JSON.parse(key) as BrowseFilters), [key]);

  const page = useCallback(
    (q: Parameters<NonNullable<typeof repository>['getCatalogueBrowsePage']>[0]) => repository!.getCatalogueBrowsePage(q),
    [repository],
  );

  const load = useCallback(async (reset: boolean) => {
    const f = effective();
    if (!repository) {
      const tokens = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const all = pinsRef.current.map(p => ({
        id: p.id,
        title: p.title,
        setName: p.collection || 'Uncategorised',
        brand: p.brand,
        releaseYear: p.releaseYear,
        edition: p.edition,
        imageUrl: p.imageUrl,
        mainCharacter: p.mainCharacter,
        allCharacters: p.allCharacters ?? p.characters.join(';'),
      }));
      const out = all.filter(r =>
        (!f.setName || r.setName === f.setName)
        && (!f.year || r.releaseYear === f.year)
        && (!f.edition || r.edition === f.edition)
        && matchesQuery(r, tokens));
      setRows(out);
      setTotal(out.length);
      setCatalogueTotal(all.length);
      setHasMore(false);
      setLoading(false);
      return;
    }
    if (!reset && (busy.current || cursorRef.current.phase === 'done')) return;
    const gen = reset ? ++generation.current : generation.current;
    busy.current = true;
    setError(null);
    if (reset) { setLoading(true); cursorRef.current = START; }
    else setLoadingMore(true);
    try {
      const [result, count] = await Promise.all([
        nextBrowsePage(page, f, cursorRef.current),
        reset ? browseTotal(page, f) : Promise.resolve(null),
      ]);
      if (gen !== generation.current) return;
      cursorRef.current = result.cursor;
      setHasMore(result.cursor.phase !== 'done');
      setRows(prev => (reset ? result.rows : [...prev, ...result.rows]));
      if (count !== null) {
        setTotal(count);
        if (isUnfiltered(f)) setCatalogueTotal(count);
      }
      if (isUnfiltered(f)) {
        const prevRows = reset ? [] : (cachedUnfiltered?.rows ?? []);
        cachedUnfiltered = { rows: [...prevRows, ...result.rows], cursor: result.cursor, total: count ?? cachedUnfiltered?.total ?? 0 };
      }
    } catch (e) {
      if (gen === generation.current) setError(e instanceof Error ? e.message : 'Could not load the catalogue.');
    } finally {
      if (gen === generation.current) {
        busy.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [repository, effective, page]);

  // Filters changed (or first open): start again from the first page,
  // unless this is the unfiltered view and it's already cached.
  const mockPins = repository ? null : pins;
  const firstRun = useRef(true);
  useEffect(() => {
    const cachedStart = firstRun.current && startFromCache;
    firstRun.current = false;
    if (cachedStart) return;
    if (repository && isUnfiltered(effective()) && cachedUnfiltered) {
      generation.current++;
      busy.current = false;
      cursorRef.current = cachedUnfiltered.cursor;
      setRows(cachedUnfiltered.rows);
      setTotal(cachedUnfiltered.total);
      setHasMore(cachedUnfiltered.cursor.phase !== 'done');
      setLoading(false);
      return;
    }
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, repository, mockPins]);

  // The catalogue total is shown as "N of <total>" while filtering, so fetch it once if needed.
  useEffect(() => {
    if (!repository || catalogueTotal !== null) return;
    let cancelled = false;
    browseTotal(page, NO_FILTERS).then(n => { if (!cancelled) setCatalogueTotal(n); }).catch(() => {});
    return () => { cancelled = true; };
  }, [repository, catalogueTotal, page]);

  const loadMore = useCallback(() => { void load(false); }, [load]);
  const refresh = useCallback(async () => {
    if (isUnfiltered(effective())) cachedUnfiltered = null;
    await load(true);
  }, [load, effective]);

  /** Every set name, for the Set filter (names only; ~13k with Pin & Pop). */
  const loadSetNames = useCallback(async (): Promise<string[]> => {
    if (repository) return repository.getAllSetNames();
    return [...new Set(pinsRef.current.map(p => p.collection || 'Uncategorised'))];
  }, [repository]);

  return { rows, total, catalogueTotal, loading, loadingMore, hasMore, error, loadMore, refresh, loadSetNames };
}
