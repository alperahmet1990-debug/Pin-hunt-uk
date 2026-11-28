/**
 * useFeature — whether the signed-in user can see a gated feature.
 *
 * Each feature has one row in `feature_flags` (migration 039) whose audience
 * is 'admin' | 'contributor' | 'public'; the check runs server-side via the
 * can_access_feature() RPC. Fails closed: false while loading, when signed
 * out, or if the migration isn't applied yet.
 *
 * This only decides what the UI shows — the data behind a gated screen is
 * gated again in the database (e.g. get_catalogue_image_coverage()).
 */
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseUserRepository, type FeatureKey } from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { demoIsContributor, isDemoMode } from '@/lib/demoMode';

// Per-user cache so moving between screens doesn't re-query.
const cache = new Map<string, boolean>();

/** Forget cached results — call after a feature's audience changes. */
export function invalidateFeatureCache() {
  cache.clear();
}

export function useFeature(key: FeatureKey): { enabled: boolean; loading: boolean } {
  // Screenshot demo only (never a real build): see demoIsContributor.
  const demoEnabled = isDemoMode && key === 'catalogue_contributions' && demoIsContributor();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const cacheKey = userId ? `${userId}:${key}` : null;

  const repo = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabaseUserRepository(supabase as any);
  }, []);

  const [enabled, setEnabled] = useState(() => (cacheKey ? cache.get(cacheKey) ?? false : false));
  const [loading, setLoading] = useState(() => !!cacheKey && !cache.has(cacheKey));

  useEffect(() => {
    if (!repo || !cacheKey) {
      setEnabled(false);
      setLoading(false);
      return;
    }
    if (cache.has(cacheKey)) {
      setEnabled(cache.get(cacheKey)!);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    repo.canAccessFeature(key).then(result => {
      cache.set(cacheKey, result);
      if (!cancelled) {
        setEnabled(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [repo, cacheKey, key]);

  if (demoEnabled) return { enabled: true, loading: false };
  return { enabled, loading };
}
