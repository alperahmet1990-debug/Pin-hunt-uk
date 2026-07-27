/**
 * Catalogue validation — checks imported pin records against live eBay
 * Browse API listings and stores SUGGESTIONS ONLY in pin_ebay_validations.
 *
 * Nothing in this module modifies the pins table. Approved changes go
 * through applyValidationDecision(), which writes an audit row for every
 * changed field. Active-listing evidence is never presented as sold prices.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabasePinRepository,
  type CataloguePin,
} from "@workspace/pin-repository";
import { searchListings, type EbayListing, type EbayMarketplace } from "./ebay";
import { logger } from "../lib/logger";

export const VALIDATION_DEFAULT_LIMIT = 50;
export const VALIDATION_MAX_LIMIT = 500;

const SEARCH_DELAY_MS = 300;
const MAX_RETRIES = 2;
const QUERY_CACHE_TTL_MS = 15 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type ValidationStatus =
  | "strong_match"
  | "probable_match"
  | "needs_review"
  | "no_match"
  | "insufficient_data"
  | "error";

export interface ValidationFlag {
  code: string;
  message: string;
}

interface CandidateScore {
  listing: EbayListing;
  marketplace: EbayMarketplace;
  score: number;
  reasons: string[];
  penalties: string[];
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

function loadFullPin(pinhuntId: string): Promise<CataloguePin | null> {
  return createSupabasePinRepository(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ).getPinById(pinhuntId);
}

// ─── Text helpers ────────────────────────────────────────────────────────────

function tokenise(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

const GENERIC_TOKENS = new Set([
  "disney", "pin", "pins", "the", "and", "wave", "series", "edition",
  "open", "limited", "collection", "wdw", "dlr", "parks", "release",
]);

/** 0–1 similarity between record title and listing title (token overlap). */
function nameSimilarity(recordTitle: string, listingTitle: string): number {
  const nameTokens = tokenise(recordTitle);
  if (nameTokens.length === 0) return 0;
  const titleTokens = new Set(tokenise(listingTitle));
  const hits = nameTokens.filter(t => titleTokens.has(t)).length;
  return hits / nameTokens.length;
}

// ─── Vague-record guard ──────────────────────────────────────────────────────

/** Records like "Mickey pin" / "Stitch 2025" can't be validated reliably. */
export function isTooVague(pin: CataloguePin): boolean {
  const meaningful = tokenise(pin.title).filter(t => !GENERIC_TOKENS.has(t));
  const hasDiscriminators =
    (pin.collection && tokenise(pin.collection).some(t => !GENERIC_TOKENS.has(t))) ||
    pin.limitedEditionSize != null ||
    Object.values(pin.externalIdentifiers ?? {}).some(Boolean);
  return meaningful.length <= 1 && !hasDiscriminators;
}

// ─── Query generation ────────────────────────────────────────────────────────

export function buildValidationQueries(pin: CataloguePin): string[] {
  const character = pin.characters[0];
  const productCode =
    pin.externalIdentifiers?.sku ??
    pin.externalIdentifiers?.disneySku ??
    pin.externalIdentifiers?.fac;
  const candidates: string[] = [];

  // 1. Exact pin name.
  candidates.push(`${pin.title} Disney pin`);
  // 2. SKU / product code — highest precision.
  if (productCode) candidates.push(`Disney pin ${productCode}`);
  // 3. Character + collection + year.
  const q3 = [character, pin.collection !== pin.title ? pin.collection : undefined,
    "Disney pin", pin.releaseYear ? String(pin.releaseYear) : undefined]
    .filter(Boolean).join(" ");
  if (q3.replace("Disney pin", "").trim()) candidates.push(q3);
  // 4. Character + edition size.
  if (character && pin.limitedEditionSize) {
    candidates.push(`${character} Disney pin LE ${pin.limitedEditionSize}`);
  }
  // 5. Shortened title (drop generic words) + brand.
  const shortTitle = tokenise(pin.title).filter(t => !GENERIC_TOKENS.has(t)).slice(0, 5).join(" ");
  if (shortTitle && pin.brand && pin.brand !== "Disney") {
    candidates.push(`${pin.brand} ${shortTitle} pin`);
  }

  const seen = new Set<string>();
  const queries: string[] = [];
  for (const q of candidates) {
    const norm = q.toLowerCase().replace(/\s+/g, " ").trim();
    if (!norm || norm.length > 90 || seen.has(norm)) continue;
    seen.add(norm);
    queries.push(q.replace(/\s+/g, " ").trim());
    if (queries.length === 4) break;
  }
  return queries;
}

// ─── Exclusions & scoring (spec weights) ─────────────────────────────────────

const NON_PIN_TERMS = [
  "keyring", "keychain", "magnet", "sticker", "poster", "brooch", "button badge",
  "digital", "empty box", "box only", "backing card only", "replacement card",
  "card only", "lanyard", "plush", "t-shirt", "tshirt", "mug", "tumbler", "funko",
];
const LOT_TERMS = ["job lot", "bundle", "pin lot", "you pick", "pick one", "choose", "random", "selection"];
const FAKE_TERMS = ["fantasy", "custom", "fan made", "fan-made", "inspired", "scrapper", "replica", "unofficial"];
const AUTHENTICITY_TERMS = ["fake", "counterfeit", "not authentic", "authenticity unknown", "possible scrapper"];

