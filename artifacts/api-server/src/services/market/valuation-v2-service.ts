/**
 * Valuation v2 wiring (SG-05, #408): evidence in, market_valuations rows out.
 *
 * - Behind MARKET_VALUATION_V2_ENABLED (server-side, off unless "true").
 * - Writes ONLY market_valuations (upsert on pin_id, market). Never writes
 *   pins.estimated_value_gbp, user_pins.*, pin_market_estimates or
 *   ebay_listing_snapshots; v1 (services/valuation.ts) is untouched.
 * - No route can start a paid search. collectPinEvidence is for the
 *   maintainer-run refresh (SG-06, #409); it always plans with a credit limit,
 *   and Soldgraph clients come only from createSoldgraphClientFromEnv, which
 *   refuses to run without the Supabase-backed usage store.
 * - Storing raw listing rows (market_listings upsert, dedupe, near-misses,
 *   retention) belongs to SG-06; this module only reads them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CataloguePin, MarketCode } from "@workspace/pin-repository";
import { BudgetExceededError, ProviderDisabledError, ProviderUnavailableError } from "../soldgraph/errors";
import type { EvidenceType, MarketplaceAdapter, NormalisedListing, PriceKind } from "./adapter";
import { matchListing, type MatchResult } from "./matching";
import { planPinSearches } from "./queries";
import {
  MARKET_PRIORITY,
  computePinValuations,
  type MarketValuationV2,
  type ValuationEvidence,
} from "./valuation-v2";

export const VALUATION_V2_FLAG_ENV = "MARKET_VALUATION_V2_ENABLED";
/** How long a stored v2 valuation is considered fresh (matches SG-06's sold cache TTL). */
export const VALUATION_V2_TTL_DAYS = 7;

export function valuationV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[VALUATION_V2_FLAG_ENV] === "true";
}

/** Generic, safe-to-log error for this module. Never carries database detail. */
export class ValuationV2Error extends Error {
  constructor(public readonly operation: string) {
    super(`valuation v2: ${operation} failed`);
    this.name = "ValuationV2Error";
  }
}

// ─── Evidence collection (paid searches: maintainer-run refresh only) ───────

export interface CollectOptions {
  /**
   * Required: the most credits this pin may plan. planPinSearches treats a
   * missing limit as "no limit", so this wrapper never lets it be omitted.
   */
  creditLimit: number;
  /** pins.id, passed to provider usage records. */
  pinId?: string;
}

export interface CollectedListing {
  listing: NormalisedListing;
  market: MarketCode;
  evidenceType: EvidenceType;
  match: MatchResult;
}

export interface CollectResult {
  /** Accepted matches as valuation evidence. */
  evidence: ValuationEvidence[];
  accepted: CollectedListing[];
  /** Near-miss rejections, for SG-06 to store (SG-10 leads). */
  rejected: CollectedListing[];
  plannedCredits: number;
  searchesRun: number;
  searchesFailed: number;
  /** Listings the searches returned (after adapter mapping, before matching). */
  listingsFound: number;
  /** Why the unmatched listings were turned down, by rejection reason. */
  rejectedReasons: Record<string, number>;
  /** Set when a budget, kill-switch or provider limit stopped the remaining searches. */
  stoppedBy?: "budget" | "disabled" | "unavailable";
}

export function toEvidence(c: CollectedListing): ValuationEvidence {
  return {
    sourceId: c.listing.sourceId,
    market: c.market,
    evidenceType: c.evidenceType,
    priceKind: c.listing.priceKind,
    price: c.listing.price,
    currency: c.listing.currency,
    soldDate: c.listing.soldDate,
    bestOfferAccepted: c.listing.bestOfferAccepted,
    matchScore: c.match.score,
    medianExcludingBestOffer: c.listing.medianExcludingBestOffer,
    seenAt: null,
    externalId: c.listing.externalId,
    locationFilter: c.listing.locationFilter ?? null,
    itemCountry: c.listing.itemCountry ?? null,
    priceIsConverted: c.listing.priceIsConverted ?? null,
  };
}

/**
 * Plan (with a mandatory credit limit), run and match every search for one
 * pin across `adapters` (already filtered by the registry). Listings are
 * matched with matchListing v2 and de-duplicated per (source, item),
 * keeping the best match.
 */
