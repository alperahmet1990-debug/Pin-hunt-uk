/**
 * Demo events (#613). Real builds read events from the events table
 * (migration 081), managed in Admin → Events; this list is what demo mode
 * (screenshots) serves through the same event service, and what
 * supabase/verify/081_seed.sql seeded the table with. Picked by hand from
 * public listings and confirmed by the maintainer (#352). Undated events are
 * listed as rumours (`rumour: true`). Past events drop off automatically
 * (selectUpcomingEvents), so a test fails once every event here is over:
 * top it up so screenshots keep showing events.
 */
import { eventInputToRow, mapEventRow, type PinEvent, type PinEventInput } from '@workspace/pin-repository';
import type { PinHuntEvent } from '@/types/event';

export const EVENTS: PinHuntEvent[] = [
  {
    id: 'get-ready-comics-2026-10-18',
    title: 'Disney Pin Trading Day',
    description: 'A pin trading day at Get Ready Comics: 1-for-1 swaps, official pins only.',
    eventDate: '2026-10-18',
    location: 'Rochester',
    country: 'UK',
    eventType: 'Community Trading Event',
    badgeLabel: 'UK TRADING',
    sourceType: 'imported',
    sourceName: 'Get Ready Comics',
    sourceUrl: 'https://getreadycomics.com/pin-trading-days-are-back-at-get-ready-comics/',
    hasScheduledDate: true,
    createdAt: '2026-10-16T00:00:00.000Z',
  },
  {
    id: 'disney-store-trafford-2026-11-13',
    title: 'Disney Store Pin Trading Event',
    description: 'A ticketed pin trading morning at the Disney Store in Selfridges, Trafford Centre. Tickets £25, released 21 October via Disney Store.',
    eventDate: '2026-11-13',
    time: '7am–9:45am',
    location: 'Trafford Centre, Manchester',
    country: 'UK',
    eventType: 'Store Pin Trading Event',
    badgeLabel: 'UK EVENT',
    sourceType: 'imported',
    sourceName: 'Riding the Magic',
    sourceUrl: 'https://ridingthemagic.uk/news/disney-store-pin-events-trafford-centre-london-stores-november-2026',
    hasScheduledDate: true,
    createdAt: '2026-10-16T00:00:00.000Z',
  },
  {
    // Confirmed by the maintainer (#352); no public listing found yet.
    id: 'stewpins-milton-keynes-2026-11-14',
    title: 'StewPins Pin Trading Weekend',
    description: 'A two-day pin trading weekend in Milton Keynes, run by StewPins.',
    eventDate: '2026-11-14',
    endDate: '2026-11-15',
    location: 'Milton Keynes',
    country: 'UK',
    eventType: 'Pin Trading Weekend',
    badgeLabel: 'UK EVENT',
    sourceType: 'imported',
    sourceName: 'StewPins',
    hasScheduledDate: true,
    createdAt: '2026-10-16T00:00:00.000Z',
  },
  {
    id: 'titan-pops-stockport-2026-11-15',
    title: 'Disney Pin Buy & Trade Extravaganza',
    description: 'An afternoon of buying, selling and trading Disney pins with Titan Pops, at the Stockroom, Merseyway.',
    eventDate: '2026-11-15',
    time: '1pm–4pm',
    location: 'Stockport',
    country: 'UK',
    eventType: 'Community Trading Event',
    badgeLabel: 'UK TRADING',
    sourceType: 'imported',
    sourceName: 'Titan Pops / Eventbrite',
    sourceUrl: 'https://www.eventbrite.co.uk/e/titan-pops-disney-pin-buy-trade-extravaganza-tickets-1991917571076',
    hasScheduledDate: true,
    createdAt: '2026-10-16T00:00:00.000Z',
  },
  {
    id: 'disney-store-oxford-street-2026-11-25',
    title: 'Disney Store Pin Trading Event',
    description: 'A ticketed evening of pin trading at the Oxford Street Disney Store. Tickets £25, released 21 October via Disney Store.',
    eventDate: '2026-11-25',
    time: '3pm–10pm',
    location: 'Oxford Street, London',
    country: 'UK',
    eventType: 'Store Pin Trading Event',
    badgeLabel: 'UK EVENT',
    sourceType: 'imported',
    sourceName: 'Riding the Magic',
    sourceUrl: 'https://ridingthemagic.uk/news/disney-store-pin-events-trafford-centre-london-stores-november-2026',
    hasScheduledDate: true,
    createdAt: '2026-10-16T00:00:00.000Z',
  },
  {
    id: 'get-ready-comics-2026-11-29',
    title: 'Disney Pin Trading Day',
    description: 'A pin trading day at Get Ready Comics: 1-for-1 swaps, official pins only.',
    eventDate: '2026-11-29',
    location: 'Rochester',
    country: 'UK',
    eventType: 'Community Trading Event',
    badgeLabel: 'UK TRADING',
    sourceType: 'imported',
    sourceName: 'Get Ready Comics',
    sourceUrl: 'https://getreadycomics.com/pin-trading-days-are-back-at-get-ready-comics/',
    hasScheduledDate: true,
    createdAt: '2026-10-16T00:00:00.000Z',
  },
  // ── Rumoured: talked about, no confirmed date yet. Shown last, marked
  // "Rumoured"; eventDate/endDate only decide when they stop showing. ──
  {
    id: 'rumour-pinsane-pingle-bell-ball',
    title: 'Pingle Bell Ball',
    description: "Pinsane's Christmas pin trading weekend with dinner and dance. Expected in December; date and venue not announced yet.",
    eventDate: '2026-12-01',
    endDate: '2026-12-31',
    location: 'London',
    country: 'UK',
    eventType: 'Pin Trading Weekend',
    badgeLabel: 'TBA',
    sourceType: 'imported',
    sourceName: 'Disney and Days Out',
    sourceUrl: 'https://disneyanddaysout.co.uk/uk-pin-trading-events-2026',
    hasScheduledDate: true,
    rumour: true,
    whenText: 'December · date TBC',
    createdAt: '2026-10-16T00:00:00.000Z',
  },
  {
    id: 'rumour-dlp-pin-trading-night',
    title: 'Disneyland Paris Pin Trading Night',
    description: 'Disneyland Paris holds pin trading events through the year. The next date has not been announced yet.',
    eventDate: '2026-10-17',
    endDate: '2027-03-31',
    location: 'Disneyland Paris',
    country: 'France',
    eventType: 'Official Pin Trading Event',
    badgeLabel: 'TBA',
    sourceType: 'imported',
    sourceName: 'Disneyland Paris',
    sourceUrl: 'https://www.disneylandparis.com/en-gb/events/disneyland-paris-pin-trading',
    hasScheduledDate: true,
    rumour: true,
    whenText: 'Next date TBC',
    createdAt: '2026-10-16T00:00:00.000Z',
  },
  {
    id: 'rumour-get-ready-comics-2027',
    title: 'Disney Pin Trading Day',
    description: 'Get Ready Comics expects its pin trading days to resume at the end of January 2027.',
    eventDate: '2027-01-25',
    endDate: '2027-02-28',
    location: 'Rochester',
    country: 'UK',
    eventType: 'Community Trading Event',
    badgeLabel: 'TBA',
    sourceType: 'imported',
    sourceName: 'Get Ready Comics',
    sourceUrl: 'https://getreadycomics.com/pin-trading/',
    hasScheduledDate: true,
    rumour: true,
    whenText: 'Late January · TBC',
    createdAt: '2026-10-16T00:00:00.000Z',
  },
];

