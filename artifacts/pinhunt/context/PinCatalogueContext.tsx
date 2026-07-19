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

// Supabase credentials come from the singleton client; only the flag is
// checked here so the mock fallback still works in environments where the
// env vars aren't configured yet.
const isConfigured = Boolean(
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
);

// ─── Context value ────────────────────────────────────────────────────────────
interface PinCatalogueContextValue {
  /** Full active catalogue, sorted by title. Empty while loading. */
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
}

const PinCatalogueContext = createContext<PinCatalogueContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function PinCatalogueProvider({ children }: { children: React.ReactNode }) {
  const [pins, setPins] = useState<CataloguePin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Create repository once using the app-wide Supabase singleton.
  const repository = useMemo<PinRepository | null>(() => {
    if (!isConfigured) return null;
    return createSupabasePinRepository(supabase);
  }, []);

  const fetchCatalogue = useCallback(async () => {
    setError(null);

    if (!repository) {
      // Supabase not yet configured — fall back to mock data so the app stays
      // usable during development before credentials are added.
      try {
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

    setLoading(true);
    try {
      const data = await repository.searchPins('', { limit: 500 });
      setPins(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [repository]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    fetchCatalogue();
  }, [fetchCatalogue]);

  const newReleases = useMemo(() => pins.filter(p => p.isNewRelease), [pins]);
  const series = useMemo(
    () => [...new Set(pins.map(p => p.collection))].sort(),
    [pins],
  );

  const value = useMemo<PinCatalogueContextValue>(
    () => ({ pins, loading, error, newReleases, series, repository, refresh: fetchCatalogue }),
    [pins, loading, error, newReleases, series, repository, fetchCatalogue],
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
