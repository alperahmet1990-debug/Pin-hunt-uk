/**
 * useMyAccess — the signed-in user's access levels (migration 040):
 * app creator > admin > contributor > public.
 *
 * Read via the get_my_access() RPC rather than the profile select, so the
 * profile query keeps working on databases without migration 040. All
 * levels are false while loading, signed out, or on error (fails closed).
 * UI gating only — the database enforces the same rules.
 */
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseUserRepository, type MyAccess } from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { isDemoAdmin } from '@/lib/demoMode';

const NONE: MyAccess = { isAppCreator: false, isAdmin: false, isContributor: false };

export function useMyAccess(): MyAccess & { loading: boolean } {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const repo = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabaseUserRepository(supabase as any);
  }, []);

  const [access, setAccess] = useState<MyAccess>(NONE);
  const [loading, setLoading] = useState(!!userId);

  useEffect(() => {
    if (!repo || !userId) {
      setAccess(NONE);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    repo.getMyAccess().then(result => {
      if (!cancelled) {
        setAccess(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [repo, userId]);

  if (isDemoAdmin) return { isAppCreator: true, isAdmin: true, isContributor: true, loading: false };  // demo preview only
  return { ...access, loading };
}
