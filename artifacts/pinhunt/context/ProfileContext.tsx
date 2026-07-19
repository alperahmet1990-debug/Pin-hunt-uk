/**
 * ProfileContext — manages the authenticated user's profile.
 *
 * Loads the profile on sign-in, exposes profile operations to screens.
 * Screens must never call Supabase directly — use this context.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createSupabaseUserRepository,
  type IUserPinRepository,
  type Profile,
  type PublicProfile,
  type SearchCollectorsInput,
  type UpdateProfileInput,
} from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

// ─── Context shape ────────────────────────────────────────────────────────────

interface ProfileContextValue {
  profile: Profile | null;
  loading: boolean;
  /** True when signed in but username has not yet been set. */
  needsUsername: boolean;
  refreshProfile(): Promise<void>;
  updateMyProfile(input: UpdateProfileInput): Promise<Profile>;
  getPublicProfile(username: string): Promise<PublicProfile | null>;
  searchCollectors(input: SearchCollectorsInput): Promise<PublicProfile[]>;
  checkUsernameAvailable(username: string): Promise<boolean>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const userRepo: IUserPinRepository | null = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabaseUserRepository(supabase as any);
  }, []);

  const userId = session?.user?.id ?? null;

  const loadProfile = useCallback(async (id: string) => {
    if (!userRepo) return;
    setLoading(true);
    try {
      const p = await userRepo.getMyProfile(id);
      setProfile(p);
    } catch (err) {
      console.error('[ProfileContext] loadProfile error:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [userRepo]);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    loadProfile(userId);
  }, [userId, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  const updateMyProfile = useCallback(async (input: UpdateProfileInput): Promise<Profile> => {
    if (!userId || !userRepo) throw new Error('Not signed in');
    const updated = await userRepo.updateMyProfile(userId, input);
    setProfile(updated);
    return updated;
  }, [userId, userRepo]);

  const getPublicProfile = useCallback(async (username: string): Promise<PublicProfile | null> => {
    if (!userRepo) return null;
    return userRepo.getPublicProfile(username);
  }, [userRepo]);

  const searchCollectors = useCallback(async (input: SearchCollectorsInput): Promise<PublicProfile[]> => {
    if (!userRepo) return [];
    return userRepo.searchCollectors(input);
  }, [userRepo]);

  const checkUsernameAvailable = useCallback(async (username: string): Promise<boolean> => {
    if (!userRepo) return false;
    return userRepo.checkUsernameAvailable(username, userId ?? undefined);
  }, [userRepo, userId]);

  const needsUsername = session !== null && !loading && !profile?.username;

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        needsUsername,
        refreshProfile,
        updateMyProfile,
        getPublicProfile,
        searchCollectors,
        checkUsernameAvailable,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
