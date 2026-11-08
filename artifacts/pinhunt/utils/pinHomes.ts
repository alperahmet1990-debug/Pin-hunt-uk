/**
 * Giving pins a home (#547): which page and pocket each pin gets when one or
 * many pins are put in a place at once.
 */
import {
  freePockets,
  type CollectionPlace,
  type PinLocation,
  type PinLocationInput,
} from '@workspace/pin-repository';

export interface HomePlan {
  inputs: PinLocationInput[];
  /** Pins that didn't fit in free pockets (book full from that page on). */
  overflow: number;
}

/**
 * Plan where `pinIds` go in `place`.
 * - Places without pages and pockets (frames, lanyards, boxes): the place only.
 * - Books: free pockets from `startPage` onwards, then earlier pages, in order.
 *   Pockets the moving pins already use count as free.
 * - `page` and `pocket` both given for a single pin: exactly that pocket.
 */
export function planHomes(
  place: CollectionPlace,
  locations: PinLocation[],
  pinIds: string[],
  opts: { startPage?: number; page?: number; pocket?: number } = {},
): HomePlan {
  const isBook = !!place.pages && !!place.pocketsPerPage;
  if (!isBook) return { inputs: pinIds.map(() => ({ placeId: place.id })), overflow: 0 };
  if (pinIds.length === 1 && opts.page) {
    return { inputs: [{ placeId: place.id, page: opts.page, pocket: opts.pocket ?? null }], overflow: 0 };
  }
  const moving = new Set(pinIds);
  const others = locations.filter(l => !moving.has(l.pinId));
  const start = Math.max(1, opts.startPage ?? 1);
  const free = freePockets(place, others);
  const ordered = [...free.filter(s => s.page >= start), ...free.filter(s => s.page < start)];
  const inputs = pinIds.map((_, i) => {
    const slot = ordered[i];
    return slot ? { placeId: place.id, page: slot.page, pocket: slot.pocket } : { placeId: place.id };
  });
  return { inputs, overflow: Math.max(0, pinIds.length - ordered.length) };
}

/** Pins in a place, as a page → pocket → pinId lookup (books), for drawing pages. */
export function pagesOf(place: CollectionPlace, locations: PinLocation[]): Map<number, Map<number, string>> {
  const pages = new Map<number, Map<number, string>>();
  for (const l of locations) {
    if (l.placeId !== place.id || !l.page) continue;
    const page = pages.get(l.page) ?? new Map<number, string>();
    if (l.pocket) page.set(l.pocket, l.pinId);
    pages.set(l.page, page);
  }
  return pages;
}

export const PLACE_KIND_LABEL: Record<CollectionPlace['kind'], string> = {
  book: 'Trade book',
  board: 'Board',
  display: 'Display frame',
  lanyard: 'Lanyard',
  box: 'Box or tin',
  other: 'Somewhere else',
};
