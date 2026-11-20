/**
 * Board scanning — catalogue candidates for one described pin.
 *
 * The scan's findCandidates (services/scanCandidates.ts) was written for a
 * ~13k catalogue: one search per character (120 pins) and one per keyword
 * (80 pins), merged characters first. At 116k pins, "Grogu" or "Buzz" alone
 * matches hundreds or thousands, so those 120 are an arbitrary slice, and the
 * specific words ("pod", "popsicle", "claw machine") are searched across the
 * whole catalogue and land after them — past the board's candidate cap.
 *
 * When the board's sets are known (typed at upload, or learned from
 * confirmed pins), each is resolved to its exact catalogue collection where
 * possible, and the set with each top character comes first. Many set pins
 * are titled only by character ("Meeko"), so within a set the character
 * alone is enough to find them. Then the rest of those sets, limited to a
 * share of the cap so they can't push the narrow matches out.
 *
 * Then the narrow searches: each of the top characters together
 * with each specific keyword (search words must all match; the character
 * filter adds to that), the same as plain words too (for pins whose
 * character link is missing), and printed text on its own. The scan's broad
 * search fills the rest. Order is kept, duplicates dropped, capped.
 *
 * When the picture index is on, the pins whose reference pictures look most
 * like the crop come before all of these.
 */
import type { CataloguePin, PinRepository } from "@workspace/pin-repository";
import { findCandidates } from "../scanCandidates";

const FOCUSED_CHARACTERS = 2;
const FOCUSED_KEYWORDS = 5;
const FOCUSED_LIMIT = 30;
const TEXT_LIMIT = 40;
/** A whole set: most sets are far smaller than this. */
const SET_LIMIT = 60;
/** A set name that isn't a catalogue collection, searched as words: much looser, so fewer. */
const LOOSE_SET_LIMIT = 25;
const MAX_SETS = 5;
/** At most this share of the candidates comes from "the rest of the board's sets". */
const SET_SHARE = 0.4;

type Search = (query: string, filters: Parameters<PinRepository["searchPins"]>[1]) => Promise<CataloguePin[]>;

/** Typed set name → exact catalogue collection (or null), remembered for the process. */
const resolvedSets = new Map<string, string | null>();

/**
 * The catalogue collection a typed set name means: itself when it's exact;
 * otherwise the collection most of the name's word-search results belong to,
 * when that collection's name contains every typed word ("tails friendship" →
 * "Tails of Friendship"). Null when nothing fits.
 */
export async function resolveSet(name: string, search: Search): Promise<{ name: string; collection: string | null }> {
  const key = norm(name);
  if (resolvedSets.has(key)) return { name, collection: resolvedSets.get(key)! };
  let collection: string | null = null;
  const exact = await search("", { status: "active", collection: name, limit: 1 });
  if (exact.length > 0) {
    collection = name;
  } else {
    const words = key.split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
    const counts = new Map<string, number>();
    for (const p of await search(name, { status: "active", limit: 60 })) {
      const c = p.collection?.trim();
      if (!c) continue;
      const cn = norm(c);
      if (words.length && words.every((w) => cn.includes(w))) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    collection = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  // A failed lookup isn't remembered (search returns [] on errors too, so only cache hits).
  if (collection) {
    if (resolvedSets.size > 500) resolvedSets.clear();
    resolvedSets.set(key, collection);
  }
  return { name, collection };
}

const norm = (s: string) => s.trim().toLowerCase();

export async function findBoardCandidates(
  repository: PinRepository,
  description: { characters: string[]; keywords: string[] },
  textTerms: string[],
  cap: number,
  sets: string[] = [],
  /** Pins whose reference pictures look like the crop (the picture index), closest first. */
  lookalikes: Promise<CataloguePin[]> | CataloguePin[] = [],
): Promise<CataloguePin[]> {
  // A failed (or throwing) search just contributes nothing.
  const search: Search = async (query, filters) => {
    try {
      return await repository.searchPins(query, filters);
    } catch {
      return [] as CataloguePin[];
    }
  };
  const characters = [...new Set(description.characters.map((c) => c.trim()).filter((c) => c.length >= 2))].slice(0, FOCUSED_CHARACTERS);
  const charSet = new Set(characters.map(norm));
  // Specific words: not a character name, long enough to mean something.
  const keywords = [...new Set(description.keywords.map((k) => k.trim()))]
    .filter((k) => k.length >= 3 && !charSet.has(norm(k)))
    .slice(0, FOCUSED_KEYWORDS);

  const focused: Array<Promise<CataloguePin[]>> = [];
  for (const character of characters) {
    for (const keyword of keywords) {
      focused.push(search(keyword, { status: "active", character, limit: FOCUSED_LIMIT }));
      focused.push(search(`${character} ${keyword}`, { status: "active", limit: FOCUSED_LIMIT }));
    }
  }
  // The board's sets: exact catalogue collections where the name resolves
  // to one (typed names are often close but not exact), else plain words.
  const resolved = await Promise.all(sets.slice(0, MAX_SETS).map((set) => resolveSet(set, search)));
  const setSearches: Array<Promise<CataloguePin[]>> = [];
  const wholeSets: Array<Promise<CataloguePin[]>> = [];
  for (const set of resolved) {
    for (const character of characters) {
      if (set.collection) {
        // Within the set, the character name alone finds pins titled only by it.
        setSearches.push(search(character, { status: "active", collection: set.collection, limit: FOCUSED_LIMIT }));
        setSearches.push(search("", { status: "active", collection: set.collection, character, limit: FOCUSED_LIMIT }));
      } else {
        setSearches.push(search(`${set.name} ${character}`, { status: "active", limit: FOCUSED_LIMIT }));
        setSearches.push(search(set.name, { status: "active", character, limit: FOCUSED_LIMIT }));
      }
    }
    wholeSets.push(set.collection
      ? search("", { status: "active", collection: set.collection, limit: SET_LIMIT })
      : search(set.name, { status: "active", limit: LOOSE_SET_LIMIT }));
  }
  const text = textTerms
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 2)
    .map((t) => search(t, { status: "active", limit: TEXT_LIMIT }));

  const [looksAlike, inSet, wholeSet, narrow, printed, broad] = await Promise.all([
    Promise.resolve(lookalikes).catch(() => [] as CataloguePin[]),
    Promise.all(setSearches),
    Promise.all(wholeSets),
    Promise.all(focused),
    Promise.all(text),
    findCandidates(repository, description, textTerms).catch(() => [] as CataloguePin[]),
  ]);

  const byId = new Map<string, CataloguePin>();
  const add = (pins: CataloguePin[], limit = cap) => {
    for (const p of pins) {
      if (byId.size >= Math.min(cap, limit)) break;
      if (!byId.has(p.id)) byId.set(p.id, p);
    }
  };
  // The set with the character, then the rest of the sets — only up to a
  // share of the cap, so a big set (or several) can't push the narrow
  // matches out — then narrow (character + specific word), printed text and broad.
  // Look-alikes first: the picture says more than any title.
  add(looksAlike);
  for (const pins of inSet) add(pins);
  const setBudget = byId.size + Math.floor(cap * SET_SHARE);
  for (const pins of wholeSet) add(pins, setBudget);
  for (const pins of [...narrow, ...printed, broad]) add(pins);
  return [...byId.values()];
}
