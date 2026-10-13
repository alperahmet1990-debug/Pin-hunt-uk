/**
 * useCatalogueBrowseIndex — every publicly browsable catalogue pin as
 * lightweight rows, for the Browse Entire Catalogue (multi-select add)
 * screen.
 *
 * Deliberately separate from PinCatalogueContext: that context caches a
 * 500-pin slice of full CataloguePin objects, whereas this screen needs the
 * whole catalogue (≈3k rows) but only the fields the grid and filters use.
 *
 * In mock mode (no Supabase) it falls back to the context's cached pins.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogueBrowsePin } from '@workspace/pin-repository';
import { usePinCatalogue } from '@/context/PinCatalogueContext';

// Module-level so reopening the screen shows the list instantly.
let cached: CatalogueBrowsePin[] | null = null;

export function useCatalogueBrowseIndex() {
  const { repository, pins } = usePinCatalogue();
  const [rows, setRows] = useState<CatalogueBrowsePin[]>(cached ?? []);
  const [loading, setLoading] = useState(cached === null);
  const [error, setError] = useState<string | null>(null);
  // Read through a ref so slice updates in the catalogue context don't
  // re-trigger a full fetch in Supabase mode.
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const refresh = useCallback(async () => {
    if (!repository) {
      setRows(pinsRef.current.map(p => ({
        id: p.id,
        title: p.title,
        setName: p.collection || 'Uncategorised',
        brand: p.brand,
        releaseYear: p.releaseYear,
        edition: p.edition,
        imageUrl: p.imageUrl,
        mainCharacter: p.mainCharacter,
        allCharacters: p.allCharacters ?? p.characters.join(';'),
      })));
      setLoading(false);
      return;
    }
    setError(null);
    try {
      cached = await repository.getCatalogueBrowseIndex();
      setRows(cached);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the catalogue.');
    } finally {
      setLoading(false);
    }
  }, [repository]);

  // Mock mode builds the rows from the catalogue, which can finish loading
  // after the first pass, so follow it. Supabase mode still fetches once.
  const mockPins = repository ? null : pins;
  useEffect(() => {
    void refresh();
  }, [refresh, mockPins]);

  return { rows, loading, error, refresh };
}
