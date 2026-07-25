/**
 * eBay image dry-run — tests whether eBay Browse API listings can supply
 * temporary fallback images for catalogue pins that have no approved image.
 *
 * REPORT ONLY. This module never writes to pins.image_url / back_image_url,
 * never touches needs_*_image flags, and never modifies approved submissions.
 * Results are stored in ebay_image_dry_run_runs / ebay_image_dry_run_results.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabasePinRepository,
  type CataloguePin,
} from "@workspace/pin-repository";
import { searchListings, type EbayListing, type EbayMarketplace } from "./ebay";
import { buildSearchQueries } from "./valuation";
import { logger } from "../lib/logger";

export const DRY_RUN_MAX_PINS = 50;
export const BULK_INGEST_MAX_PINS = 500;

export interface DryRunOptions {
  /** Only pins from this release year. */
  releaseYear?: number;
  /** Auto-apply candidate images scoring at least this (skips pins with conflicting metadata). */
  autoApplyMinScore?: number;
}

const SEARCH_DELAY_MS = 300;
const MAX_RETRIES = 2;
const STRONG_UK_SCORE = 85; // below this, also try EBAY_US as a fallback

// ─── Types ────────────────────────────────────────────────────────────────────

export type DryRunClassification =
  | "high_confidence"
  | "provisional"
  | "review_required"
  | "no_match"
  | "error";

interface ScoredCandidate {
  listing: EbayListing;
  marketplace: EbayMarketplace;
  score: number;
  matchReasons: string[];
  warnings: string[];
}

// ─── Supabase ────────────────────────────────────────────────────────────────

let serviceClient: SupabaseClient | null = null;
function getServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  if (!serviceClient) serviceClient = createClient(url, key);
  return serviceClient;
}

// ─── Pin selection ────────────────────────────────────────────────────────────

interface SelectedPin {
  uuid: string;
  pinhuntId: string;
  title: string;
  brand: string | null;
}

/**
 * Pick up to `limit` varied pins that are missing a front image.
 * Round-robins across brands (with LE / mystery / set records prioritised
 * inside each brand bucket) so the test group isn't 50 near-identical pins.
 */
async function selectTestPins(limit: number, releaseYear?: number): Promise<SelectedPin[]> {
  const sb = getServiceClient();
  let q = sb
    .from("pins")
    .select("id, pinhunt_id, title, brand, collection, limited_edition_size, edition_type")
    // Select on the real image field — the needs_front_image flags are stale
    // (false across the catalogue even where image_url is null).
    .or("image_url.is.null,image_url.eq.")
    .eq("status", "active");
  if (releaseYear != null) q = q.eq("release_year", releaseYear);
  const { data, error } = await q.limit(3000);
  if (error) throw new Error(`Pin selection failed: ${error.message}`);

  type Row = {
    id: string; pinhunt_id: string; title: string; brand: string | null;
    collection: string | null; limited_edition_size: number | null; edition_type: string | null;
  };
  const rows = (data ?? []) as Row[];

  // Group by brand; inside each brand, interleave "interesting" record types
  // (LE, mystery, set) with ordinary open-edition pins for variety.
  const byBrand = new Map<string, Row[]>();
  for (const r of rows) {
    const key = (r.brand ?? "unknown").toLowerCase();
    const list = byBrand.get(key) ?? [];
    list.push(r);
    byBrand.set(key, list);
  }
  const isSpecial = (r: Row) =>
    r.limited_edition_size != null ||
    /mystery/i.test(`${r.title} ${r.collection ?? ""}`) ||
    /\bset\b/i.test(`${r.title} ${r.collection ?? ""}`);
  for (const list of byBrand.values()) {
    const special = list.filter(isSpecial);
    const normal = list.filter(r => !isSpecial(r));
    // Interleave: special, normal, special, normal…
    const mixed: Row[] = [];
    const n = Math.max(special.length, normal.length);
    for (let i = 0; i < n; i++) {
      if (special[i]) mixed.push(special[i]);
      if (normal[i]) mixed.push(normal[i]);
    }
    list.length = 0;
    list.push(...mixed);
  }

  // Round-robin across brands.
  const brandLists = [...byBrand.values()];
  const selected: SelectedPin[] = [];
  let idx = 0;
  while (selected.length < limit && brandLists.some(l => idx < l.length)) {
    for (const list of brandLists) {
      const r = list[idx];
      if (!r) continue;
      selected.push({ uuid: r.id, pinhuntId: r.pinhunt_id, title: r.title, brand: r.brand });
      if (selected.length >= limit) break;
    }
    idx++;
  }
  return selected;
}

