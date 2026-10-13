/**
 * Catalogue photo gaps a collector can fill (UX-056, #208). A pin "needs a
 * photo" exactly as on the Help Build the Catalogue screen: no catalogue
 * image (`imageSource === null`). Collectors are asked only about pins they
 * own, since they have them in hand.
 */
import type { CatalogueImageCoverage } from '@workspace/pin-repository';

export const PHOTO_CARD_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const photoCardSnoozeKey = (userId: string) => `@pinhunt_photo_gaps_snooze_v1:${userId}`;

export const needsPhoto = (row: Pick<CatalogueImageCoverage, 'imageSource'>) => row.imageSource === null;

export interface PhotoGaps {
  /** Owned pins with no photo that the collector hasn't sent one for yet. */
  todo: CatalogueImageCoverage[];
  /** Owned pins with no photo where the collector's photo is awaiting review. */
  sent: CatalogueImageCoverage[];
}

/** Split the collector's owned pins (optionally only those in `onlyIds`) into still-to-photograph and already-sent. */
export function photoGaps(rows: CatalogueImageCoverage[], ownedIds: Set<string>, onlyIds?: string[]): PhotoGaps {
  const only = onlyIds ? new Set(onlyIds) : null;
  const todo: CatalogueImageCoverage[] = [];
  const sent: CatalogueImageCoverage[] = [];
  for (const row of rows) {
    if (!needsPhoto(row)) continue;
    // Only pins in hand: owned or For Trade (an ISO pin isn't), and in `onlyIds` when given.
    if (!ownedIds.has(row.pinhuntId) || (only && !only.has(row.pinhuntId))) continue;
    (row.myStatus === 'pending' ? sent : todo).push(row);
  }
  return { todo, sent };
}

/** The Home / My Collection card stays hidden for a week after "Not now". */
export function isSnoozed(snoozedAt: string | null, now = Date.now()): boolean {
  if (!snoozedAt) return false;
  const at = Number(snoozedAt);
  return Number.isFinite(at) && now - at < PHOTO_CARD_SNOOZE_MS;
}