export async function collectPinEvidence(
  pin: CataloguePin,
  adapters: readonly MarketplaceAdapter[],
  opts: CollectOptions,
  now: () => number = Date.now,
): Promise<CollectResult> {
  if (!Number.isInteger(opts?.creditLimit) || opts.creditLimit < 0) {
    throw new TypeError("collectPinEvidence: creditLimit must be a non-negative integer");
  }
  const plan = planPinSearches(pin, adapters, { creditLimit: opts.creditLimit });
  const best = new Map<string, CollectedListing>();
  let searchesRun = 0;
  let searchesFailed = 0;
  let listingsFound = 0;
  let stoppedBy: CollectResult["stoppedBy"];

  for (const { adapter, query } of plan.searches) {
    let res;
    try {
      res = await adapter.search(query, { pinId: opts.pinId });
      searchesRun += 1;
    } catch (err) {
      searchesFailed += 1;
      if (err instanceof BudgetExceededError) stoppedBy = "budget";
      else if (err instanceof ProviderDisabledError) stoppedBy = "disabled";
      else if (err instanceof ProviderUnavailableError) stoppedBy = "unavailable";
      if (stoppedBy) break;
      continue;
    }
    listingsFound += res.listings.length;
    for (const listing of res.listings) {
      const match = matchListing(pin, listing.title, { mode: "v2", lang: adapter.lang });
      const key = `${listing.sourceId}|${listing.externalId}`;
      const prev = best.get(key);
      const better = !prev || (match.accepted && !prev.match.accepted) ||
        (match.accepted === prev.match.accepted && match.score > prev.match.score);
      if (better) best.set(key, { listing, market: adapter.market, evidenceType: adapter.evidenceType, match });
    }
  }

  const all = [...best.values()];
  const accepted = all.filter(c => c.match.accepted);
  const rejectedReasons: Record<string, number> = {};
  for (const c of all) {
    if (c.match.accepted) continue;
    const r = c.match.rejectionReason ?? "unknown";
    rejectedReasons[r] = (rejectedReasons[r] ?? 0) + 1;
  }
  const seenAt = new Date(now()).toISOString();
  return {
    evidence: accepted.map(c => ({ ...toEvidence(c), seenAt: c.evidenceType === "active" ? seenAt : null })),
    accepted,
    rejected: all.filter(c => !c.match.accepted),
    plannedCredits: plan.credits,
    searchesRun,
    searchesFailed,
    listingsFound,
    rejectedReasons,
    ...(stoppedBy ? { stoppedBy } : {}),
  };
}

// ─── Stored evidence (market_listings, service role) ─────────────────────────

