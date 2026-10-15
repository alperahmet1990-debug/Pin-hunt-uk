/**
 * PinCatalogueContext
 *
 * The single source of truth for catalogue data in the mobile app.
 * All screens that display pins must use this context — no screen may
 * import from mock-data or call Supabase directly.
 *
 * On first mount the catalogue is loaded from Supabase. While loading,
 * `pins` is an empty array and `loading` is true.
 *
 * The `repository` is also exposed for method calls (searchPins,
 * getPinsBySeries, etc.) that need server-side filtering beyond what
 * the cached `pins` list provides.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createSupabasePinRepository,
  type CataloguePin,
  type PinRepository,
} from '@workspace/pin-repository';
import { supabase } from '@/lib/supabase';
import { demoCatalogueSize } from '@/lib/demoMode';

// Supabase credentials come from the singleton client; only the flag is
// checked here so the mock fallback still works in environments where the
// env vars aren't configured yet.
const isConfigured = Boolean(
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
);

// ─── Context value ────────────────────────────────────────────────────────────
interface PinCatalogueContextValue {
  /**
   * Pins loaded so far: the collector's own pins (ensurePins), whole sets
   * that a screen asked for (ensureCollections) and pins fetched on demand.
   * With Supabase it is NOT the whole catalogue (no start-up preload, #25);
   * search the repository to find pins. Mock mode loads the mock catalogue.
   */
  pins: CataloguePin[];
  loading: boolean;
  error: Error | null;
  /** Derived list: pins marked isNewRelease === true. */
  newReleases: CataloguePin[];
  /** All distinct series/collection names in the catalogue. */
  series: string[];
  /** Repository instance for method calls that go beyond the cached list. */
  repository: PinRepository | null;
  /** Re-fetch the full catalogue from Supabase. */
  refresh(): Promise<void>;
  /**
   * Make sure the given PinHunt IDs are present in `pins`, fetching any that
   * fall outside the cached slice. Collection/boards call this so pins a user
   * owns always render even when they're not in the first catalogue page.
   */
  ensurePins(pinhuntIds: string[]): Promise<void>;
  /**
   * Ensure every pin of the named collections/sets is loaded, so set
   * completion totals and missing-pin slots are computed against the full
   * set rather than whatever slice happens to be cached.
   */
  ensureCollections(collectionNames: string[]): Promise<void>;
}

