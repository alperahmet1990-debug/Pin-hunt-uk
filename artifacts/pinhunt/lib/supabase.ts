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

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    '[PinHunt] Supabase env vars not set. ' +
      'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to Replit Secrets. ' +
      'The app will use mock data until they are configured.',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