// ─── Scoring (dry-run specific: needs reasons + image-fitness checks) ────────

const HARD_REJECT_TERMS = [
  "job lot", "bundle", "multiple pins", "choose", "selection", "random",
  "pin backs", "backing card only", "box only", "custom", "fantasy",
  "inspired", "scrapper", "fake", "replica", "you pick", "pick one",
];

const IMAGE_WARNING_TERMS: Array<[RegExp, string]> = [
  [/\bback only\b|\breverse only\b|\bback of pin\b/, "listing appears to show the back of the pin"],
  [/\bsealed\b|\bunopened\b|\bin box\b|\bboxed\b/, "image may be packaging-dominated"],
  [/\bblurry\b|\bpoor photo\b/, "seller flags a poor photo"],
];

function tokenise(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

/**
 * Score a listing 0–100 for image-match purposes, with human-readable reasons.
 * Returns null (with reasons) when the listing must be rejected outright.
 */
export function scoreListingForImage(
  pin: CataloguePin,
  listing: EbayListing,
): { score: number | null; matchReasons: string[]; rejectionReasons: string[]; warnings: string[] } {
  const title = listing.title.toLowerCase();
  const matchReasons: string[] = [];
  const rejectionReasons: string[] = [];
  const warnings: string[] = [];

  const recordText = `${pin.title} ${pin.collection ?? ""}`;
  const isSetRecord = /\bset\b/i.test(recordText);
  const isMysteryRecord = /mystery/i.test(recordText);

  if (!listing.imageUrl) rejectionReasons.push("listing has no image");
  for (const term of HARD_REJECT_TERMS) {
    if (title.includes(term)) rejectionReasons.push(`title contains "${term}"`);
  }
  if (/\blot\b/.test(title)) rejectionReasons.push('title contains standalone "lot"');
  if (!isSetRecord && /\bset\b/.test(title) && !/\bset of 1\b/.test(title)) {
    rejectionReasons.push('title contains "set" but the record is a single pin');
  }
  if (!isMysteryRecord && /\bmystery\b/.test(title)) {
    rejectionReasons.push('title contains "mystery" but the record is not a mystery pin');
  }
  if (!/\bpins?\b|\bbadge\b/.test(title)) {
    rejectionReasons.push("listing does not appear to be a pin/badge");
  }
  if (rejectionReasons.length > 0) return { score: null, matchReasons, rejectionReasons, warnings };

  if (isSetRecord && /\bset\b/.test(title)) matchReasons.push("set listing matches set record");
  if (isMysteryRecord && /\bmystery\b/.test(title)) matchReasons.push("mystery listing matches mystery record");

  let score = 0;
  const titleTokens = new Set(tokenise(listing.title));

  // Pin name overlap — up to 45 points.
  const nameTokens = tokenise(pin.title);
  const nameHits = nameTokens.filter(t => titleTokens.has(t)).length;
  if (nameTokens.length > 0) {
    const ratio = nameHits / nameTokens.length;
    score += ratio * 45;
    if (ratio >= 0.99) matchReasons.push("exact pin-name match");
    else if (ratio >= 0.6) matchReasons.push(`strong title similarity (${nameHits}/${nameTokens.length} name words)`);
    else if (ratio > 0) matchReasons.push(`partial title similarity (${nameHits}/${nameTokens.length} name words)`);
  }

  // Product code / SKU / FAC — up to 25 (very high precision signal).
  const codes = Object.values(pin.externalIdentifiers ?? {}).filter(Boolean) as string[];
  const codeHit = codes.find(code => code.length >= 4 && title.includes(code.toLowerCase()));
  if (codeHit) { score += 25; matchReasons.push("exact product-code / SKU match"); }

  // Series/edition discriminators — up to 24 (crucial for generic pin names).
  const GENERIC_TOKENS = new Set([
    "disney", "pin", "pins", "the", "and", "wave", "series", "edition",
    "open", "limited", "collection", "wdw", "dlr", "parks",
  ]);
  const discTokens = [
    ...tokenise(pin.collection ?? ""),
    ...tokenise(pin.edition ?? ""),
  ].filter(t => !GENERIC_TOKENS.has(t));
  const discHits = discTokens.filter(t => titleTokens.has(t)).length;
  if (discHits > 0) {
    score += Math.min(discHits, 3) * 8;
    matchReasons.push(`series/edition word match (${discHits})`);
  } else if (nameTokens.length <= 3 && discTokens.length >= 2) {
    // Generic pin name with no series words in the listing — too risky.
    return {
      score: null,
      matchReasons,
      rejectionReasons: ["generic pin name matches, but no series/edition words found in listing"],
      warnings,
    };
  }

  // Character — 12.
  for (const c of pin.characters) {
    if (c && title.includes(c.toLowerCase())) { score += 12; matchReasons.push(`character match (${c})`); break; }
  }
  // Collection/series — 8.
  if (pin.collection && title.includes(pin.collection.toLowerCase())) {
    score += 8; matchReasons.push("collection/series match");
  }
  // Manufacturer/brand — 8.
  const maker = pin.manufacturer ?? pin.brand;
  if (maker && maker.toLowerCase() !== "disney" && title.includes(maker.toLowerCase())) {
    score += 8; matchReasons.push(`manufacturer match (${maker})`);
  }
  // Edition size — 12; conflicting LE size is disqualifying for auto-assign.
  const leMatch = title.match(/\ble\s*(\d{2,6})\b/);
  if (pin.limitedEditionSize) {
    if (leMatch && Number(leMatch[1]) === pin.limitedEditionSize) {
      score += 12; matchReasons.push(`edition size match (LE ${pin.limitedEditionSize})`);
    } else if (leMatch) {
      warnings.push(`conflicting edition size (listing LE ${leMatch[1]}, record LE ${pin.limitedEditionSize})`);
      score -= 25;
    }
  } else if (leMatch) {
    warnings.push(`listing is LE ${leMatch[1]} but record is not limited edition`);
    score -= 10;
  }
  // Release year — 5.
  if (pin.releaseYear && title.includes(String(pin.releaseYear))) {
    score += 5; matchReasons.push(`release year match (${pin.releaseYear})`);
  }

  // Image-fitness warnings (title-based heuristics; no heavy CV for this test).
  for (const [re, why] of IMAGE_WARNING_TERMS) {
    if (re.test(title)) { warnings.push(why); score -= 15; }
  }
  if (!isSetRecord && /\d+\s*pins\b/.test(title)) {
    warnings.push("photo may contain multiple pins");
    score -= 15;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, matchReasons, rejectionReasons, warnings };
}

export function classify(score: number | null): DryRunClassification {
  if (score == null) return "no_match";
  if (score >= 90) return "high_confidence";
  if (score >= 85) return "provisional";
  if (score >= 70) return "review_required";
  return "no_match";
}

// ─── eBay search with retries ────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function searchWithRetry(
  marketplace: EbayMarketplace,
  query: string,
): Promise<EbayListing[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await searchListings(marketplace, query, 25);
    } catch (e) {
      lastErr = e;
      // Back off harder on rate-limit-ish failures.
      await sleep(SEARCH_DELAY_MS * (attempt + 2));
    }
  }
  throw lastErr;
}

