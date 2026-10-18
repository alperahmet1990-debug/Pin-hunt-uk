/**
 * Search-query building and per-pin search planning for marketplace adapters
 * (SG-03, #406).
 *
 * - English sources reuse v1 `buildSearchQueries` unchanged.
 * - French sources lead with French phrasing ("pin's Disney …",
 *   "pin Disney …") and fall back to the v1 queries.
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

/** English queries: v1 `buildSearchQueries`, capped at `max`. */
export function buildEnglishQueries(pin: CataloguePin, max = 3): string[] {
  return buildSearchQueries(pin).slice(0, Math.max(0, max));
}

/** French queries: "pin's Disney <title> [LE n]", "pin Disney <title>", then v1. */
export function buildFrenchQueries(pin: CataloguePin, max = 3): string[] {
  const le = pin.limitedEditionSize ? `LE ${pin.limitedEditionSize}` : "";
  return dedupeQueries(
    [`pin's Disney ${pin.title} ${le}`, `pin Disney ${pin.title}`, ...buildSearchQueries(pin)],
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
