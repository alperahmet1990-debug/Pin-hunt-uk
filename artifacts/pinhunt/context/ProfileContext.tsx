/**
 * ProfileContext — manages the authenticated user's profile.
 *
 * Loads the profile on sign-in, exposes profile operations to screens.
 * Screens must never call Supabase directly — use this context.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  confirmMyAge,
  confirmMyAgeFromSignup,
  createSupabaseUserRepository,
  getMyAgeStatus,
  SIGNUP_AGE_METADATA_KEY,
  type AgeConfirmationClient,
  type AgeStatus,
  type IUserPinRepository,
  type Profile,
  type PublicProfile,
  type SearchCollectorsInput,
  type UpdateProfileInput,
} from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { setFormatMarket } from '@/utils/format';
import { DEMO_PROFILE, demoAgeStatus, isDemoMode } from '@/lib/demoMode';
import { useAuth } from '@/context/AuthContext';
import { ageGateFor, needsUsernameFor } from '@/utils/profileState';

// ─── Context shape ────────────────────────────────────────────────────────────

interface ProfileContextValue {
  profile: Profile | null;
  loading: boolean;
  /** True when signed in but username has not yet been set. */
  needsUsername: boolean;
  /** Signed in, and the account hasn't confirmed its age yet (LP-8). */
  needsAgeConfirmation: boolean;
  /** The account is under 18 (said so, or closed by a moderator). Only the not-eligible screen. */
  ageDeclined: boolean;
  /** Send a date of birth (YYYY-MM-DD) to the server. Nothing is kept on the device. */
  confirmAge(birthDate: string): Promise<'confirmed' | 'declined'>;
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
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [ageStatus, setAgeStatus] = useState<AgeStatus | null>(null);
  const profileRequestId = useRef(0);

  const userRepo: IUserPinRepository | null = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabaseUserRepository(supabase as any);
  }, []);

  const userId = session?.user?.id ?? null;
  // Register put this in the sign-up metadata after checking the date on the device.
  const signedUpAsAdult = session?.user?.user_metadata?.[SIGNUP_AGE_METADATA_KEY] === true;
  const ageClient = supabase as unknown as AgeConfirmationClient;

  const loadProfile = useCallback(async (id: string) => {
    if (!userRepo) {
      // Screenshot harness only: mock-mode profile (see lib/demoMode).
      if (isDemoMode) {
        setProfile(DEMO_PROFILE);
        setAgeStatus(demoAgeStatus());
        setLoadedUserId(id);
        setLoading(false);
      }
      return;
    }
    const requestId = ++profileRequestId.current;
    setLoading(true);
    setLoadedUserId(null);
    try {
      const [p, age] = await Promise.all([userRepo.getMyProfile(id), loadAgeStatus()]);
      if (profileRequestId.current === requestId) {
        setProfile(p);
        setAgeStatus(age);
        setLoadFailed(false);
      }
    } catch (err) {
      console.error('[ProfileContext] loadProfile error:', err);
      if (profileRequestId.current === requestId) {
        setProfile(null);
        setAgeStatus(null);
        setLoadFailed(true);
      }
    } finally {
      if (profileRequestId.current === requestId) {
        setLoadedUserId(id);
        setLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRepo, signedUpAsAdult]);

  // The account's age status. An account that signed up through the new
  // Register screen is confirmed here, on its first sign-in on any device.
  // A failed check returns null: it moves nobody (see ageGateFor).
  async function loadAgeStatus(): Promise<AgeStatus | null> {
    try {
      const status = await getMyAgeStatus(ageClient);
      if (status === 'unconfirmed' && signedUpAsAdult) {
        return await confirmMyAgeFromSignup(ageClient);
      }
      return status;
    } catch (err) {
      console.warn('[ProfileContext] age status unavailable:', (err as Error)?.message);
      return null;
    }
  }

  useEffect(() => {
    if (!userId) {
      // Invalidate an in-flight request so a previous user's profile cannot
      // be written back after sign-out or an account switch.
      profileRequestId.current += 1;
      setProfile(null);
      setAgeStatus(null);
      setLoadedUserId(null);
      setLoading(false);
      return;
    }
    loadProfile(userId);
  }, [userId, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  // Dates, money and default price currency follow the home market (HM-03, HM-04).
  useEffect(() => {
    setFormatMarket(profile?.homeMarket ?? 'UK');
  }, [profile?.homeMarket]);

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

  const confirmAge = useCallback(async (birthDate: string): Promise<'confirmed' | 'declined'> => {
    if (!userId) throw new Error('Not signed in');
    if (isDemoMode) {
      setAgeStatus('confirmed');
      return 'confirmed';
    }
    const result = await confirmMyAge(ageClient, birthDate);
    setAgeStatus(result);
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const checkUsernameAvailable = useCallback(async (username: string): Promise<boolean> => {
    if (!userRepo) return false;
    return userRepo.checkUsernameAvailable(username, userId ?? undefined);
  }, [userRepo, userId]);

  // A session update renders before the effect above starts loading its
  // profile. Treat that small window as loading rather than briefly deciding
  // the new user needs to complete their profile.
  const profileIsCurrent = userId !== null && loadedUserId === userId;
  const effectiveLoading = loading || (userId !== null && !profileIsCurrent);
  const needsUsername = needsUsernameFor({
    hasSession: session !== null,
    profileLoaded: profileIsCurrent && !loading,
    loadFailed,
    username: profile?.username,
  });
  const { needsAgeConfirmation, ageDeclined } = ageGateFor({
    hasSession: session !== null,
    ageStatus: profileIsCurrent && !loading ? ageStatus : null,
  });

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading: effectiveLoading,
        needsUsername,
        needsAgeConfirmation,
        ageDeclined,
        confirmAge,
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
