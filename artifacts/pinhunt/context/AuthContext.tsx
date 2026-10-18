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
import { Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEMO_SESSION, isDemoMode } from '@/lib/demoMode';
import * as Linking from 'expo-linking';
import { parseRecoveryLink } from '@/utils/recoveryLink';

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

// Native: the app's deep link. Web (the contributor website, #398): back to
// this site's /reset, where the recovery tokens are read from the URL below
// and AuthGuard sends the user to update-password. Each site's /reset must be
// in Supabase Auth's redirect allow list (docs/release/CONTRIBUTOR-WEB.md).
export const PASSWORD_RESET_REDIRECT =
  Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/reset` : 'pinhunt://reset';
const PASSWORD_RESET_RETRY = 'Unable to send the reset email right now. Please try again shortly.';

/**
 * Sends a password-reset email. An unknown address is reported as success so
 * the UI can show one neutral confirmation (no account enumeration). Any other
 * failure maps to a fixed retry message — raw Supabase errors never reach the UI.
 */
export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RESET_REDIRECT,
    });
    if (!error) return { error: null };
    const message = (error.message ?? '').toLowerCase();
    if (message.includes('not found') || message.includes('user does not exist')) {
      return { error: null };
    }
    return { error: safeAuthError(error, PASSWORD_RESET_RETRY) };
  } catch (err) {
    return { error: safeAuthError(err, PASSWORD_RESET_RETRY) };
  }
}

const PASSWORD_UPDATE_RETRY = 'Unable to update your password right now. Please try again shortly.';

/**
 * Sets a new password for the current (recovery) session. Failures map to
 * fixed messages — the password and raw Supabase errors are never surfaced or logged.
 */
export async function updatePassword(password: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };
  try {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? safeAuthError(error, PASSWORD_UPDATE_RETRY) : null };
  } catch (err) {
    return { error: safeAuthError(err, PASSWORD_UPDATE_RETRY) };
  }
}

// ─── Context shape ────────────────────────────────────────────────────────────
interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True while a password-recovery session is active and the password is not yet updated. */
  isRecovery: boolean;
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  signUp(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<{ error: string | null }>;
  updatePassword(password: string): Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // Skip Supabase calls entirely when not configured — avoids the
    // "invalid path in request URL" fetch error on unconfigured builds.
    if (!isSupabaseConfigured) {
      // Screenshot harness only: a mock signed-in session (see lib/demoMode).
      if (isDemoMode) setSession(DEMO_SESSION);
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
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
      else if (event === 'USER_UPDATED' || event === 'SIGNED_OUT') setIsRecovery(false);
    });

    // Password-reset deep link: establish the recovery session from the URL.
    // The flag is set before the session so AuthGuard never sees a normal one.
    const handleUrl = async (url: string | null) => {
      const link = parseRecoveryLink(url);
      if (!link) return;
      try {
        setIsRecovery(true);
        const { error } =
          link.kind === 'tokens'
            ? await supabase.auth.setSession({
                access_token: link.accessToken,
                refresh_token: link.refreshToken,
              })
            : await supabase.auth.exchangeCodeForSession(link.code);
        if (error) setIsRecovery(false);
      } catch {
        setIsRecovery(false);
      }
    };
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => {
      subscription.unsubscribe();
      linkSub.remove();
    };
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
        isRecovery,
        signIn,
        signUp,
        signOut,
        requestPasswordReset: sendPasswordReset,
        updatePassword,
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