const KNOWN_CHARACTERS = [
  "mickey", "minnie", "donald", "daisy", "goofy", "pluto", "stitch", "angel",
  "ariel", "belle", "cinderella", "aurora", "jasmine", "mulan", "tiana", "moana",
  "rapunzel", "snow white", "elsa", "anna", "pocahontas", "merida", "tinker bell",
  "maleficent", "ursula", "cruella", "hades", "jack skellington", "sally", "zero",
  "simba", "nala", "scar", "dumbo", "bambi", "thumper", "figment", "cheshire",
  "alice", "pooh", "tigger", "eeyore", "piglet", "buzz", "woody", "jessie",
  "remy", "wall-e", "eve", "nemo", "dory", "sulley", "mike wazowski", "baymax",
  "olaf", "kristoff", "genie", "aladdin", "abu", "grogu", "chip", "dale",
  "marie", "oswald", "duffy", "shellie may", "gelatoni", "orange bird",
];

interface EvidenceExtraction {
  leSize: number | null;
  year: number | null;
  characters: string[];
  isAuthenticityFlagged: boolean;
}

function extractEvidence(title: string): EvidenceExtraction {
  const t = title.toLowerCase();
  const le = t.match(/\ble\s*[- ]?(\d{2,6})\b/);
  const yr = t.match(/\b(19[89]\d|20[0-3]\d)\b/);
  return {
    leSize: le ? Number(le[1]) : null,
    year: yr ? Number(yr[1]) : null,
    characters: KNOWN_CHARACTERS.filter(c => t.includes(c)),
    isAuthenticityFlagged: AUTHENTICITY_TERMS.some(term => t.includes(term)),
  };
}

/**
 * Score one listing against the record, 0–100, following the agreed
 * weighting. Returns null when the listing is not usable evidence at all
 * (non-pin product, empty box, etc.).
 */
export function scoreCandidate(
  pin: CataloguePin,
  listing: EbayListing,
  marketplace: EbayMarketplace,
): CandidateScore | null {
  const title = listing.title.toLowerCase();
  const reasons: string[] = [];
  const penalties: string[] = [];

  // Unusable product types — not evidence either way.
  for (const term of NON_PIN_TERMS) {
    if (title.includes(term)) return null;
  }
  if (!/\bpins?\b|\bbadge\b/.test(title)) return null;

  let score = 0;

  // Pin-name similarity — up to 25.
  const sim = nameSimilarity(pin.title, listing.title);
  score += sim * 25;
  if (sim >= 0.99) reasons.push("exact pin-name match");
  else if (sim >= 0.6) reasons.push("strong pin-name similarity");
  else if (sim >= 0.3) reasons.push("partial pin-name similarity");

  const evidence = extractEvidence(listing.title);

  // Character — up to 20; wrong character −35.
  const recordChars = pin.characters.map(c => c.toLowerCase()).filter(Boolean);
  const charHit = recordChars.find(c => title.includes(c));
  if (charHit) { score += 20; reasons.push(`character match (${charHit})`); }
  else if (recordChars.length > 0 && evidence.characters.length > 0 &&
           !evidence.characters.some(ec => recordChars.some(rc => rc.includes(ec) || ec.includes(rc)))) {
    score -= 35; penalties.push(`listing names a different character (${evidence.characters[0]})`);
  }

  // Collection / series — up to 15.
  const discTokens = tokenise(pin.collection ?? "").filter(t => !GENERIC_TOKENS.has(t));
  const titleTokens = new Set(tokenise(listing.title));
  const discHits = discTokens.filter(t => titleTokens.has(t)).length;
  if (discTokens.length > 0 && discHits > 0) {
    score += Math.min(15, (discHits / discTokens.length) * 15);
    reasons.push("collection/series words match");
  }

  // Edition size — up to 15; conflict −25.
  if (pin.limitedEditionSize && evidence.leSize != null) {
    if (evidence.leSize === pin.limitedEditionSize) {
      score += 15; reasons.push(`edition size match (LE ${evidence.leSize})`);
    } else {
      score -= 25; penalties.push(`conflicting edition size (listing LE ${evidence.leSize}, record LE ${pin.limitedEditionSize})`);
    }
  } else if (!pin.limitedEditionSize && evidence.leSize != null) {
    penalties.push(`listing is LE ${evidence.leSize} but record has no edition size`);
    score -= 5;
  }

  // Year — up to 10; conflict −15.
  if (pin.releaseYear && evidence.year != null) {
    if (evidence.year === pin.releaseYear) { score += 10; reasons.push(`year match (${evidence.year})`); }
    else { score -= 15; penalties.push(`conflicting year (listing ${evidence.year}, record ${pin.releaseYear})`); }
  }

  // Release location — up to 5 (origin words like DLP, WDW, Disney Store).
  const origin = (pin.origin ?? "").toLowerCase();
  if (origin) {
    const originHit =
      title.includes(origin) ||
      (origin.includes("paris") && /\bdlp\b|paris/.test(title)) ||
      (origin.includes("store") && /disney store|shopdisney/.test(title));
    if (originHit) { score += 5; reasons.push("release-location match"); }
  }

  // Manufacturer — up to 5.
  const maker = (pin.manufacturer ?? pin.brand ?? "").toLowerCase();
  if (maker && maker !== "disney" && title.includes(maker)) {
    score += 5; reasons.push(`manufacturer match (${maker})`);
  }

  // SKU / product code — treated as a strong bonus (spec: exact-ID match can
  // stand alone for a strong match).
  const codes = Object.values(pin.externalIdentifiers ?? {}).filter(Boolean) as string[];
  if (codes.some(code => code.length >= 4 && title.includes(code.toLowerCase()))) {
    score += 25; reasons.push("exact product-code / SKU match");
  }

  // Penalties: lots/bundles, fantasy/custom, wrong product handled above.
  if (LOT_TERMS.some(t => title.includes(t)) || /\blot\b/.test(title)) {
    score -= 25; penalties.push("appears to be a pin lot or bundle");
  }
  if (FAKE_TERMS.some(t => title.includes(t))) {
    score -= 40; penalties.push("appears to be fantasy/custom/unofficial");
  }
  const isSetRecord = /\bset\b/i.test(`${pin.title} ${pin.collection ?? ""}`);
  if (!isSetRecord && /\bset\b/.test(title) && !/\bset of 1\b/.test(title)) {
    score -= 25; penalties.push("listing sells a set but the record is a single pin");
  }
  // Authenticity concerns lower confidence but never reject outright.
  if (evidence.isAuthenticityFlagged) {
    score -= 10; penalties.push("seller mentions authenticity concerns — review manually");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { listing, marketplace, score, reasons, penalties };
}

export function classifyScore(score: number | null): ValidationStatus {
  if (score == null) return "no_match";
  if (score >= 85) return "strong_match";
  if (score >= 70) return "probable_match";
  if (score >= 50) return "needs_review";
  return "no_match";
}

// ─── eBay search with cache, retries, call tracking ─────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const queryCache = new Map<string, { at: number; results: EbayListing[] }>();

async function cachedSearch(
  marketplace: EbayMarketplace,
  query: string,
  stats: { apiCalls: number; apiErrors: number },
): Promise<EbayListing[]> {
  const key = `${marketplace}::${query.toLowerCase()}`;
  const hit = queryCache.get(key);
  if (hit && Date.now() - hit.at < QUERY_CACHE_TTL_MS) return hit.results;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      stats.apiCalls++;
      const results = await searchListings(marketplace, query, 25);
      queryCache.set(key, { at: Date.now(), results });
      return results;
    } catch (e) {
      lastErr = e;
      stats.apiErrors++;
      await sleep(SEARCH_DELAY_MS * 2 ** (attempt + 1)); // exponential backoff
    }
  }
  throw lastErr;
}

