/**
 * Seed/demo data for the Home "What's Happening" carousel — hand-curated
 * from public event listings for the Pin & Pop demo. Not fetched from any
 * backend yet; see types/event.ts (sourceType 'imported') for where this
 * fits once PinHunt starts ingesting curated event info for real.
 */
import type { PinHuntEvent } from '@/types/event';

export const EVENTS: PinHuntEvent[] = [
  {
    id: 'enchanted-pin-trading-night',
    title: 'Enchanted Pin Trading Night',
    description:
      'The return of Disneyland Paris Pin Trading Night, featuring the new Enchanted pin collection.',
    eventDate: '2026-09-19',
    location: 'Disneyland Paris',
    country: 'France',
    eventType: 'Official Pin Trading Event',
    badgeLabel: 'DLP EVENT',
    sourceType: 'imported',
    sourceName: 'Destination Disneyland / Disneyland Paris',
    sourceUrl: 'https://destinationdisneyland.fr/pin-trading-night-enchanted-parc-disneyland-19-septembre/',
    image: require('../assets/images/events/enchanted-pin-trading-night.jpg'),
    featured: true,
    hasScheduledDate: true,
    createdAt: '2026-09-07T00:00:00.000Z',
  },
  {
    id: 'disney-pin-buy-trade-stockport',
    title: 'Disney Pin Buy & Trade',
    description:
      'Meet fellow Disney pin collectors for an afternoon of buying, trading and talking pins.',
    eventDate: '2026-09-20',
    time: '2pm–4pm',
    location: 'Stockport',
    country: 'UK',
    eventType: 'Community Trading Event',
    badgeLabel: 'UK TRADING',
    sourceType: 'imported',
    sourceName: 'Titan Pops / Eventbrite',
    sourceUrl: 'https://www.eventbrite.co.uk/e/titan-pops-disney-pin-buy-trade-tickets-1998215624724',
    hasScheduledDate: true,
    createdAt: '2026-09-07T00:00:00.000Z',
  },
  {
    id: 'pinstravaganza',
    title: 'Pinstravaganza',
    description:
      'A two-day weekend of Disney pin trading, merchandise, collectibles, crafts and community.',
    eventDate: '2026-10-03',
    endDate: '2026-10-04',
    location: 'Holiday Inn London Gatwick – Worth',
    country: 'UK',
    eventType: 'Pin Trading & Market Weekend',
    badgeLabel: 'UK EVENT',
    sourceType: 'imported',
    sourceName: 'Magical Memories From Main Street / Eventbrite',
    sourceUrl: 'https://www.eventbrite.co.uk/e/pinstravaganza-a-disney-pin-trading-and-market-weekend-tickets-1992404476423',
    hasScheduledDate: true,
    createdAt: '2026-09-07T00:00:00.000Z',
  },
  {
    id: 'pin-trading-from-regions-beyond',
    title: 'Pin Trading From Regions Beyond',
    description: "Pinsane's annual Runcorn pin trading weekend returns for 2026.",
    eventDate: '2026-10-10',
    endDate: '2026-10-11',
    location: 'Runcorn',
    country: 'UK',
    eventType: 'Pin Trading Weekend',
    badgeLabel: 'UK EVENT',
    sourceType: 'imported',
    sourceName: 'Pinsane',
    sourceUrl: 'https://www.pinsane.co.uk/runcorn',
    hasScheduledDate: true,
    createdAt: '2026-09-07T00:00:00.000Z',
  },
];
