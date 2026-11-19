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
 * When the board's sets are known (typed at upload, or learned from a
 * confirmed pin), they come first: the set with each top character, then the
 * whole set. Many set pins are titled only by character ("Meeko"), so
 * within a set the character alone is enough to find them.
 *
 * Then the narrow searches: each of the top characters together
 * with each specific keyword (search words must all match; the character
 * filter adds to that), the same as plain words too (for pins whose
 * character link is missing), and printed text on its own. The scan's broad
 * search then fills the rest. Order is kept, duplicates dropped, capped.
 */
import type { CataloguePin, PinRepository } from "@workspace/pin-repository";
import { findCandidates } from "../scanCandidates";

const FOCUSED_CHARACTERS = 2;
const FOCUSED_KEYWORDS = 5;
const FOCUSED_LIMIT = 30;
const TEXT_LIMIT = 40;
/** A whole set: most sets are far smaller than this. */
const SET_LIMIT = 60;

const norm = (s: string) => s.trim().toLowerCase();

export async function findBoardCandidates(
  repository: PinRepository,
  description: { characters: string[]; keywords: string[] },
  textTerms: string[],
  cap: number,
  sets: string[] = [],
): Promise<CataloguePin[]> {
  // A failed (or throwing) search just contributes nothing.
  const search = async (query: string, filters: Parameters<PinRepository["searchPins"]>[1]) => {
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
  // The board's sets first: the set with each top character (title or
  // character link), then the whole set.
  const setSearches: Array<Promise<CataloguePin[]>> = [];
  const wholeSets: Array<Promise<CataloguePin[]>> = [];
  for (const set of sets.slice(0, 5)) {
    for (const character of characters) {
      setSearches.push(search(`${set} ${character}`, { status: "active", limit: FOCUSED_LIMIT }));
      setSearches.push(search(set, { status: "active", character, limit: FOCUSED_LIMIT }));
    }
    wholeSets.push(search(set, { status: "active", limit: SET_LIMIT }));
  }
  const text = textTerms
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 2)
    .map((t) => search(t, { status: "active", limit: TEXT_LIMIT }));

  const [inSet, wholeSet, narrow, printed, broad] = await Promise.all([
    Promise.all(setSearches),
    Promise.all(wholeSets),
    Promise.all(focused),
    Promise.all(text),
    findCandidates(repository, description, textTerms).catch(() => [] as CataloguePin[]),
  ]);

  const byId = new Map<string, CataloguePin>();
  // The board's sets (with the character, then whole), then narrow
  // (character + specific word), then printed text, then broad.
  for (const pins of [...inSet, ...wholeSet, ...narrow, ...printed, broad]) {
    for (const p of pins) {
      if (byId.size >= cap) break;
      if (!byId.has(p.id)) byId.set(p.id, p);
    }
  }
  return [...byId.values()];
}
