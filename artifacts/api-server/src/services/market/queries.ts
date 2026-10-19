/**
 * Search-query building and per-pin search planning for marketplace adapters
 * (SG-03, #406).
 *
 * - English sources lead with a short keyword search from the title, then
 *   reuse v1 `buildSearchQueries` (eBay Browse v1 is unchanged).
 * - French sources lead with "pin's <short keywords>", then French phrasing
 *   ("pin's Disney …", "pin Disney …") and the v1 queries.
 * - `planPinSearches` de-duplicates a pin's searches across adapters by
 *   `searchKey`, so the same paid search is never run twice for one pin, and
 *   reports the worst-case credit cost before anything is called.
 */
import type { CataloguePin } from "@workspace/pin-repository";
import { normaliseQueryKey, type MarketplaceAdapter } from "./adapter";
import { buildSearchQueries } from "./matching";

/** Trim, collapse whitespace, drop empties and case-insensitive duplicates, cap. */
export function dedupeQueries(candidates: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of candidates) {
    const key = normaliseQueryKey(q);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q.replace(/\s+/g, " ").trim());
    if (out.length >= max) break;
  }
  return out;
}

// Words that narrow a marketplace search without helping it find the pin:
// brand and filler words, park codes, edition wording. Years are dropped too
// (other numbers, as in "101 Dalmatians", are kept). The matcher still checks
// all of these.
const SHORT_QUERY_DROP = new Set([
  "disney", "pin", "pins", "pin's", "series", "collection", "characters", "character",
  "the", "with", "and", "of", "a", "an", "le", "lr", "oe", "limited", "edition", "release", "open",
  "wdw", "dlr", "dlp", "dl", "dca", "dlrp", "hkdl", "tdr", "sdr", "dsf", "dsss", "wdi",
]);
const SHORT_QUERY_WORDS = 5;

/**
 * A short keyword search from the catalogue title (#411 pilot: full titles
 * often find nothing). The last " - " part (usually the pin's own name) comes
 * first, then the other parts from the end backwards; filler, years and park
 * codes are dropped; at most 5 words, then "pin".
 * "Hidden Mickey 2013 WDW - Characters - Tinker Bell" → "Tinker Bell Hidden Mickey pin".
 */
export function shortKeywordQuery(pin: CataloguePin): string | null {
  const parts = pin.title.split(/\s+[-–—|:]\s+/).reverse();
  const seen = new Set<string>();
  const words: string[] = [];
  for (const part of parts) {
    for (const raw of part.split(/[^\p{L}\p{N}'’]+/u)) {
      const w = raw.replace(/^['’]+|['’]+$/g, "");
      const key = w.toLowerCase();
      if (!w || SHORT_QUERY_DROP.has(key) || /^(19|20)\d\d$/.test(w) || seen.has(key)) continue;
      seen.add(key);
      words.push(w);
      if (words.length >= SHORT_QUERY_WORDS) break;
    }
    if (words.length >= SHORT_QUERY_WORDS) break;
  }
  return words.length ? words.join(" ") : null;
}

/** English queries: the short keyword search, then v1 `buildSearchQueries`, capped at `max`. */
export function buildEnglishQueries(pin: CataloguePin, max = 3): string[] {
  const short = shortKeywordQuery(pin);
  return dedupeQueries([...(short ? [`${short} pin`] : []), ...buildSearchQueries(pin)], Math.max(0, max));
}

/** French queries: "pin's <short keywords>", "pin's Disney <title> [LE n]", "pin Disney <title>", then v1. */
export function buildFrenchQueries(pin: CataloguePin, max = 3): string[] {
  const le = pin.limitedEditionSize ? `LE ${pin.limitedEditionSize}` : "";
  const short = shortKeywordQuery(pin);
  return dedupeQueries(
    [
      ...(short ? [`pin's ${short}`] : []),
      `pin's Disney ${pin.title} ${le}`,
      `pin Disney ${pin.title}`,
      ...buildSearchQueries(pin),
    ],
    Math.max(0, max),
  );
}

export interface PlannedSearch {
  adapter: MarketplaceAdapter;
  query: string;
  key: string;
}

export interface PinSearchPlan {
  searches: PlannedSearch[];
  /** Queries dropped because an earlier planned search has the same key. */
  skippedDuplicates: Array<{ sourceId: string; query: string; key: string }>;
  /** Worst-case credits if every planned search runs. */
  credits: number;
}

export interface PlanOptions {
  /** Stop adding paid searches once this many credits are planned. */
  creditLimit?: number;
}

/**
 * Plan every search for one pin across `adapters`, in adapter order (the
 * registry orders them by priority). Free searches (0 credits) are always
 * planned; paid ones stop at `creditLimit`.
 */
export function planPinSearches(
  pin: CataloguePin,
  adapters: readonly MarketplaceAdapter[],
  opts: PlanOptions = {},
): PinSearchPlan {
  const searches: PlannedSearch[] = [];
  const skippedDuplicates: PinSearchPlan["skippedDuplicates"] = [];
  const seen = new Set<string>();
  let credits = 0;
  for (const adapter of adapters) {
    for (const query of adapter.buildQueries(pin)) {
      const key = adapter.searchKey(query);
      if (seen.has(key)) {
        skippedDuplicates.push({ sourceId: adapter.sourceId, query, key });
        continue;
      }
      const cost = adapter.creditsPerSearch;
      if (cost > 0 && opts.creditLimit !== undefined && credits + cost > opts.creditLimit) continue;
      seen.add(key);
      credits += cost;
      searches.push({ adapter, query, key });
    }
  }
  return { searches, skippedDuplicates, credits };
}
