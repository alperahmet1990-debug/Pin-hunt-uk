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

function safeAuthError(
  error: unknown,
  fallback: string,
): string {
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }
  if (normalized.includes('user already registered')) {
    return 'An account with this email already exists.';
  }
  if (normalized.includes('password should be at least')) {
    return 'Your password must be at least 6 characters.';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  // Never show raw HTTP responses, JSON payloads, headers, cookies, or proxy
  // errors in the UI. These can be very long and may contain sensitive data.
  return fallback;
}

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
  ): Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
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
      return {
        error: error
          ? safeAuthError(error, 'Unable to sign in right now. Please try again shortly.')
          : null,
      };
    } catch (err) {
      return {
        error: safeAuthError(err, 'Unable to sign in right now. Please try again shortly.'),
      };
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED, needsEmailConfirmation: false };
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName?.trim() || email },
        },
      });
      if (error) {
        return {
          error: safeAuthError(error, 'Unable to create your account right now. Please try again shortly.'),
          needsEmailConfirmation: false,
        };
      }
      // session is null when Supabase requires email confirmation before login.
      // session is set immediately when "Confirm email" is disabled in the dashboard.
      const needsEmailConfirmation = !data.session;
      return { error: null, needsEmailConfirmation };
    } catch (err) {
      return {
        error: safeAuthError(err, 'Unable to create your account right now. Please try again shortly.'),
        needsEmailConfirmation: false,
      };
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
