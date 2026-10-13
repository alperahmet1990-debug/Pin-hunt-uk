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

const MAX_COLLECTION_INTERESTS = 3;

/**
 * Interests from what the collector owns, has For Trade and has on their ISO
 * (B-P2-11) — no Boards needed. Each subject word that recurs across those
 * pins is an interest; words that always appear together ("mickey" +
 * "mouse") merge into one. Strongest (most pins) first, up to `max`.
 * With a single pin, its own subject words count.
 */
export function deriveCollectionInterests(
  pins: Pick<CataloguePin, 'id' | 'title'>[],
  max = MAX_COLLECTION_INTERESTS,
): CollectionInterest[] {
  const pinsByWord = new Map<string, Set<string>>();
  for (const p of pins) {
    for (const w of new Set(subjectTokens(p.title))) {
      if (!pinsByWord.has(w)) pinsByWord.set(w, new Set());
      pinsByWord.get(w)!.add(p.id);
    }
  }
  const minPins = pins.length > 1 ? 2 : 1;
  const groups = new Map<string, { words: string[]; count: number }>();
  for (const [word, ids] of pinsByWord) {
    if (ids.size < minPins) continue;
    const key = [...ids].sort().join('|');
    const group = groups.get(key) ?? { words: [], count: ids.size };
    group.words.push(word);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.words[0].localeCompare(b.words[0]))
    .slice(0, max)
    .map(g => ({
      label: g.words.map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
      keywords: g.words,
    }));
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
  /** Which inferred interest(s) this pin matched — e.g. "Stitch". */
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