async function bestCandidateInMarketplace(
  pin: CataloguePin,
  marketplace: EbayMarketplace,
  queries: string[],
  rejectionLog: string[],
  exclude?: Set<string>,
): Promise<ScoredCandidate | null> {
  const byItemId = new Map<string, EbayListing>();
  for (const q of queries) {
    const results = await searchWithRetry(marketplace, q);
    for (const l of results) if (!byItemId.has(l.itemId)) byItemId.set(l.itemId, l);
    await sleep(SEARCH_DELAY_MS);
  }

  let best: ScoredCandidate | null = null;
  for (const listing of byItemId.values()) {
    if (exclude?.has(listing.itemId)) continue;
    const { score, matchReasons, rejectionReasons, warnings } = scoreListingForImage(pin, listing);
    if (score == null) {
      if (rejectionLog.length < 12 && rejectionReasons.length > 0) {
        rejectionLog.push(`${marketplace} "${listing.title.slice(0, 60)}": ${rejectionReasons.join("; ")}`);
      }
      continue;
    }
    if (!best || score > best.score) best = { listing, marketplace, score, matchReasons, warnings };
  }
  return best;
}

// ─── Run orchestration ────────────────────────────────────────────────────────

async function loadFullPin(pinhuntId: string): Promise<CataloguePin | null> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabasePinRepository(url, key).getPinById(pinhuntId);
}