// ─── Suggestions & flags from candidate agreement ────────────────────────────

interface Analysis {
  status: ValidationStatus;
  confidence: number | null;
  matchCount: number;
  best: CandidateScore | null;
  top3: CandidateScore[];
  flags: ValidationFlag[];
  suggestions: {
    year: number | null;
    editionSize: number | null;
    editionType: string | null;
  };
  notes: string;
}

function analyseCandidates(pin: CataloguePin, scored: CandidateScore[]): Analysis {
  const flags: ValidationFlag[] = [];
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const best = top3[0] ?? null;

  // Independent listings agreeing with the record (≥70 score) — up to +5.
  const agreeing = sorted.filter(c => c.score >= 70);
  let confidence = best ? best.score : null;
  if (confidence != null && agreeing.length >= 2) confidence = Math.min(100, confidence + 5);

  // A strong match needs ≥2 independent listings unless there is an exact
  // SKU/product-code hit.
  const hasSkuHit = best?.reasons.some(r => r.includes("product-code")) ?? false;
  let status = classifyScore(confidence);
  if (status === "strong_match" && agreeing.length < 2 && !hasSkuHit) {
    status = "probable_match";
    flags.push({ code: "single_listing", message: "Only one listing supports this match — downgraded from strong to probable." });
  }

  // Cross-listing agreement on evidence values (from candidates scoring ≥ 50,
  // i.e. plausibly the same pin).
  const evidencePool = sorted.filter(c => c.score >= 50).map(c => extractEvidence(c.listing.title));
  const countBy = <T,>(vals: (T | null)[]) => {
    const m = new Map<T, number>();
    for (const v of vals) if (v != null) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const suggestions: Analysis["suggestions"] = { year: null, editionSize: null, editionType: null };

  const [topLe] = countBy(evidencePool.map(e => e.leSize));
  if (topLe && topLe[1] >= 2) {
    const [leSize, votes] = topLe;
    if (pin.limitedEditionSize == null) {
      suggestions.editionSize = leSize;
      suggestions.editionType = "LE";
      flags.push({ code: "missing_edition_size", message: `Record has no edition size, but ${votes} eBay listings suggest LE ${leSize}. eBay evidence suggests this may be a limited edition.` });
    } else if (leSize !== pin.limitedEditionSize) {
      suggestions.editionSize = leSize;
      flags.push({ code: "edition_size_conflict", message: `Existing record says LE ${pin.limitedEditionSize}, but ${votes} matching eBay listings consistently describe the pin as LE ${leSize}. eBay evidence suggests the recorded edition size may be wrong.` });
    }
  }

  const [topYear] = countBy(evidencePool.map(e => e.year));
  if (topYear && topYear[1] >= 2 && pin.releaseYear && topYear[0] !== pin.releaseYear) {
    suggestions.year = topYear[0];
    flags.push({ code: "year_conflict", message: `Existing record says ${pin.releaseYear}, but ${topYear[1]} matching eBay listings mention ${topYear[0]}. eBay evidence suggests the recorded year may be wrong.` });
  }

  // Character sanity: candidates agree on a character the record lacks.
  const recordChars = pin.characters.map(c => c.toLowerCase());
  const charVotes = countBy(evidencePool.flatMap(e => e.characters.length ? [e.characters[0]] : []));
  if (charVotes[0] && charVotes[0][1] >= 2 &&
      recordChars.length > 0 &&
      !recordChars.some(rc => rc.includes(charVotes[0][0]) || charVotes[0][0].includes(rc))) {
    flags.push({ code: "character_mismatch", message: `Record lists ${pin.characters.join(", ")}, but matching listings consistently mention ${charVotes[0][0]}. eBay evidence suggests the character may be recorded incorrectly.` });
  }

  // Set-vs-single suspicion.
  const setHits = sorted.filter(c => c.score >= 50 && /\bset\b/.test(c.listing.title.toLowerCase())).length;
  const isSetRecord = /\bset\b/i.test(`${pin.title} ${pin.collection ?? ""}`);
  if (!isSetRecord && setHits >= 2) {
    flags.push({ code: "maybe_set", message: "Several matching listings describe a set — this record may describe a set rather than an individual pin." });
  }

  // No-evidence handling.
  if (!best || best.score < 50) {
    flags.push({ code: "no_reliable_evidence", message: "No reliable eBay evidence found. This does not prove the pin is wrong — it may simply not be listed right now." });
  }
  if (best?.penalties.some(p => p.includes("authenticity"))) {
    flags.push({ code: "authenticity_concern", message: "Best listing mentions authenticity concerns — treat its details with caution." });
  }

  const notes = best
    ? `Best of ${sorted.length} usable listings scored ${best.score}/100 (${agreeing.length} listing(s) at 70+). Evidence is from current eBay asking prices, not sold prices.`
    : "No usable eBay listings found for this record.";

  return { status, confidence, matchCount: agreeing.length, best, top3, flags, suggestions, notes };
}

// ─── Duplicate detection (catalogue-side) ────────────────────────────────────

async function findSuspectedDuplicate(
  sb: SupabaseClient,
  pin: CataloguePin,
  pinUuid: string,
): Promise<{ id: string; pinhunt_id: string; title: string } | null> {
  // Cheap candidate pool: same character-ish title words or same collection.
  const keyTokens = tokenise(pin.title).filter(t => !GENERIC_TOKENS.has(t)).slice(0, 3);
  if (keyTokens.length === 0) return null;
  const { data } = await sb
    .from("pins")
    .select("id, pinhunt_id, title, collection, release_year, limited_edition_size")
    .neq("id", pinUuid)
    .eq("status", "active")
    .ilike("title", `%${keyTokens[0]}%`)
    .limit(200);
  for (const row of data ?? []) {
    const sim = nameSimilarity(pin.title, row.title as string);
    const sameYear = pin.releaseYear == null || row.release_year == null || row.release_year === pin.releaseYear;
    const sameLe = pin.limitedEditionSize == null || row.limited_edition_size == null ||
      row.limited_edition_size === pin.limitedEditionSize;
    if (sim >= 0.85 && sameYear && sameLe) {
      return { id: row.id as string, pinhunt_id: row.pinhunt_id as string, title: row.title as string };
    }
  }
  return null;
}

// ─── Pin selection (varied sample) ───────────────────────────────────────────

async function selectPinsForValidation(
  sb: SupabaseClient,
  limit: number,
  collection?: string,
): Promise<Array<{ id: string; pinhunt_id: string }>> {
  // Skip pins already validated (any run) so re-runs extend coverage.
  const { data: done } = await sb.from("pin_ebay_validations").select("pin_id").limit(20000);
  const doneSet = new Set((done ?? []).map(r => r.pin_id as string));

  let query = sb
    .from("pins")
    .select("id, pinhunt_id, title, brand, collection, origin, limited_edition_size, edition_type, release_year, description")
    .eq("status", "active")
    .limit(5000);
  if (collection) query = query.ilike("collection", collection);
  const { data, error } = await query;
  if (error) throw new Error(`Pin selection failed: ${error.message}`);
  const rows = (data ?? []).filter(r => !doneSet.has(r.id as string));

  // A series run works through the series in catalogue order rather than
  // sampling for variety.
  if (collection) {
    return rows
      .sort((a, b) => String(a.pinhunt_id).localeCompare(String(b.pinhunt_id)))
      .slice(0, limit)
      .map(r => ({ id: r.id as string, pinhunt_id: r.pinhunt_id as string }));
  }

  // Bucket by brand/origin/edition-type variety, plus "suspicious" buckets:
  // incomplete records and speculative-looking ones.
  const bucketOf = (r: Record<string, unknown>): string => {
    const text = `${r.title} ${r.collection ?? ""}`.toLowerCase();
    if (!r.release_year || !r.collection) return "incomplete";
    if (/tbc|tba|unknown|speculat|rumou?r|placeholder|\?\?/.test(text)) return "speculative";
    if (/mystery/.test(text)) return "mystery";
    const brand = String(r.brand ?? "").toLowerCase();
    if (brand.includes("loungefly")) return "loungefly";
    if (brand.includes("artland")) return "artland";
    if (brand.includes("pink")) return "pink-a-la-mode";
    const origin = String(r.origin ?? "").toLowerCase();
    if (origin.includes("paris")) return "dlp";
    if (origin.includes("store")) return "disney-store";
    if (r.limited_edition_size) return "limited-edition";
    if (String(r.edition_type ?? "").toLowerCase().includes("release")) return "limited-release";
    return "parks-open";
  };
  const buckets = new Map<string, Array<{ id: string; pinhunt_id: string }>>();
  for (const r of rows) {
    const b = bucketOf(r);
    const list = buckets.get(b) ?? [];
    list.push({ id: r.id as string, pinhunt_id: r.pinhunt_id as string });
    buckets.set(b, list);
  }
  // Round-robin across buckets for a varied sample.
  const lists = [...buckets.values()];
  const selected: Array<{ id: string; pinhunt_id: string }> = [];
  let idx = 0;
  while (selected.length < limit && lists.some(l => idx < l.length)) {
    for (const list of lists) {
      if (list[idx]) selected.push(list[idx]);
      if (selected.length >= limit) break;
    }
    idx++;
  }
  return selected;
}

// ─── Run orchestration ───────────────────────────────────────────────────────

let runningRunId: string | null = null;
let pauseRequested = false;

export function isValidationRunActive(): boolean {
  return runningRunId !== null;
}

export function requestPause(): boolean {
  if (!runningRunId) return false;
  pauseRequested = true;
  return true;
}

export async function startValidationRun(
  limit: number,
  startedBy: string | null,
  opts: { retryRunId?: string; collection?: string } = {},
): Promise<string> {
  if (limit < 1 || limit > VALIDATION_MAX_LIMIT) {
    throw Object.assign(new Error(`limit must be 1–${VALIDATION_MAX_LIMIT}`), { status: 400 });
  }
  if (runningRunId) throw Object.assign(new Error("A validation run is already in progress"), { status: 409 });

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("ebay_validation_runs")
    .insert({ status: "running", requested_limit: limit, started_by: startedBy, filter_collection: opts.collection ?? null })
    .select("id")
    .single();
  if (error || !data) {
    // Unique partial index allows only one running row — a concurrent start
    // loses the race here rather than spawning a second run.
    if (error?.code === "23505") {
      throw Object.assign(new Error("A validation run is already in progress"), { status: 409 });
    }
    throw new Error(`Could not create run: ${error?.message}`);
  }
  const runId = data.id as string;
  runningRunId = runId;
  pauseRequested = false;

  processValidationRun(runId, limit, opts)
    .catch(async e => {
      logger.error({ runId, err: String(e) }, "validation run failed");
      await sb.from("ebay_validation_runs")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", runId);
    })
    .finally(() => { runningRunId = null; pauseRequested = false; });

  return runId;
}

async function processValidationRun(
  runId: string,
  limit: number,
  opts: { retryRunId?: string; collection?: string },
): Promise<void> {
  const sb = getServiceClient();

  let pins: Array<{ id: string; pinhunt_id: string }>;
  if (opts.retryRunId) {
    // Re-run only failed records from a previous run.
    const { data } = await sb
      .from("pin_ebay_validations")
      .select("pin_id, pinhunt_id")
      .eq("run_id", opts.retryRunId)
      .eq("validation_status", "error");
    pins = (data ?? []).map(r => ({ id: r.pin_id as string, pinhunt_id: r.pinhunt_id as string })).slice(0, limit);
  } else {
    pins = await selectPinsForValidation(sb, limit, opts.collection);
  }
  logger.info({ runId, count: pins.length }, "catalogue validation run started");

  const counts = {
    checked: 0, strong: 0, probable: 0, review: 0, none: 0,
    insufficient: 0, suspectedErrors: 0, duplicates: 0,
  };
  const stats = { apiCalls: 0, apiErrors: 0 };

  for (const sel of pins) {
    if (pauseRequested) {
      await sb.from("ebay_validation_runs").update({ status: "paused" }).eq("id", runId);
      logger.info({ runId }, "validation run paused by admin");
      return;
    }
    let row: Record<string, unknown>;
    try {
      const pin = await loadFullPin(sel.pinhunt_id);
      if (!pin) throw new Error("pin not found via repository");

      const pinSnapshot = {
        title: pin.title, brand: pin.brand, collection: pin.collection,
        characters: pin.characters, releaseYear: pin.releaseYear ?? null,
        limitedEditionSize: pin.limitedEditionSize ?? null,
        editionType: pin.edition ?? null, origin: pin.origin ?? null,
        manufacturer: pin.manufacturer ?? null,
        externalIdentifiers: pin.externalIdentifiers ?? {},
        imageUrl: pin.imageUrl ?? null, description: pin.description ?? null,
      };

      if (isTooVague(pin)) {
        counts.insufficient++;
        counts.checked++;
        row = {
          run_id: runId, pin_id: sel.id, pinhunt_id: sel.pinhunt_id,
          validation_status: "insufficient_data", confidence_score: null, match_count: 0,
          validation_flags: [{ code: "too_vague", message: "Existing title is too vague to identify reliably — not searched to avoid forced matches." }],
          validation_notes: "Record skipped: not enough distinguishing detail to search safely.",
          raw_search_queries: [], raw_candidate_results: [], pin_snapshot: pinSnapshot,
        };
      } else {
        const queries = buildValidationQueries(pin);
        const scored: CandidateScore[] = [];
        const seen = new Set<string>();
        for (const marketplace of ["EBAY_GB", "EBAY_US"] as const) {
          for (const q of queries) {
            const listings = await cachedSearch(marketplace, q, stats);
            for (const l of listings) {
              if (seen.has(l.itemId)) continue;
              seen.add(l.itemId);
              const s = scoreCandidate(pin, l, marketplace);
              if (s) scored.push(s);
            }
            await sleep(SEARCH_DELAY_MS);
          }
        }

        const analysis = analyseCandidates(pin, scored);
        const duplicate = await findSuspectedDuplicate(sb, pin, sel.id);
        if (duplicate) {
          analysis.flags.push({
            code: "possible_duplicate",
            message: `Catalogue record "${duplicate.title}" (${duplicate.pinhunt_id}) looks nearly identical — possible duplicate.`,
          });
          counts.duplicates++;
        }

        counts.checked++;
        if (analysis.status === "strong_match") counts.strong++;
        else if (analysis.status === "probable_match") counts.probable++;
        else if (analysis.status === "needs_review") counts.review++;
        else counts.none++;
        if (analysis.flags.some(f => ["edition_size_conflict", "year_conflict", "character_mismatch", "maybe_set"].includes(f.code))) {
          counts.suspectedErrors++;
        }

        row = {
          run_id: runId, pin_id: sel.id, pinhunt_id: sel.pinhunt_id,
          validation_status: analysis.status,
          confidence_score: analysis.confidence,
          match_count: analysis.matchCount,
          best_ebay_item_id: analysis.best?.listing.itemId ?? null,
          best_ebay_title: analysis.best?.listing.title ?? null,
          best_ebay_url: analysis.best?.listing.itemUrl ?? null,
          best_ebay_image_url: analysis.best?.listing.imageUrl ?? null,
          suggested_year: analysis.suggestions.year,
          suggested_edition_size: analysis.suggestions.editionSize,
          suggested_edition_type: analysis.suggestions.editionType,
          suspected_duplicate_pin_id: duplicate?.id ?? null,
          validation_notes: analysis.notes,
          validation_flags: analysis.flags,
          raw_search_queries: queries,
          raw_candidate_results: analysis.top3.map(c => ({
            itemId: c.listing.itemId,
            marketplace: c.marketplace,
            title: c.listing.title,
            url: c.listing.itemUrl,
            imageUrl: c.listing.imageUrl,
            askingPrice: c.listing.itemPrice,
            currency: c.listing.currency,
            sellerLocation: c.listing.sellerLocation ?? null,
            score: c.score,
            reasons: c.reasons,
            penalties: c.penalties,
            retrievedAt: new Date().toISOString(),
          })),
          pin_snapshot: pinSnapshot,
        };
      }
    } catch (e) {
      counts.checked++;
      logger.warn({ runId, pin: sel.pinhunt_id, err: String(e) }, "validation pin failed");
      row = {
        run_id: runId, pin_id: sel.id, pinhunt_id: sel.pinhunt_id,
        validation_status: "error", confidence_score: null, match_count: 0,
        validation_flags: [{ code: "error", message: String(e instanceof Error ? e.message : e) }],
        raw_search_queries: [], raw_candidate_results: [], pin_snapshot: {},
      };
    }

    const { error: insErr } = await sb.from("pin_ebay_validations").insert(row);
    if (insErr) logger.warn({ runId, err: insErr.message }, "validation insert failed");

    await sb.from("ebay_validation_runs").update({
      pins_checked: counts.checked,
      strong_match_count: counts.strong,
      probable_match_count: counts.probable,
      needs_review_count: counts.review,
      no_match_count: counts.none,
      insufficient_data_count: counts.insufficient,
      suspected_error_count: counts.suspectedErrors,
      suspected_duplicate_count: counts.duplicates,
      api_calls_used: stats.apiCalls,
      api_error_count: stats.apiErrors,
    }).eq("id", runId);
  }

  await sb.from("ebay_validation_runs").update({
    status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", runId);
  logger.info({ runId, counts, stats }, "catalogue validation run completed");
}

// ─── Admin review actions ────────────────────────────────────────────────────

/** Fields an admin may approve; maps suggestion → pins column. */
const APPROVABLE_FIELDS: Record<string, { suggestionCol: string; pinCol: string }> = {
  name: { suggestionCol: "suggested_name", pinCol: "title" },
  year: { suggestionCol: "suggested_year", pinCol: "release_year" },
  edition_size: { suggestionCol: "suggested_edition_size", pinCol: "limited_edition_size" },
  edition_type: { suggestionCol: "suggested_edition_type", pinCol: "edition_type" },
  collection: { suggestionCol: "suggested_collection", pinCol: "collection" },
  release_location: { suggestionCol: "suggested_release_location", pinCol: "origin" },
};

export interface DecisionArgs {
  validationId: string;
  action: "approve" | "approve_fields" | "reject" | "unable_to_verify" | "mark_duplicate" | "keep_both";
  fields?: string[];              // for approve_fields
  manualValues?: Record<string, string | number | null>; // manual edits (same field keys)
  adminId: string;
  reason?: string;
}

export async function applyValidationDecision(args: DecisionArgs): Promise<{ changedFields: string[] }> {
  const sb = getServiceClient();
  const { data: v, error } = await sb
    .from("pin_ebay_validations")
    .select("*")
    .eq("id", args.validationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!v) throw Object.assign(new Error("Validation record not found"), { status: 404 });

  const now = new Date().toISOString();
  const reviewPatch = { reviewed_by: args.adminId, reviewed_at: now, updated_at: now };

  if (args.action === "reject" || args.action === "unable_to_verify" || args.action === "keep_both") {
    const admin_status = args.action === "reject" ? "rejected"
      : args.action === "unable_to_verify" ? "unable_to_verify" : "keep_both";
    await sb.from("pin_ebay_validations").update({ ...reviewPatch, admin_status }).eq("id", args.validationId);
    return { changedFields: [] };
  }

  if (args.action === "mark_duplicate") {
    if (!v.suspected_duplicate_pin_id) {
      throw Object.assign(new Error("This record has no suspected duplicate to confirm"), { status: 400 });
    }
    const { data: dupPin } = await sb.from("pins").select("id").eq("id", v.suspected_duplicate_pin_id).maybeSingle();
    if (!dupPin) throw Object.assign(new Error("Suspected duplicate pin no longer exists"), { status: 409 });
    // Record the duplicate decision; merging stays a manual follow-up in the
    // pin editor — never automatic.
    await sb.from("pin_ebay_validations").update({ ...reviewPatch, admin_status: "approved" }).eq("id", args.validationId);
    await sb.from("pin_change_audit").insert({
      pin_id: v.pin_id, validation_id: v.id, changed_field: "duplicate_of",
      previous_value: null, new_value: v.suspected_duplicate_pin_id,
      reason: args.reason ?? "Admin confirmed duplicate", changed_by: args.adminId,
    });
    return { changedFields: ["duplicate_of"] };
  }

  // approve / approve_fields — apply selected suggested (or manual) values.
  const wanted = args.action === "approve" ? Object.keys(APPROVABLE_FIELDS) : (args.fields ?? []);
  const { data: pinRow, error: pinErr } = await sb
    .from("pins")
    .select("id, title, release_year, limited_edition_size, edition_type, collection, origin")
    .eq("id", v.pin_id)
    .single();
  if (pinErr || !pinRow) throw new Error(`Pin load failed: ${pinErr?.message}`);

  const pinPatch: Record<string, unknown> = {};
  const auditRows: Array<Record<string, unknown>> = [];
  const changedFields: string[] = [];

  for (const field of wanted) {
    const map = APPROVABLE_FIELDS[field];
    if (!map) continue;
    const manual = args.manualValues?.[field];
    const value = manual !== undefined ? manual : (v as Record<string, unknown>)[map.suggestionCol];
    if (value == null || value === "") continue;
    const prev = (pinRow as Record<string, unknown>)[map.pinCol];
    if (String(prev ?? "") === String(value)) continue;
    pinPatch[map.pinCol] = value;
    changedFields.push(field);
    auditRows.push({
      pin_id: v.pin_id, validation_id: v.id, changed_field: map.pinCol,
      previous_value: prev != null ? String(prev) : null,
      new_value: String(value),
      reason: args.reason ?? "Approved from eBay catalogue validation",
      changed_by: args.adminId,
    });
  }

  if (changedFields.length > 0) {
    // Atomic: pin update + audit rows commit together (or not at all).
    const { error: rpcErr } = await sb.rpc("apply_validation_changes", {
      p_pin_id: v.pin_id,
      p_patch: pinPatch,
      p_audit: auditRows,
    });
    if (rpcErr) throw new Error(`Applying changes failed: ${rpcErr.message}`);
  }

  const admin_status =
    args.action === "approve" || changedFields.length === wanted.length ? "approved" : "partially_approved";
  await sb.from("pin_ebay_validations").update({ ...reviewPatch, admin_status }).eq("id", args.validationId);
  return { changedFields };
}

/**
 * Apply an eBay candidate's image to the catalogue pin. Admin picks a specific
 * listing from the stored candidates; the pin image + audit row commit
 * atomically. Overwrites an existing image only when the admin confirms
 * (the UI warns first); the previous URL is preserved in the audit trail.
 */
export async function applyValidationImage(args: {
  validationId: string;
  itemId: string;
  adminId: string;
}): Promise<{ imageUrl: string }> {
  const sb = getServiceClient();
  const { data: v, error } = await sb
    .from("pin_ebay_validations")
    .select("id, pin_id, pinhunt_id, raw_candidate_results")
    .eq("id", args.validationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!v) throw Object.assign(new Error("Validation record not found"), { status: 404 });

  const candidates = (v.raw_candidate_results ?? []) as Array<Record<string, unknown>>;
  const cand = candidates.find(c => c.itemId === args.itemId);
  if (!cand || typeof cand.imageUrl !== "string" || !cand.imageUrl) {
    throw Object.assign(new Error("That listing has no usable image"), { status: 400 });
  }
  // eBay serves the same image at multiple sizes; request the 1600px version.
  const hiResUrl = cand.imageUrl.replace(/\/s-l\d+(\.\w+)$/, "/s-l1600$1");

  const { data: pinRow, error: pinErr } = await sb
    .from("pins").select("id, image_url").eq("id", v.pin_id).single();
  if (pinErr || !pinRow) throw new Error(`Pin load failed: ${pinErr?.message}`);

  const { error: rpcErr } = await sb.rpc("apply_validation_changes", {
    p_pin_id: v.pin_id,
    p_patch: { image_url: hiResUrl },
    p_audit: [{
      validation_id: v.id,
      changed_field: "image_url",
      previous_value: pinRow.image_url ?? null,
      new_value: hiResUrl,
      reason: `Image taken from eBay listing: ${cand.url ?? cand.itemId}`,
      changed_by: args.adminId,
    }],
  });
  if (rpcErr) throw new Error(`Applying image failed: ${rpcErr.message}`);

  // Provenance record so eBay-sourced images are identifiable later.
  const { error: provErr } = await sb.from("pin_images").insert({
    pin_id: v.pin_id,
    image_url: hiResUrl,
    image_type: "front",
    is_primary: true,
    description: `Image from eBay listing via catalogue validation: ${cand.url ?? cand.itemId}`,
  });
  if (provErr) {
    // The image + audit row already committed atomically; surface the
    // provenance failure loudly instead of pretending everything succeeded.
    throw Object.assign(
      new Error(`Image was applied, but recording its provenance failed: ${provErr.message}`),
      { status: 500 },
    );
  }

  logger.info({ pin: v.pinhunt_id, itemId: args.itemId }, "validation candidate image applied");
  return { imageUrl: hiResUrl };
}

/** Re-run validation for a single record (in place). */
export async function revalidateOne(validationId: string): Promise<void> {
  const sb = getServiceClient();
  const { data: v } = await sb
    .from("pin_ebay_validations")
    .select("id, pin_id, pinhunt_id")
    .eq("id", validationId)
    .maybeSingle();
  if (!v) throw Object.assign(new Error("Validation record not found"), { status: 404 });

  const pin = await loadFullPin(v.pinhunt_id as string);
  if (!pin) throw Object.assign(new Error("Pin not found"), { status: 404 });

  const stats = { apiCalls: 0, apiErrors: 0 };
  const queries = buildValidationQueries(pin);
  const scored: CandidateScore[] = [];
  const seen = new Set<string>();
  for (const marketplace of ["EBAY_GB", "EBAY_US"] as const) {
    for (const q of queries) {
      const listings = await cachedSearch(marketplace, q, stats);
      for (const l of listings) {
        if (seen.has(l.itemId)) continue;
        seen.add(l.itemId);
        const s = scoreCandidate(pin, l, marketplace);
        if (s) scored.push(s);
      }
      await sleep(SEARCH_DELAY_MS);
    }
  }
  const analysis = analyseCandidates(pin, scored);
  await sb.from("pin_ebay_validations").update({
    validation_status: analysis.status,
    confidence_score: analysis.confidence,
    match_count: analysis.matchCount,
    best_ebay_item_id: analysis.best?.listing.itemId ?? null,
    best_ebay_title: analysis.best?.listing.title ?? null,
    best_ebay_url: analysis.best?.listing.itemUrl ?? null,
    best_ebay_image_url: analysis.best?.listing.imageUrl ?? null,
    suggested_year: analysis.suggestions.year,
    suggested_edition_size: analysis.suggestions.editionSize,
    suggested_edition_type: analysis.suggestions.editionType,
    validation_notes: analysis.notes,
    validation_flags: analysis.flags,
    raw_search_queries: queries,
    raw_candidate_results: analysis.top3.map(c => ({
      itemId: c.listing.itemId, marketplace: c.marketplace, title: c.listing.title,
      url: c.listing.itemUrl, imageUrl: c.listing.imageUrl,
      askingPrice: c.listing.itemPrice, currency: c.listing.currency,
      sellerLocation: c.listing.sellerLocation ?? null,
      score: c.score, reasons: c.reasons, penalties: c.penalties,
      retrievedAt: new Date().toISOString(),
    })),
    admin_status: "pending",
    updated_at: new Date().toISOString(),
  }).eq("id", validationId);
}

// ─── Reads & report ──────────────────────────────────────────────────────────

export async function listValidationRuns() {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("ebay_validation_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getValidationRun(runId: string) {
  const sb = getServiceClient();
  const { data, error } = await sb.from("ebay_validation_runs").select("*").eq("id", runId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getValidationResults(runId: string) {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("pin_ebay_validations")
    .select("*")
    .eq("run_id", runId)
    .order("confidence_score", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** CSV export of a run's results. */
export async function buildValidationCsv(runId: string): Promise<string> {
  const results = await getValidationResults(runId);
  const esc = (s: unknown) => {
    const str = s == null ? "" : typeof s === "object" ? JSON.stringify(s) : String(s);
    return `"${str.replace(/"/g, '""')}"`;
  };
  const header = [
    "pinhunt_id", "original_title", "original_year", "original_edition_size",
    "confidence_score", "validation_result", "suggested_year",
    "suggested_edition_size", "suggested_edition_type", "validation_notes",
    "flags", "best_ebay_listing_url", "admin_status",
  ].join(",");
  const lines = results.map(r => {
    const snap = (r.pin_snapshot ?? {}) as Record<string, unknown>;
    const flags = ((r.validation_flags ?? []) as ValidationFlag[]).map(f => f.message).join(" | ");
    return [
      esc(r.pinhunt_id), esc(snap.title), esc(snap.releaseYear), esc(snap.limitedEditionSize),
      esc(r.confidence_score), esc(r.validation_status), esc(r.suggested_year),
      esc(r.suggested_edition_size), esc(r.suggested_edition_type), esc(r.validation_notes),
      esc(flags), esc(r.best_ebay_url), esc(r.admin_status),
    ].join(",");
  });
  return [header, ...lines].join("\n");
}
