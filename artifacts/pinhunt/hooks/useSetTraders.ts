/**
 * Collectors with any of the given (missing) pins for trade, grouped per
 * collector (UX-021, #129). One `getForTradeInventory` call for the whole
 * list, however big the set. Without Supabase (demo mode) it reports no
 * traders and `available: null`, so callers can hide the count.
 */
import { useCallback, useEffect, useState } from 'react';
import { useMarketplace } from '@/hooks/useMarketplace';
import { availablePinCount, groupByCollector, type SetTrader } from '@/utils/setTraders';
import { useBlockedUsers } from '@/context/BlockedUsersContext';
import { withoutBlockedTraders } from '@/utils/blockedUsers';

export function useSetTraders(missingPinIds: string[]) {
  const { repo, userId } = useMarketplace();
  // Collectors I blocked are left out (B-P0-05b, #17).
  const { blockedIds } = useBlockedUsers();
  const [traders, setTraders] = useState<SetTrader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Stable key so a new array with the same pins doesn't refetch.
  const key = [...missingPinIds].sort().join(',');

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    if (!repo || !userId || key === '') {
      setTraders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const items = await repo.getForTradeInventory({ viewerId: userId, pinIds: key.split(',') });
      if (!signal?.cancelled) setTraders(groupByCollector(withoutBlockedTraders(items, blockedIds)));
    } catch (e) {
      if (!signal?.cancelled) setError(e instanceof Error ? e.message : 'Could not load collectors.');
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, [repo, userId, key, blockedIds]);

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => { signal.cancelled = true; };
  }, [load]);

  return {
    traders,
    loading,
    error,
    refresh: () => load(),
    /** Distinct missing pins someone has for trade; null when it can't be known (no Supabase). */
    available: repo && userId ? availablePinCount(traders) : null,
  };
}
