/**
 * useCatalogueCoverage — photo status for every Collectible PinTrader
 * catalogue pin, for the "Help build the catalogue" contributor screen.
 *
 * Deliberately separate from PinCatalogueContext: that context caches a
 * 500-pin slice for normal browsing, whereas this screen needs every pin's
 * photo state (≈3k rows, lightweight fields only) and is only loaded by
 * people who can access the 'catalogue_contributions' feature.
 *
 * `markPending` lets the screen update a tile immediately after a
 * contribution, before the next refresh.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createSupabaseUserRepository,
  type CatalogueImageCoverage,
} from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// Module-level so returning from the contribute flow shows the
// optimistically-updated list instantly rather than a spinner.
let cached: CatalogueImageCoverage[] | null = null;
const listeners = new Set<(rows: CatalogueImageCoverage[]) => void>();

function publish(rows: CatalogueImageCoverage[]) {
  cached = rows;
  listeners.forEach(l => l(rows));
}

/** Mark a pin as having the caller's photo pending — callable from any screen. */
export function markCoveragePending(pinhuntId: string) {
  if (!cached) return;
  publish(cached.map(row =>
    row.pinhuntId === pinhuntId
      ? { ...row, myStatus: 'pending', pendingCount: row.myStatus === 'pending' ? row.pendingCount : row.pendingCount + 1 }
      : row,
  ));
}

/** Mark a pin's photo as live — admin/App Creator contributions skip review. */
export function markCoveragePublished(pinhuntId: string, imageUrl: string) {
  if (!cached) return;
  publish(cached.map(row =>
    row.pinhuntId === pinhuntId
      ? { ...row, imageUrl, imageSource: 'community', myStatus: 'approved' }
      : row,
  ));
}

export function useCatalogueCoverage(enabled: boolean) {
  const repo = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabaseUserRepository(supabase as any);
  }, []);

  const [rows, setRows] = useState<CatalogueImageCoverage[]>(cached ?? []);
  const [loading, setLoading] = useState(cached === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listeners.add(setRows);
    return () => { listeners.delete(setRows); };
  }, []);

  const refresh = useCallback(async () => {
    if (!repo || !enabled) return;
    setError(null);
    try {
      publish(await repo.getCatalogueImageCoverage());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the catalogue.');
    } finally {
      setLoading(false);
    }
  }, [repo, enabled]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { rows, loading: enabled && loading, error, refresh };
}

/** Read a pin's coverage row from the cache (if the screen has loaded it). */
export function getCachedCoverage(pinhuntId: string): CatalogueImageCoverage | undefined {
  return cached?.find(row => row.pinhuntId === pinhuntId);
}

/**
 * The next pin worth photographing after `afterId`: a pin with no photo that
 * the caller hasn't already sent one for — preferring pins they own.
 */
export function findNextContributionTarget(
  afterId: string,
  ownedIds: Set<string>,
): CatalogueImageCoverage | undefined {
  if (!cached) return undefined;
  const open = cached.filter(row =>
    row.pinhuntId !== afterId && row.imageSource === null && row.myStatus !== 'pending',
  );
  return open.find(row => ownedIds.has(row.pinhuntId)) ?? open[0];
}