const SOURCE_COLUMNS = "id, market, currency, evidence_type, enabled";
const LISTING_COLUMNS = "source_id, external_id, price, currency, sold_date, price_kind, best_offer_accepted, match_score, last_seen_at, location_filter, item_country, price_is_converted";
const MARKETS = new Set<string>(MARKET_PRIORITY);
const PRICE_KINDS = new Set<string>(["sold", "sold_possible_offer", "active"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Accepted, unexpired listing evidence for one pin from enabled sources.
 * Explicit columns only; titles and links are never read here. The item id
 * and region provenance (054) are read only so valuation can count one
 * transaction once and leave out rows whose region is unverified (#450).
 */
export async function loadStoredEvidence(db: SupabaseClient, pinUuid: string, now: number): Promise<ValuationEvidence[]> {
  if (!UUID_RE.test(pinUuid)) return [];
  const sourcesRes = await db.from("market_sources").select(SOURCE_COLUMNS);
  if (sourcesRes.error) throw new ValuationV2Error("load sources");
  const sources = new Map<string, { market: MarketCode; evidenceType: EvidenceType }>();
  for (const s of (sourcesRes.data ?? []) as Record<string, unknown>[]) {
    if (s.enabled !== true || typeof s.id !== "string" || !MARKETS.has(String(s.market))) continue;
    if (s.evidence_type !== "sold" && s.evidence_type !== "active") continue;
    sources.set(s.id, { market: s.market as MarketCode, evidenceType: s.evidence_type });
  }
  if (sources.size === 0) return [];

  const listingsRes = await db
    .from("market_listings")
    .select(LISTING_COLUMNS)
    .eq("pin_id", pinUuid)
    .eq("accepted", true)
    .gt("expires_at", new Date(now).toISOString());
  if (listingsRes.error) throw new ValuationV2Error("load listings");

  const out: ValuationEvidence[] = [];
  for (const r of (listingsRes.data ?? []) as Record<string, unknown>[]) {
    const src = typeof r.source_id === "string" ? sources.get(r.source_id) : undefined;
    if (!src || !PRICE_KINDS.has(String(r.price_kind)) || typeof r.currency !== "string") continue;
    out.push({
      sourceId: r.source_id as string,
      market: src.market,
      evidenceType: src.evidenceType,
      priceKind: r.price_kind as PriceKind,
      price: num(r.price),
      currency: r.currency,
      soldDate: typeof r.sold_date === "string" ? r.sold_date : null,
      bestOfferAccepted: typeof r.best_offer_accepted === "boolean" ? r.best_offer_accepted : null,
      matchScore: num(r.match_score),
      seenAt: typeof r.last_seen_at === "string" ? r.last_seen_at : null,
      externalId: typeof r.external_id === "string" ? r.external_id : null,
      locationFilter: typeof r.location_filter === "string" ? r.location_filter : null,
      itemCountry: typeof r.item_country === "string" ? r.item_country : null,
      priceIsConverted: typeof r.price_is_converted === "boolean" ? r.price_is_converted : null,
    });
  }
  return out;
}

// ─── market_valuations rows ──────────────────────────────────────────────────

/** Exactly the market_valuations columns v2 writes (049). */
export interface MarketValuationRow {
  pin_id: string;
  market: MarketCode;
  currency: string;
  low: number | null;
  fair: number | null;
  high: number | null;
  sold_count: number;
  active_count: number;
  confidence_score: number;
  confidence_band: MarketValuationV2["confidence"]["band"];
  sources: Array<{ source_id: string; count: number; latest_date: string }>;
  method_version: string;
  calculated_at: string;
  expires_at: string;
  updated_at: string;
}

export function toMarketValuationRow(pinUuid: string, v: MarketValuationV2, calculatedAt: number): MarketValuationRow {
  const at = new Date(calculatedAt).toISOString();
  return {
    pin_id: pinUuid,
    market: v.market,
    currency: v.currency,
    low: v.low,
    fair: v.fair,
    high: v.high,
    sold_count: v.soldCount,
    active_count: v.activeCount,
    confidence_score: v.confidence.score,
    confidence_band: v.confidence.band,
    // Rebuilt key by key: 049's CHECK allows only these three keys.
    sources: v.sources.map(s => ({ source_id: s.source_id, count: s.count, latest_date: s.latest_date })),
    method_version: v.methodVersion,
    calculated_at: at,
    expires_at: new Date(calculatedAt + VALUATION_V2_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: at,
  };
}

export async function saveMarketValuations(db: SupabaseClient, rows: MarketValuationRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from("market_valuations").upsert(rows, { onConflict: "pin_id,market" });
  if (error) throw new ValuationV2Error("save valuations");
}

export type RevalueResult =
  | { status: "disabled" }
  | { status: "saved"; valuations: MarketValuationV2[] };

/**
 * Recompute and save one pin's v2 valuations from stored evidence. Makes no
 * provider calls. Every market (UK, FR, US) gets a row, so a market whose
 * evidence has expired is overwritten as "insufficient" rather than left stale.
 */
export async function revaluePinFromStoredEvidence(
  db: SupabaseClient,
  pinUuid: string,
  opts: { now?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<RevalueResult> {
  if (!valuationV2Enabled(opts.env)) return { status: "disabled" };
  if (!UUID_RE.test(pinUuid)) throw new ValuationV2Error("pin id");
  const now = opts.now ?? Date.now();
  const evidence = await loadStoredEvidence(db, pinUuid, now);
  const valuations = computePinValuations(evidence, { now });
  await saveMarketValuations(db, valuations.map(v => toMarketValuationRow(pinUuid, v, now)));
  return { status: "saved", valuations };
}
