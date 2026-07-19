/**
 * useMarketplace — thin hook that exposes the external-sale-listing
 * repository methods, the current user ID, and a loading flag.
 *
 * Does not cache listing state; each screen manages its own fetch.
 */
import { useMemo } from 'react';
import { createSupabaseUserRepository } from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { IUserPinRepository } from '@workspace/pin-repository';

export function useMarketplace(): {
  repo: IUserPinRepository | null;
  userId: string | null;
  isConfigured: boolean;
} {
  const { session } = useAuth();

  const repo = useMemo<IUserPinRepository | null>(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabaseUserRepository(supabase as any);
  }, []);

  return {
    repo,
    userId: session?.user?.id ?? null,
    isConfigured: isSupabaseConfigured,
  };
}
