import type { CommunityPost } from '@workspace/pin-repository';
import type { PinHuntEvent } from '@/types/event';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Mirrors the "posted Xh ago" convention already used across Community/Home. */
export function timeAgo(value: string): string {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

/** Renders a compact day/month pair for the date pill — collapses same-month
 * ranges ("03–04", "OCT") since that covers today's seed data; a genuine
 * cross-month range falls back to a longer day string in the same slot. */
export function formatEventDateParts(event: Pick<PinHuntEvent, 'eventDate' | 'endDate'>): { day: string; month: string } {
  const start = new Date(`${event.eventDate}T00:00:00`);
  const day = start.toLocaleDateString('en-GB', { day: '2-digit' });
  const month = start.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  if (!event.endDate) return { day, month };
  const end = new Date(`${event.endDate}T00:00:00`);
  const endDay = end.toLocaleDateString('en-GB', { day: '2-digit' });
  const endMonth = end.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  if (endMonth === month) return { day: `${day}–${endDay}`, month };
  return { day: `${day} ${month} – ${endDay}`, month: endMonth };
}

const COUNTRY_FLAGS: Record<string, string> = {
  France: '🇫🇷',
  UK: '🇬🇧',
  'United Kingdom': '🇬🇧',
};

export function countryFlag(country?: string): string {
  return country ? (COUNTRY_FLAGS[country] ?? '') : '';
}

/** A community "Event"-type post has no structured event date/location fields
 * yet (see types.ts CommunityPost) — this maps what it does have onto the
 * shared PinHuntEvent shape so it can render in the same carousel as curated
 * events, without inventing a schedule it doesn't have. */
export function communityPostToEvent(post: CommunityPost): PinHuntEvent {
  const firstLine = post.body.split('\n')[0]?.trim() || 'Community event';
  return {
    id: `community-${post.id}`,
    title: firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine,
    description: post.body,
    eventDate: post.createdAt.slice(0, 10),
    location: post.locationText || undefined,
    eventType: 'Community Post',
    badgeLabel: 'COMMUNITY',
    sourceType: 'community',
    image: post.photos[0] ? { uri: post.photos[0] } : undefined,
    hasScheduledDate: false,
    createdAt: post.createdAt,
    // No sourceUrl — Home opens the post itself for these.
  };
}

/** Upcoming-first ordering: featured pinned to the front, then chronological.
 * Events with a real schedule (hasScheduledDate) that have already fully
 * elapsed (endDate ?? eventDate < today) are dropped — so this list is safe
 * to call again once curated/admin events start coming from a live source. */
export function selectUpcomingEvents(events: PinHuntEvent[]): PinHuntEvent[] {
  const today = todayIso();
  return events
    .filter(event => !event.hasScheduledDate || (event.endDate ?? event.eventDate) >= today)
    .sort((a, b) => {
      if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
      return a.eventDate.localeCompare(b.eventDate);
    });
}