function toPinEvent(e: PinHuntEvent): PinEvent {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    eventDate: e.eventDate,
    endDate: e.endDate ?? null,
    time: e.time ?? null,
    location: e.location ?? null,
    country: e.country ?? null,
    eventType: e.eventType,
    badgeLabel: e.badgeLabel,
    sourceName: e.sourceName ?? null,
    sourceUrl: e.sourceUrl ?? null,
    featured: !!e.featured,
    rumour: !!e.rumour,
    whenText: e.whenText ?? null,
    published: true,
    createdAt: e.createdAt,
    updatedAt: e.createdAt,
  };
}

/**
 * An in-memory event service for demo mode: the events above, published,
 * plus one draft so Admin → Events shows both states. Edits last until reload.
 */
export function createDemoEvents() {
  let events: PinEvent[] = [
    ...EVENTS.map(toPinEvent),
    {
      ...toPinEvent(EVENTS[EVENTS.length - 1]),
      id: 'demo-draft-spring-meet',
      title: 'Spring pin meet (draft)',
      description: 'A draft: only admins see it until it is published.',
      eventDate: '2027-04-10',
      endDate: null,
      rumour: false,
      whenText: null,
      badgeLabel: 'UK EVENT',
      published: false,
    },
  ];
  let next = 1;
  const today = () => new Date().toISOString().slice(0, 10);
  const save = (input: PinEventInput, id?: string): PinEvent => {
    const row = eventInputToRow(input);
    const now = new Date().toISOString();
    const existing = id ? events.find(e => e.id === id) : undefined;
    const event = mapEventRow({
      ...row,
      id: existing?.id ?? `demo-event-${next++}`,
      created_at: existing?.createdAt ?? now,
      updated_at: now,
    })!;
    events = existing ? events.map(e => (e.id === id ? event : e)) : [event, ...events];
    return event;
  };
  return {
    getEvents: async () => events
      .filter(e => e.published && (e.endDate ?? e.eventDate) >= today())
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    getAdminEvents: async () => [...events].sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
    saveEvent: async (input: PinEventInput, id?: string) => save(input, id),
    setEventPublished: async (id: string, published: boolean) => {
      const found = events.find(e => e.id === id);
      if (!found) throw new Error('Event not found.');
      const updated = { ...found, published, updatedAt: new Date().toISOString() };
      events = events.map(e => (e.id === id ? updated : e));
      return updated;
    },
    deleteEvent: async (id: string) => { events = events.filter(e => e.id !== id); },
  };
}
