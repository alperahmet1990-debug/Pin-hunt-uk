/**
 * Where screens get events (#613, migration 081).
 *
 * - Supabase configured: the user repository (the events table; anyone
 *   reads published events, admins manage them in Admin → Events).
 * - Demo mode (screenshots): an in-memory stand-in seeded from
 *   mock-data/events.ts.
 * - Neither (unit tests, an unconfigured dev build): null, and screens show
 *   community event posts only.
 *
 * A call fails with isEventsUnavailable(err) until migration 081 is applied;
 * screens then show community event posts only.
 */
import { createSupabaseUserRepository, type IUserPinRepository } from '@workspace/pin-repository';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demoMode';

export type EventService = Pick<IUserPinRepository,
  | 'getEvents'
  | 'getAdminEvents'
  | 'saveEvent'
  | 'setEventPublished'
  | 'deleteEvent'>;

let service: EventService | null | undefined;

export function getEventService(): EventService | null {
  if (service !== undefined) return service;
  if (isSupabaseConfigured) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = createSupabaseUserRepository(supabase as any);
  } else if (isDemoMode) {
    // Loaded only in demo mode, like the mock catalogue (PinCatalogueContext).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    service = (require('@/mock-data/events') as typeof import('@/mock-data/events')).createDemoEvents();
  } else {
    service = null;
  }
  return service;
}

/** For tests: use this service (or none). */
export function setEventServiceForTests(next: EventService | null | undefined) {
  service = next;
}