const PinCatalogueContext = createContext<PinCatalogueContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function PinCatalogueProvider({ children }: { children: React.ReactNode }) {
  const [pins, setPins] = useState<CataloguePin[]>([]);
  // With Supabase there is no start-up load (#25), so nothing to wait for.
  const [loading, setLoading] = useState(!isConfigured);
  const [error, setError] = useState<Error | null>(null);

  // Create repository once using the app-wide Supabase singleton.
  const repository = useMemo<PinRepository | null>(() => {
    if (!isConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabasePinRepository(supabase as any);
  }, []);

  const fetchCatalogue = useCallback(async () => {
    setError(null);

    if (!repository) {
      // Supabase not yet configured — fall back to mock data so the app stays
      // usable during development before credentials are added.
      try {
        if (demoCatalogueSize > 0) {
          // Large-collection demo (UX-051): a generated catalogue instead.
          const { buildLargeCatalogue } = await import('../mock-data/largeFixture');
          setPins(buildLargeCatalogue(demoCatalogueSize));
          return;
        }
        // Dynamic import avoids bundling mock data in production builds
        const { PINS } = await import('../mock-data/pins');
        // Convert legacy Pin type to CataloguePin shape
        const adapted: CataloguePin[] = PINS.map(p => ({
          id: p.id,
          title: p.title,
          brand: p.brand,
          collection: p.collection,
          characters: p.characters,
          categories: [],
          releaseDate: p.releaseDate,
          retailPriceGBP: p.retailPrice,
          currency: 'GBP',
          limitedEditionSize: p.limitedEditionSize,
          estimatedValueGBP: p.estimatedValueGBP,
          description: p.description,
          isNewRelease: p.isNewRelease,
          origin: p.origin,
          edition: p.edition,
          imageUrl: undefined, // local images handled by getPinImageSource fallback
          backImageUrl: undefined,
          externalIdentifiers: {},
          verificationStatus: 'needs_source_verification' as const,
          status: 'active' as const,
          isUserSubmitted: false,
        }));
        setPins(adapted);
      } catch {
        setError(new Error('Failed to load mock catalogue'));
      } finally {
        setLoading(false);
      }
      return;
    }

    // No start-up preload (B-P1-01b, #25): screens fetch what they show
    // (search, ensurePins for a collection's pins, ensureCollections for a
    // set). A refresh forgets what was fetched so the next request reloads it.
    requestedIdsRef.current.clear();
    loadedCollectionsRef.current.clear();
    setLoading(false);
  }, [repository]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    fetchCatalogue();
  }, [fetchCatalogue]);

  // Track in-flight/failed lookups so we don't refetch the same missing IDs
  // on every call (e.g. IDs that no longer exist in the catalogue).
  const requestedIdsRef = useRef<Set<string>>(new Set());

  const ensurePins = useCallback(async (pinhuntIds: string[]) => {
    if (!repository || pinhuntIds.length === 0) return;
    const have = new Set(pinsRef.current.map(p => p.id));
    const missing = pinhuntIds.filter(id => !have.has(id) && !requestedIdsRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach(id => requestedIdsRef.current.add(id));
    try {
      const fetched = await repository.getPinsByIds(missing);
      if (fetched.length > 0) {
        setPins(current => {
          const existing = new Set(current.map(p => p.id));
          const additions = fetched.filter(p => !existing.has(p.id));
          return additions.length > 0 ? [...current, ...additions] : current;
        });
      }
    } catch {
      // Allow a retry on next call.
      missing.forEach(id => requestedIdsRef.current.delete(id));
    }
  }, [repository]);

  const loadedCollectionsRef = useRef<Set<string>>(new Set());
  const collectionRequestsRef = useRef<Map<string, Promise<void>>>(new Map());

  const ensureCollections = useCallback(async (collectionNames: string[]) => {
    if (!repository || collectionNames.length === 0) return;
    const names = [...new Set(collectionNames.filter(Boolean))];
    await Promise.all(names.map(name => {
      if (loadedCollectionsRef.current.has(name)) return Promise.resolve();
      const existingRequest = collectionRequestsRef.current.get(name);
      if (existingRequest) return existingRequest;

      const request = repository.getPinsBySeries(name)
        .then(fetched => {
          if (fetched.length === 0) return;
          setPins(current => {
            const existing = new Set(current.map(p => p.id));
            const additions = fetched.filter(p => !existing.has(p.id));
            return additions.length > 0 ? [...current, ...additions] : current;
          });
          loadedCollectionsRef.current.add(name);
        })
        .finally(() => {
          collectionRequestsRef.current.delete(name);
        });

      collectionRequestsRef.current.set(name, request);
      return request;
    }));
  }, [repository]);

  // Ref mirror of pins so ensurePins reads fresh state without re-creating.
  const pinsRef = useRef<CataloguePin[]>([]);
  useEffect(() => { pinsRef.current = pins; }, [pins]);

  const newReleases = useMemo(() => pins.filter(p => p.isNewRelease), [pins]);
  const series = useMemo(
    () => [...new Set(pins.map(p => p.collection))].sort(),
    [pins],
  );

  const value = useMemo<PinCatalogueContextValue>(
    () => ({ pins, loading, error, newReleases, series, repository, refresh: fetchCatalogue, ensurePins, ensureCollections }),
    [pins, loading, error, newReleases, series, repository, fetchCatalogue, ensurePins, ensureCollections],
  );

  return (
    <PinCatalogueContext.Provider value={value}>
      {children}
    </PinCatalogueContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function usePinCatalogue(): PinCatalogueContextValue {
  const ctx = useContext(PinCatalogueContext);
  if (!ctx) throw new Error('usePinCatalogue must be used inside PinCatalogueProvider');
  return ctx;
}
