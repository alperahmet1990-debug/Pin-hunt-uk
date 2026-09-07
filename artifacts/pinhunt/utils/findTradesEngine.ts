/**
 * Find Trades opportunity calculations — pure functions over data already
 * fetched by the repository/context layer, kept separate from presentation
 * so this logic can move server-side later without touching the screen.
 */
import type { CataloguePin, ForTradeInventoryItem } from '@workspace/pin-repository';

export interface PinOpportunity {
  pinId: string;
  title: string;
  imageUrl?: string;
  collectors: { id: string; username: string }[];
}

/** Group raw for-trade rows by pin, so a pin held by several collectors renders once. */
export function groupInventoryByPin(items: ForTradeInventoryItem[]): PinOpportunity[] {
  const byPin = new Map<string, PinOpportunity>();
  for (const item of items) {
    let entry = byPin.get(item.pinId);
    if (!entry) {
      entry = { pinId: item.pinId, title: item.title, imageUrl: item.imageUrl, collectors: [] };
      byPin.set(item.pinId, entry);
    }
    if (!entry.collectors.some(c => c.id === item.traderId)) {
      entry.collectors.push({ id: item.traderId, username: item.traderUsername });
    }
  }
  return [...byPin.values()];
}

// Catalogue titles in this dataset follow "{Series/Programme} - {Subject}" —
// the subject (last segment) is the closest thing to a character/theme label
// available, since main_character/pin_characters are largely unpopulated.
const DESCRIPTOR_STOP = new Set(['chaser', 'variant', 'version', 'le', 'set', 'mystery', 'booster', 'icon', 'edition', 'dated']);

function subjectTokens(title: string): string[] {
  const last = title.split(' - ').pop()?.trim().toLowerCase() ?? '';
  return last.split(/[^a-z]+/).filter(w => w.length > 2 && !DESCRIPTOR_STOP.has(w));
}

/**
 * Derive the dominant subject keyword(s) from a set of pins — used both for
 * a Board's contents and, as a fallback, the collector's whole Owned list.
 * A word counts as "dominant" once it appears in at least half the pins,
 * which is enough to surface "stitch" from a Stitch board and "mickey"+
 * "mouse" from a Mickey Mouse board without any character metadata.
 */
export function deriveInterestKeywords(pins: Pick<CataloguePin, 'title'>[]): string[] {
  if (pins.length === 0) return [];
  const freq = new Map<string, number>();
  for (const p of pins) for (const w of subjectTokens(p.title)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const threshold = pins.length / 2;
  return [...freq.entries()].filter(([, count]) => count >= threshold).map(([word]) => word);
}

export function pinTitleMatchesKeywords(title: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const tokens = new Set(subjectTokens(title));
  return keywords.some(k => tokens.has(k));
}

export interface ReciprocalCandidate {
  traderId: string;
  theyHaveCount: number;
  iHaveCount: number;
}

/** Two-way matches only, strongest first (by total pins involved). */
export function rankReciprocalCandidates(candidates: ReciprocalCandidate[]): ReciprocalCandidate[] {
  return candidates
    .filter(c => c.theyHaveCount > 0 && c.iHaveCount > 0)
    .sort((a, b) => (b.theyHaveCount + b.iHaveCount) - (a.theyHaveCount + a.iHaveCount));
}

export interface DiscoveryItem {
  pinId: string;
  title: string;
  imageUrl?: string;
  collectorCount: number;
  /** Which inferred interest(s) this pin matched — e.g. board names. */
  tags: string[];
}

export interface CollectionInterest {
  label: string;
  keywords: string[];
}

/**
 * Match current for-trade inventory against inferred interests, excluding
 * anything the collector already owns/wants/trades or that's already shown
 * elsewhere in Find Trades (e.g. On Your ISO), so nothing repeats.
 */
export function buildDiscoveryItems(
  inventory: ForTradeInventoryItem[],
  interests: CollectionInterest[],
  excludePinIds: Set<string>,
): DiscoveryItem[] {
  const byPin = new Map<string, { title: string; imageUrl?: string; collectors: Set<string>; tags: Set<string> }>();
  for (const item of inventory) {
    if (excludePinIds.has(item.pinId)) continue;
    for (const interest of interests) {
      if (!pinTitleMatchesKeywords(item.title, interest.keywords)) continue;
      let entry = byPin.get(item.pinId);
      if (!entry) {
        entry = { title: item.title, imageUrl: item.imageUrl, collectors: new Set(), tags: new Set() };
        byPin.set(item.pinId, entry);
      }
      entry.collectors.add(item.traderId);
      entry.tags.add(interest.label);
    }
  }
  return [...byPin.entries()].map(([pinId, v]) => ({
    pinId,
    title: v.title,
    imageUrl: v.imageUrl,
    collectorCount: v.collectors.size,
    tags: [...v.tags],
  }));
}
