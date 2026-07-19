/**
 * Supabase client singleton for the Expo app.
 *
 * Uses the EXPO_PUBLIC_ anon key only — the service role key is NEVER
 * imported here. All DB access goes through RLS-enforced policies.
 *
 * Session is persisted to AsyncStorage so it survives app restarts.
 */
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '@workspace/pin-repository';

// Trim whitespace and strip trailing slashes — a trailing slash causes
// Supabase to construct double-slash paths like /auth/v1//signup which
// React Native fetch rejects with "invalid path in request URL".
const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/**
 * True only when both env vars are present and look like real values.
 * Import this wherever you need to guard against unconfigured Supabase.
 */
export const isSupabaseConfigured = Boolean(
  supabaseUrl.startsWith('https://') && supabaseAnonKey.length > 20,
);

if (__DEV__ && !isSupabaseConfigured) {
  console.warn(
    '[PinHunt] Supabase is not configured.\n' +
      '  Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY\n' +
      '  to Replit Secrets. The app will use mock data and auth will be unavailable.',
  );
}

export const supabase = createClient<Database>(
  // Fall back to a placeholder that won't throw at construction time.
  // Auth methods are guarded by isSupabaseConfigured before calling.
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
