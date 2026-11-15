/**
 * Published, upcoming events for Home and the What's Happening page (#613),
 * in the card shape (sourceType 'admin'). Empty while loading, when there's
 * no event service, or when loading fails (e.g. migration 081 not applied):
 * screens still show community event posts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getEventService } from '@/lib/eventService';
import { pinEventToEvent } from '@/utils/events';
import type { PinHuntEvent } from '@/types/event';

export function useEvents(): { events: PinHuntEvent[]; reload: () => Promise<void> } {
  const [events, setEvents] = useState<PinHuntEvent[]>([]);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const reload = useCallback(async () => {
    const service = getEventService();
    if (!service) return;
    try {
      const loaded = (await service.getEvents()).map(pinEventToEvent);
      if (mounted.current) setEvents(loaded);
    } catch {
      // Keep what was shown; community posts still render.
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { events, reload };
}
