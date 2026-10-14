/**
 * Debounced catalogue search for pin pickers (#25). The catalogue is no
 * longer preloaded, so pickers ask the repository instead of filtering a
 * cached list. Mock mode (no Supabase) filters the mock catalogue.
 */
import { useEffect, useState } from 'react';
import type { CataloguePin } from '@workspace/pin-repository';
import { usePinCatalogue } from '@/context/PinCatalogueContext';

export const PIN_SEARCH_DEBOUNCE_MS = 300;

export function usePinSearch(query: string, limit = 12): { results: CataloguePin[]; searching: boolean } {
  const { repository, pins } = usePinCatalogue();
  const [results, setResults] = useState<CataloguePin[]>([]);
  const [searching, setSearching] = useState(false);
  const q = query.trim();

  useEffect(() => {
    if (!q) { setResults([]); setSearching(false); return; }
    if (!repository) {
      const lower = q.toLowerCase();
      setResults(pins.filter(p =>
        p.title.toLowerCase().includes(lower) || p.collection.toLowerCase().includes(lower),
      ).slice(0, limit));
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      repository.searchPinsPage(q, { limit, offset: 0 })
        .then(page => { if (!cancelled) setResults(page.pins); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, PIN_SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, repository, pins, limit]);

  return { results, searching };
}
