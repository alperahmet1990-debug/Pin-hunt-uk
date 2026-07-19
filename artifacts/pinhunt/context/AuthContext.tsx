/**
 * AuthContext — wraps Supabase Auth for the Expo app.
 *
 * Provides: session, user, loading, signIn, signUp, signOut.
 *
 * On sign-up Supabase automatically fires the handle_new_user trigger,
 * which creates a profiles row. No extra round-trip is needed here.
 *
 * Do NOT import SUPABASE_SERVICE_ROLE_KEY here.
 * This file is bundled into the mobile app and must only use the anon key.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// Shown to the user when they attempt auth without Supabase configured.
const NOT_CONFIGURED =
  'Supabase is not set up yet. Add EXPO_PUBLIC_SUPABASE_URL and ' +
  'EXPO_PUBLIC_SUPABASE_ANON_KEY to Replit Secrets, then restart the app.';

// ─── Context shape ────────────────────────────────────────────────────────────
interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  signUp(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Skip Supabase calls entirely when not configured — avoids the
    // "invalid path in request URL" fetch error on unconfigured builds.
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Hydrate session from AsyncStorage on first mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Subscribe to auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Sign-in failed. Please try again.' };
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName?.trim() || email },
        },
      });
      return { error: error?.message ?? null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Sign-up failed. Please try again.' };
    }
  };

  const signOut = async () => {
    if (!isSupabaseConfigured) return;
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore sign-out errors — session is cleared locally regardless
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
