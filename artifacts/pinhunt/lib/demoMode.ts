/**
 * Demo mode: a signed-in, profile-complete session backed only by mock data.
 *
 * Used by the screenshot harness (scripts/screenshots.mjs) so auth-gated
 * screens render in a web export with no Supabase project. It can only be
 * active when Supabase is NOT configured, so a real build (which always has
 * EXPO_PUBLIC_SUPABASE_URL/ANON_KEY) can never enter it, even if the flag
 * is set by mistake.
 */
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '@workspace/pin-repository';
import { isSupabaseConfigured } from '@/lib/supabase';

export const isDemoMode =
  !isSupabaseConfigured && process.env.EXPO_PUBLIC_DEMO_MODE === '1';

const DEMO_USER_ID = '00000000-0000-4000-8000-00000000d3e0';
const EPOCH = '2026-01-01T00:00:00.000Z';

export const DEMO_SESSION = {
  access_token: 'demo',
  refresh_token: 'demo',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  user: {
    id: DEMO_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'demo@pinhunt.invalid',
    app_metadata: {},
    user_metadata: {},
    created_at: EPOCH,
  },
} as Session;

export const DEMO_PROFILE: Profile = {
  id: DEMO_USER_ID,
  username: 'demo.collector',
  displayName: 'Demo Collector',
  bio: 'Screenshot demo account (mock data only).',
  internationalTradingEnabled: false,
  allowTradeRequests: true,
  allowMessages: true,
  profileVisibility: 'public',
  isAdmin: false,
  createdAt: EPOCH,
  updatedAt: EPOCH,
  hasLocationSet: false,
  nearbyDiscoveryEnabled: false,
  preferredRadiusMiles: 25,
  openToLocalTrades: false,
  openToPostalTrades: true,
  happyToTravel: false,
};
