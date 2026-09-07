import type { ImageSourcePropType } from 'react-native';

/**
 * Where a "What's Happening" card came from. Only 'imported' (hand-curated
 * seed data, see mock-data/events.ts) and 'community' (derived from existing
 * CommunityPost records of type 'new_pickup') are populated today. 'admin'
 * is reserved for a future admin-authored event tool — see CLAUDE.md /
 * the Home "What's Happening" task notes before building it.
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
  createdAt: string;
}