let runningRunId: string | null = null;

export function isDryRunActive(): boolean {
  return runningRunId !== null;
}

/** Start a dry run in the background. Returns the run id immediately. */
export async function startImageDryRun(limit: number, opts: DryRunOptions = {}): Promise<string> {
  const maxPins = opts.autoApplyMinScore != null || opts.releaseYear != null ? BULK_INGEST_MAX_PINS : DRY_RUN_MAX_PINS;
  if (limit > maxPins) throw Object.assign(new Error(`limit must be ${maxPins} or lower`), { status: 400 });
  if (runningRunId) throw Object.assign(new Error("A dry run is already in progress"), { status: 409 });

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("ebay_image_dry_run_runs")
    .insert({ status: "running" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not create run: ${error?.message}`);
  const runId = data.id as string;
  runningRunId = runId;

  const job = processDryRun(runId, limit, opts);
  job
    .catch(async e => {
      logger.error({ runId, err: String(e) }, "image dry run failed");
      await sb.from("ebay_image_dry_run_runs")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", runId);
    })
    .finally(() => { runningRunId = null; });

  return runId;
}

async function processDryRun(runId: string, limit: number, opts: DryRunOptions = {}): Promise<void> {
  const sb = getServiceClient();
  const pins = await selectTestPins(limit, opts.releaseYear);
  logger.info({ runId, count: pins.length, opts }, "image dry run started");

  const counts = { high_confidence: 0, provisional: 0, review_required: 0, no_match: 0, error: 0, applied: 0 };

  for (const sel of pins) {
    const rejectionLog: string[] = [];
    let row: Record<string, unknown>;
    try {
      const pin = await loadFullPin(sel.pinhuntId);
      if (!pin) throw new Error("pin not found via repository");
      const queries = buildSearchQueries(pin);

      // UK first; US only as a fallback when there's no strong UK match.
      const gb = await bestCandidateInMarketplace(pin, "EBAY_GB", queries, rejectionLog);
      let best = gb;
      if (!gb || gb.score < STRONG_UK_SCORE) {
        const us = await bestCandidateInMarketplace(pin, "EBAY_US", queries, rejectionLog);
        if (us && (!best || us.score > best.score)) best = us;
      }

      const classification = classify(best?.score ?? null);
      counts[classification]++;
      const wouldAssign =
        (classification === "high_confidence" || classification === "provisional") &&
        (best?.warnings.length ?? 0) === 0;
      // Conflicting metadata must prevent automatic assignment.
      const conflict = best?.warnings.some(w => w.startsWith("conflicting")) ?? false;

      row = {
        run_id: runId,
        pin_id: sel.uuid,
        pinhunt_id: sel.pinhuntId,
        pin_name: pin.title,
        pin_metadata: {
          brand: pin.brand,
          collection: pin.collection,
          characters: pin.characters,
          limitedEditionSize: pin.limitedEditionSize ?? null,
          releaseYear: pin.releaseYear ?? null,
          manufacturer: pin.manufacturer ?? null,
          externalIdentifiers: pin.externalIdentifiers ?? {},
        },
        queries_used: queries,
        best_ebay_item_id: best?.listing.itemId ?? null,
        marketplace: best?.marketplace ?? null,
        listing_title: best?.listing.title ?? null,
        listing_url: best?.listing.itemUrl ?? null,
        image_url: best?.listing.imageUrl ?? null,
        additional_image_urls: [],
        match_score: best?.score ?? null,
        confidence_classification: classification,
        match_reasons: best?.matchReasons ?? [],
        rejection_reasons: [...(best?.warnings ?? []), ...rejectionLog],
        would_assign: wouldAssign && !conflict,
      };
    } catch (e) {
      counts.error++;
      logger.warn({ runId, pin: sel.pinhuntId, err: String(e) }, "dry run pin failed");
      row = {
        run_id: runId,
        pin_id: sel.uuid,
        pinhunt_id: sel.pinhuntId,
        pin_name: sel.title,
        pin_metadata: { brand: sel.brand },
        queries_used: [],
        confidence_classification: "error",
        match_reasons: [],
        rejection_reasons: [String(e instanceof Error ? e.message : e)],
        would_assign: false,
      };
    }

    const { data: inserted, error: insErr } = await sb
      .from("ebay_image_dry_run_results")
      .insert(row)
      .select("id")
      .single();
    if (insErr) logger.warn({ runId, err: insErr.message }, "dry run result insert failed");

    // Bulk ingest: auto-apply strong candidates straight to the pin.
    if (
      opts.autoApplyMinScore != null &&
      inserted &&
      typeof row.match_score === "number" &&
      row.match_score >= opts.autoApplyMinScore &&
      row.image_url &&
      // Conflicting metadata (e.g. wrong LE size) must never auto-apply.
      !(row.rejection_reasons as string[]).some(r => r.startsWith("conflicting"))
    ) {
      try {
        await applyCandidateImage(sb, {
          resultId: inserted.id as string,
          pinId: row.pin_id as string,
          pinhuntId: row.pinhunt_id as string,
          imageUrl: row.image_url as string,
          listingUrl: (row.listing_url as string | null) ?? null,
        });
        counts.applied++;
      } catch (e) {
        // Pin already has an image or another writer beat us — fine, skip.
        logger.info({ runId, pin: sel.pinhuntId, err: String(e) }, "auto-apply skipped");
      }
    }

    // Keep the summary fresh so progress is visible while the run is going.
    await sb.from("ebay_image_dry_run_runs").update({
      pins_examined: counts.high_confidence + counts.provisional + counts.review_required + counts.no_match + counts.error,
      high_confidence_count: counts.high_confidence,
      provisional_count: counts.provisional,
      review_required_count: counts.review_required,
      no_match_count: counts.no_match,
      error_count: counts.error,
    }).eq("id", runId);
  }

  await sb.from("ebay_image_dry_run_runs").update({
    status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", runId);
  logger.info({ runId, counts }, "image dry run completed");
}

// ─── Admin retry: re-search eBay for a different candidate image ────────────

/**
 * Re-run the eBay image search for one result, excluding every listing the
 * admin has already rejected (and the current one). Updates the result row
 * in place with the next-best candidate, or no_match if nothing else scores.
 */
export async function retryDryRunResult(resultId: string): Promise<Record<string, unknown>> {
  const sb = getServiceClient();
  const { data: result, error } = await sb
    .from("ebay_image_dry_run_results")
    .select("id, pinhunt_id, best_ebay_item_id, excluded_item_ids, applied_at")
    .eq("id", resultId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!result) throw Object.assign(new Error("Result not found"), { status: 404 });
  if (result.applied_at) throw Object.assign(new Error("Image already applied — nothing to retry"), { status: 409 });

  const excluded = new Set<string>((result.excluded_item_ids as string[]) ?? []);
  if (result.best_ebay_item_id) excluded.add(result.best_ebay_item_id as string);

  const pin = await loadFullPin(result.pinhunt_id as string);
  if (!pin) throw Object.assign(new Error("Pin not found"), { status: 404 });

  const queries = buildSearchQueries(pin);
  const rejectionLog: string[] = [];
  const gb = await bestCandidateInMarketplace(pin, "EBAY_GB", queries, rejectionLog, excluded);
  let best = gb;
  if (!gb || gb.score < STRONG_UK_SCORE) {
    const us = await bestCandidateInMarketplace(pin, "EBAY_US", queries, rejectionLog, excluded);
    if (us && (!best || us.score > best.score)) best = us;
  }

  const classification = classify(best?.score ?? null);
  const conflict = best?.warnings.some(w => w.startsWith("conflicting")) ?? false;
  const wouldAssign =
    (classification === "high_confidence" || classification === "provisional") &&
    (best?.warnings.length ?? 0) === 0 && !conflict;

  const patch = {
    best_ebay_item_id: best?.listing.itemId ?? null,
    marketplace: best?.marketplace ?? null,
    listing_title: best?.listing.title ?? null,
    listing_url: best?.listing.itemUrl ?? null,
    image_url: best?.listing.imageUrl ?? null,
    match_score: best?.score ?? null,
    confidence_classification: classification,
    match_reasons: best?.matchReasons ?? [],
    rejection_reasons: [...(best?.warnings ?? []), ...rejectionLog],
    would_assign: wouldAssign,
    excluded_item_ids: [...excluded],
  };
  const { error: updErr } = await sb
    .from("ebay_image_dry_run_results")
    .update(patch)
    .eq("id", resultId);
  if (updErr) throw new Error(updErr.message);

  logger.info({ resultId, pin: result.pinhunt_id, found: !!best }, "dry-run retry completed");
  return { id: resultId, ...patch };
}

// ─── Admin apply: write an approved candidate image to the live pin ─────────

/**
 * Apply a dry-run candidate image to the live pin. Admin-confirmed only.
 * Refuses when the pin already has an image (never overwrites), and records
 * provenance in pin_images plus applied_at on the result row.
 */
export async function applyDryRunImage(resultId: string): Promise<{ pinhuntId: string; imageUrl: string }> {
  const sb = getServiceClient();
  const { data: result, error } = await sb
    .from("ebay_image_dry_run_results")
    .select("id, pin_id, pinhunt_id, image_url, listing_url, applied_at")
    .eq("id", resultId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!result) throw Object.assign(new Error("Result not found"), { status: 404 });
  if (!result.image_url) throw Object.assign(new Error("This result has no candidate image"), { status: 400 });
  if (result.applied_at) throw Object.assign(new Error("Image already applied"), { status: 409 });

  await applyCandidateImage(sb, {
    resultId,
    pinId: result.pin_id as string,
    pinhuntId: result.pinhunt_id as string,
    imageUrl: result.image_url as string,
    listingUrl: (result.listing_url as string | null) ?? null,
  });
  return { pinhuntId: result.pinhunt_id as string, imageUrl: result.image_url as string };
}

/**
 * Shared apply path: write the candidate image (hi-res) to the live pin,
 * record provenance, and stamp applied_at. Throws 409 if the pin already
 * has an image (conditional update must hit exactly one row).
 */
async function applyCandidateImage(
  sb: ReturnType<typeof getServiceClient>,
  args: { resultId: string; pinId: string; pinhuntId: string; imageUrl: string; listingUrl: string | null },
): Promise<void> {
  // eBay serves the same image at multiple sizes; request the 1600px version.
  const hiResUrl = args.imageUrl.replace(/\/s-l\d+(\.\w+)$/, "/s-l1600$1");

  const { data: updatedRows, error: updErr } = await sb
    .from("pins")
    .update({ image_url: hiResUrl, needs_front_image: false })
    .eq("id", args.pinId)
    .is("image_url", null)
    .select("id");
  if (updErr) throw new Error(`Applying image failed: ${updErr.message}`);
  // Conditional update must have hit exactly one row — otherwise another
  // writer set an image between our check and the update.
  if (!updatedRows || updatedRows.length !== 1) {
    throw Object.assign(new Error("Pin already has an image — not overwriting"), { status: 409 });
  }

  // Provenance record so temporary eBay images are identifiable later.
  await sb.from("pin_images").insert({
    pin_id: args.pinId,
    image_url: args.imageUrl,
    image_type: "front",
    is_primary: true,
    description: `Temporary fallback image from eBay listing: ${args.listingUrl ?? "unknown"}`,
  });

  await sb
    .from("ebay_image_dry_run_results")
    .update({ applied_at: new Date().toISOString() })
    .eq("id", args.resultId);

  logger.info({ resultId: args.resultId, pin: args.pinhuntId }, "dry-run image applied to live pin");
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getDryRunSummary(runId: string) {
  const sb = getServiceClient();
  const { data, error } = await sb.from("ebay_image_dry_run_runs").select("*").eq("id", runId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listDryRuns() {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("ebay_image_dry_run_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDryRunResults(runId: string) {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("ebay_image_dry_run_results")
    .select("*")
    .eq("run_id", runId)
    .order("match_score", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
