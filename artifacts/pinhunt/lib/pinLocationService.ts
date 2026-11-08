/**
 * Where screens get places and pin locations (#547, migration 067).
 *
 * - Supabase configured: the user repository (owner-only tables).
 * - Demo mode (screenshots): an in-memory stand-in with a few places.
 * - Neither (unit tests, an unconfigured dev build): null, and screens hide
 *   the feature.
 *
 * Screens should also hide the feature when a call fails with
 * isPinLocationsUnavailable(err): that means migration 067 isn't applied.
 */
import { createSupabaseUserRepository, type IUserPinRepository } from '@workspace/pin-repository';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demoMode';

export type PinLocationService = Pick<IUserPinRepository,
  | 'getMyPlaces'
  | 'createPlace'
  | 'updatePlace'
  | 'deletePlace'
  | 'getMyPinLocations'
  | 'setPinLocations'
  | 'clearPinLocations'>;

let service: PinLocationService | null | undefined;

export function getPinLocationService(): PinLocationService | null {
  if (service !== undefined) return service;
  if (isSupabaseConfigured) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = createSupabaseUserRepository(supabase as any);
  } else if (isDemoMode) {
    // Loaded only in demo mode, like the mock catalogue (PinCatalogueContext).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    service = (require('@/mock-data/pinLocations') as typeof import('@/mock-data/pinLocations')).createDemoPinLocations();
  } else {
    service = null;
  }
  return service;
}

/** For tests: use this service (or none). */
export function setPinLocationServiceForTests(next: PinLocationService | null | undefined) {
  service = next;
}
