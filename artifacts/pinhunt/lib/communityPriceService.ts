/**
 * Where screens get collector and community prices (#511).
 *
 * - Supabase configured: the user repository (migration 065 functions).
 * - Demo mode (screenshots): an in-memory stand-in seeded with every state.
 * - Neither (unit tests, an unconfigured dev build): null, and screens hide
 *   the feature.
 *
 * Screens should also hide the feature when a call fails with
 * isCommunityPricesUnavailable(err): that means migration 065 isn't applied.
 */
import { createSupabaseUserRepository, type IUserPinRepository } from '@workspace/pin-repository';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demoMode';

export type CommunityPriceService = Pick<IUserPinRepository,
  | 'setMyPinPrice'
  | 'clearMyPinPrice'
  | 'getMyPinPrices'
  | 'getCommunityPrice'
  | 'getCommunityPrices'
  | 'getMyCommunityPriceSetting'
  | 'setMyCommunityPriceSetting'>;

let service: CommunityPriceService | null | undefined;

export function getCommunityPriceService(): CommunityPriceService | null {
  if (service !== undefined) return service;
  if (isSupabaseConfigured) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = createSupabaseUserRepository(supabase as any);
  } else if (isDemoMode) {
    // Loaded only in demo mode, like the mock catalogue (PinCatalogueContext).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    service = (require('@/mock-data/communityPrices') as typeof import('@/mock-data/communityPrices')).createDemoCommunityPrices();
  } else {
    service = null;
  }
  return service;
}
