import type { ImageSourcePropType } from 'react-native';

/**
 * Where a "What's Happening" card came from: 'admin' (the events table,
 * managed in Admin → Events, #613; demo mode serves mock-data/events.ts
 * through the same path), 'community' (CommunityPost records of type
 * 'new_pickup'), or 'imported' (the hand-curated list in
 * mock-data/events.ts, now demo data only).
 */
export type EventSourceType = 'admin' | 'community' | 'imported';

export interface PinHuntEvent {
  id: string;
  title: string;
  description: string;
  /** ISO date (yyyy-mm-dd) the event starts on, or — when hasScheduledDate
   * is false — the date the underlying post was created. Used for sorting
   * and for filtering past events out of the "upcoming" list. */
  eventDate: string;
  /** ISO date (yyyy-mm-dd). Multi-day events only. */
  endDate?: string;
  time?: string;
  location?: string;
  country?: string;
  eventType: string;
  /** Short uppercase label shown as a pill over the card artwork, e.g. "DLP EVENT". */
  badgeLabel: string;
  sourceType: EventSourceType;
  sourceName?: string;
  /** Tapping "View event" opens this URL. Omitted for community posts, which open the post instead. */
  sourceUrl?: string;
  image?: ImageSourcePropType;
  /** Featured events are pinned to the front of the carousel regardless of date. */
  featured?: boolean;
  /** False for events with no real scheduled date (e.g. community posts) —
   * the card shows "posted" recency instead of a day/month pill. */
  hasScheduledDate: boolean;
  /**
   * Talked about but not yet dated or confirmed (#352). Shown last, marked
   * "Rumoured", with `whenText` instead of a date. `eventDate`/`endDate`
   * then only decide when the rumour stops being shown.
   */
  rumour?: boolean;
  /** Rumours only: roughly when, e.g. "December · date TBC". */
  whenText?: string;
  createdAt: string;
}
