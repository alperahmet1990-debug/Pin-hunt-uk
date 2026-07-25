/**
 * Pin market valuation — builds eBay search queries from a catalogue pin,
 * filters/scores listings, computes low/mid/high estimates, and persists
 * results in Supabase (pin_market_estimates + ebay_listing_snapshots).
 *
 * The public entry points are getMarketValueForPin() (read saved values)
 * and refreshMarketValueForPin() (search eBay and recalculate). The future
 * scanner reuses getMarketValueForPin — there is no separate valuation path.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabasePinRepository,
  type CataloguePin,
} from "@workspace/pin-repository";
import { searchListings, type EbayListing, type EbayMarketplace } from "./ebay";
import { logger } from "../lib/logger";

const VALUE_TTL_DAYS = 14;
const MAX_SNAPSHOTS_PER_MARKETPLACE = 25;

export type Confidence = "insufficient" | "low" | "medium" | "high";

export interface MarketEstimate {
  marketplace: EbayMarketplace;
  currency: string;
  estimatedLow: number | null;
  estimatedMid: number | null;
  estimatedHigh: number | null;
  comparableCount: number;
  confidence: Confidence;
  calculatedAt: string;
  expiresAt: string;
  stale: boolean;
}

export interface ComparableListing {
  ebayItemId: string;
  marketplace: EbayMarketplace;
  title: string;
  itemUrl: string | null;
  imageUrl: string | null;
  itemPrice: number | null;
  deliveryPrice: number | null;
  totalPrice: number | null;
  currency: string | null;
  condition: string | null;
}

export interface MarketValueResult {
  pinId: string;
  estimates: MarketEstimate[];
  comparables: ComparableListing[];
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }
  if (!serviceClient) serviceClient = createClient(url, key);
  return serviceClient;
}

/** Resolve the pin's internal UUID (pins.id) from its public pinhunt id. */
async function resolvePinUuid(pinhuntId: string): Promise<string | null> {
  const { data, error } = await getServiceClient()
    .from("pins")
    .select("id")
    .eq("pinhunt_id", pinhuntId)
    .maybeSingle();
  if (error) throw new Error(`Pin lookup failed: ${error.message}`);
  return data?.id ?? null;
}

async function loadPin(pinhuntId: string): Promise<CataloguePin | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing.");
  const repo = createSupabasePinRepository(url, key);
  return repo.getPinById(pinhuntId);
}

// ─── Query generation ─────────────────────────────────────────────────────────

/** Generate up to 3 distinct search queries from pin metadata. */
export function buildSearchQueries(pin: CataloguePin): string[] {
  const character = pin.characters[0];
  const productCode =
    pin.externalIdentifiers?.sku ??
    pin.externalIdentifiers?.disneySku ??
    pin.externalIdentifiers?.fac;

  const candidates: string[] = [];

  // Most specific: brand + title + LE size
  const q1 = [
    "Disney",
    pin.brand !== "Disney" ? pin.brand : undefined,
    pin.title,
    "pin",
    pin.limitedEditionSize ? `LE ${pin.limitedEditionSize}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  candidates.push(q1);

  // Product code search when available — very high precision
  if (productCode) {
    candidates.push(`Disney pin ${productCode}`);
  }

  // Broader: character/collection oriented
  const q3 = [
    character,
    pin.collection && pin.collection !== pin.title ? pin.collection : undefined,
    "Disney pin",
    pin.releaseYear ? String(pin.releaseYear) : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  if (q3.trim().length > "Disney pin".length) candidates.push(q3);

  // Fallback broad title search
  candidates.push(`${pin.title} Disney pin`);

  // Dedupe (case/whitespace-insensitive), cap at 3
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const q of candidates) {
    const norm = q.toLowerCase().replace(/\s+/g, " ").trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    queries.push(q.replace(/\s+/g, " ").trim());
    if (queries.length === 3) break;
  }
  return queries;
}

// ─── Relevance scoring ────────────────────────────────────────────────────────

const BASE_EXCLUDE_TERMS = [
  "job lot",
  "bundle",
  "pin backs",
  "backing card only",
  "box only",
  "custom",
  "fantasy",
  "inspired",
  "scrapper",
  "fake",
  "replica",
  // Non-pin merchandise that often surfaces in keyword searches
  "lanyard",
  "keychain",
  "keyring",
  "plush",
  "t-shirt",
  "tshirt",
  "sweatshirt",
  "hoodie",
  "mug",
  "tumbler",
  "funko",
  "ears headband",
  "loungefly bag",
  "backpack",
  "wallet",
  "phone case",
  "sticker",
  "poster",
];

function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9£$ ]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

/** Score a listing's relevance to the pin. Returns null when excluded. */
export function scoreListing(pin: CataloguePin, listing: EbayListing): number | null {
  const title = listing.title.toLowerCase();

  // Exclusions. "lot" is only excluded as a standalone word (avoid "Camelot").
  const isSetRecord = /\bset\b/i.test(pin.title) || /\bset\b/i.test(pin.collection ?? "");
  const isMysteryRecord = /mystery/i.test(pin.title) || /mystery/i.test(pin.collection ?? "");
  for (const term of BASE_EXCLUDE_TERMS) {
    if (title.includes(term)) return null;
  }
  if (/\blot\b/.test(title)) return null;
  if (!isSetRecord && /\bset\b/.test(title) && !/\bset of 1\b/.test(title)) {
    // Listings selling whole sets aren't comparable to a single-pin record.
    return null;
  }
  if (!isMysteryRecord && /\bmystery\b/.test(title)) return null;

  // Must actually be a pin/badge listing.
  if (!/\bpins?\b|\bbadge\b/.test(title)) return null;

  let score = 0;
  const titleTokens = new Set(tokenise(listing.title));

  // Pin name overlap (strongest signal)
  const nameTokens = tokenise(pin.title);
  const nameHits = nameTokens.filter(t => titleTokens.has(t)).length;
  const nameRatio = nameTokens.length > 0 ? nameHits / nameTokens.length : 0;
  if (nameTokens.length > 0) score += nameRatio * 50;

  // Conflicting edition size is disqualifying — different pin.
  const leInTitle = title.match(/\ble\s*(\d{2,6})\b/);
  if (pin.limitedEditionSize && leInTitle && Number(leInTitle[1]) !== pin.limitedEditionSize) {
    return null;
  }

  // Character conflict: if the record has characters and the listing names a
  // different well-known character but none of the record's, don't force it.
  const hasRecordCharacter = pin.characters.some(c => c && title.includes(c.toLowerCase()));

  // Series/edition discriminators — crucial for pins with generic names
  // (e.g. "Hatbox Ghost" exists across many series; only the collection and
  // edition words distinguish the right one).
  const GENERIC_TOKENS = new Set([
    "disney", "pin", "pins", "the", "and", "wave", "series", "edition",
    "open", "limited", "collection", "wdw", "dlr", "parks",
  ]);
  const discTokens = [
    ...tokenise(pin.collection ?? ""),
    ...tokenise(pin.edition ?? ""),
  ].filter(t => !GENERIC_TOKENS.has(t));
  const discHits = discTokens.filter(t => titleTokens.has(t)).length;
  score += Math.min(discHits, 3) * 8;

  // Generic-name guard: a short pin name that matches everything is not
  // enough on its own — require at least one series/edition word too.
  if (nameTokens.length <= 3 && discTokens.length >= 2 && discHits === 0) return null;

  // Character match
  for (const c of pin.characters) {
    if (c && title.includes(c.toLowerCase())) { score += 15; break; }
  }
  // Collection match
  if (pin.collection && title.includes(pin.collection.toLowerCase())) score += 10;
  // Manufacturer/brand match
  const maker = pin.manufacturer ?? pin.brand;
  if (maker && title.includes(maker.toLowerCase())) score += 10;
  // Edition size match
  if (pin.limitedEditionSize && new RegExp(`\\ble\\s*${pin.limitedEditionSize}\\b`).test(title)) {
    score += 15;
  }
  // Product code match
  const codes = Object.values(pin.externalIdentifiers ?? {}).filter(Boolean) as string[];
  if (codes.some(code => code.length >= 4 && title.includes(code.toLowerCase()))) score += 20;

  // Stricter acceptance: require genuine name overlap so keyword-adjacent
  // listings don't pollute the comparable pool. If the record has character
  // metadata, the listing must also mention one of them or match most of the
  // pin name — otherwise it's likely a different pin.
  if (nameRatio < 0.4) return null;
  if (pin.characters.length > 0 && !hasRecordCharacter && nameRatio < 0.7) return null;
  return score >= 40 ? score : null;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

/** Remove extreme outliers (1.5×IQR) when there are enough data points. */
function removeOutliers(prices: number[]): number[] {
  if (prices.length < 5) return prices;
  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const kept = sorted.filter(p => p >= lo && p <= hi);
  return kept.length >= 1 ? kept : sorted;
}

function confidenceFor(count: number): Confidence {
  if (count === 0) return "insufficient";
  if (count <= 3) return "low";
  if (count <= 9) return "medium";
  return "high";
}

// ─── Core valuation ───────────────────────────────────────────────────────────

interface ScoredListing extends EbayListing {
  relevance: number;
  /** Item price + delivery when delivery is known; otherwise item price only. */
  totalPrice: number;
}

async function collectListings(
  pin: CataloguePin,
  marketplace: EbayMarketplace,
  queries: string[],
): Promise<{ accepted: ScoredListing[]; rejected: EbayListing[] }> {
  const byItemId = new Map<string, EbayListing>();
  for (const q of queries) {
    const results = await searchListings(marketplace, q);
    for (const listing of results) {
      if (!byItemId.has(listing.itemId)) byItemId.set(listing.itemId, listing);
    }
  }

  const accepted: ScoredListing[] = [];
  const rejected: EbayListing[] = [];
  for (const listing of byItemId.values()) {
    if (listing.itemPrice == null || listing.itemPrice <= 0) continue;
    const relevance = scoreListing(pin, listing);
    if (relevance == null) {
      rejected.push(listing);
      continue;
    }
    accepted.push({
      ...listing,
      relevance,
      // Delivery added only when actually available — never assumed free.
      totalPrice: listing.itemPrice + (listing.deliveryPrice ?? 0),
    });
  }
  accepted.sort((a, b) => b.relevance - a.relevance);
  return { accepted, rejected };
}

function calculateEstimate(
  marketplace: EbayMarketplace,
  currency: string,
  accepted: ScoredListing[],
): Omit<MarketEstimate, "calculatedAt" | "expiresAt" | "stale"> {
  // Estimate on item price only — delivery cost is not part of a pin's value.
  const prices = removeOutliers(accepted.map(l => l.itemPrice ?? 0));
  const sorted = [...prices].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) {
    return {
      marketplace,
      currency,
      estimatedLow: null,
      estimatedMid: null,
      estimatedHigh: null,
      comparableCount: 0,
      confidence: "insufficient",
    };
  }
  return {
    marketplace,
    currency,
    estimatedLow: Number(quantile(sorted, 0.1).toFixed(2)),
    estimatedMid: Number(median(sorted).toFixed(2)),
    estimatedHigh: Number(quantile(sorted, 0.9).toFixed(2)),
    comparableCount: count,
    confidence: confidenceFor(count),
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function rowToEstimate(row: Record<string, unknown>): MarketEstimate {
  const expiresAt = String(row.expires_at);
  return {
    marketplace: row.marketplace as EbayMarketplace,
    currency: String(row.currency),
    estimatedLow: row.estimated_low != null ? Number(row.estimated_low) : null,
    estimatedMid: row.estimated_mid != null ? Number(row.estimated_mid) : null,
    estimatedHigh: row.estimated_high != null ? Number(row.estimated_high) : null,
    comparableCount: Number(row.comparable_count ?? 0),
    confidence: row.confidence as Confidence,
    calculatedAt: String(row.calculated_at),
    expiresAt,
    stale: new Date(expiresAt).getTime() < Date.now(),
  };
}

function rowToComparable(row: Record<string, unknown>): ComparableListing {
  return {
    ebayItemId: String(row.ebay_item_id),
    marketplace: row.marketplace as EbayMarketplace,
    title: String(row.title),
    itemUrl: (row.item_url as string) ?? null,
    imageUrl: (row.image_url as string) ?? null,
    itemPrice: row.item_price != null ? Number(row.item_price) : null,
    deliveryPrice: row.delivery_price != null ? Number(row.delivery_price) : null,
    totalPrice: row.total_price != null ? Number(row.total_price) : null,
    currency: (row.currency as string) ?? null,
    condition: (row.condition as string) ?? null,
  };
}

/** Read saved market values + accepted comparable listings for a pin. */
export async function getMarketValueForPin(pinhuntId: string): Promise<MarketValueResult | null> {
  const pinUuid = await resolvePinUuid(pinhuntId);
  if (!pinUuid) return null;
  const sb = getServiceClient();

  const [estimatesRes, comparablesRes] = await Promise.all([
    sb.from("pin_market_estimates").select("*").eq("pin_id", pinUuid),
    // Fetch comparables per marketplace so US listings aren't crowded out
    // when UK results have higher relevance scores.
    Promise.all(
      (["EBAY_GB", "EBAY_US"] as const).map(mp =>
        sb
          .from("ebay_listing_snapshots")
          .select("*")
          .eq("pin_id", pinUuid)
          .eq("marketplace", mp)
          .eq("accepted_for_valuation", true)
          .order("relevance_score", { ascending: false })
          .limit(5),
      ),
    ).then(parts => ({
      data: parts.flatMap(p => p.data ?? []),
      error: parts.find(p => p.error)?.error ?? null,
    })),
  ]);
  if (estimatesRes.error) throw new Error(estimatesRes.error.message);
  if (comparablesRes.error) throw new Error(comparablesRes.error.message);

  return {
    pinId: pinhuntId,
    estimates: (estimatesRes.data ?? []).map(rowToEstimate),
    comparables: (comparablesRes.data ?? []).map(rowToComparable),
  };
}

/**
 * Batch read: latest saved UK (fallback US) mid value for a list of pins.
 * Used by catalogue/collection cards to show the latest price without
 * triggering any eBay calls.
 */
export async function getLatestValuesForPins(
  pinhuntIds: string[],
): Promise<Record<string, { marketplace: EbayMarketplace; currency: string; mid: number; calculatedAt: string; stale: boolean }>> {
  if (pinhuntIds.length === 0) return {};
  const sb = getServiceClient();

  const { data: pinRows, error: pinErr } = await sb
    .from("pins")
    .select("id, pinhunt_id")
    .in("pinhunt_id", pinhuntIds);
  if (pinErr) throw new Error(pinErr.message);
  const uuidToPinhunt = new Map((pinRows ?? []).map(r => [r.id as string, r.pinhunt_id as string]));
  if (uuidToPinhunt.size === 0) return {};

  const { data: estRows, error: estErr } = await sb
    .from("pin_market_estimates")
    .select("pin_id, marketplace, currency, estimated_mid, calculated_at, expires_at")
    .in("pin_id", [...uuidToPinhunt.keys()])
    .not("estimated_mid", "is", null);
  if (estErr) throw new Error(estErr.message);

  const out: Record<string, { marketplace: EbayMarketplace; currency: string; mid: number; calculatedAt: string; stale: boolean }> = {};
  for (const row of estRows ?? []) {
    const pinhuntId = uuidToPinhunt.get(row.pin_id as string);
    if (!pinhuntId) continue;
    const existing = out[pinhuntId];
    // Prefer UK values; fall back to US when there's no UK estimate.
    if (existing && existing.marketplace === "EBAY_GB") continue;
    if (!existing || row.marketplace === "EBAY_GB") {
      out[pinhuntId] = {
        marketplace: row.marketplace as EbayMarketplace,
        currency: String(row.currency),
        mid: Number(row.estimated_mid),
        calculatedAt: String(row.calculated_at),
        stale: new Date(String(row.expires_at)).getTime() < Date.now(),
      };
    }
  }
  return out;
}

// In-flight refresh lock: one refresh per pin at a time.
const inFlight = new Map<string, Promise<MarketValueResult>>();

/** Search eBay UK + US, recalculate, persist, and return the fresh values. */
export function refreshMarketValueForPin(pinhuntId: string): Promise<MarketValueResult> {
  const existing = inFlight.get(pinhuntId);
  if (existing) return existing;

  const run = (async (): Promise<MarketValueResult> => {
    const [pin, pinUuid] = await Promise.all([loadPin(pinhuntId), resolvePinUuid(pinhuntId)]);
    if (!pin || !pinUuid) throw Object.assign(new Error("Pin not found"), { status: 404 });

    const queries = buildSearchQueries(pin);
    logger.info({ pinhuntId, queries }, "eBay valuation refresh");

    const sb = getServiceClient();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + VALUE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const marketplaces: Array<{ marketplace: EbayMarketplace; currency: string }> = [
      { marketplace: "EBAY_GB", currency: "GBP" },
      { marketplace: "EBAY_US", currency: "USD" },
    ];

    for (const { marketplace, currency } of marketplaces) {
      const { accepted } = await collectListings(pin, marketplace, queries);
      const estimate = calculateEstimate(marketplace, currency, accepted);

      // Upsert the estimate
      const { error: upsertErr } = await sb.from("pin_market_estimates").upsert(
        {
          pin_id: pinUuid,
          marketplace,
          currency,
          estimated_low: estimate.estimatedLow,
          estimated_mid: estimate.estimatedMid,
          estimated_high: estimate.estimatedHigh,
          comparable_count: estimate.comparableCount,
          confidence: estimate.confidence,
          calculated_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: "pin_id,marketplace" },
      );
      if (upsertErr) throw new Error(`Saving estimate failed: ${upsertErr.message}`);

      // Replace snapshots for this pin+marketplace
      const { error: delErr } = await sb
        .from("ebay_listing_snapshots")
        .delete()
        .eq("pin_id", pinUuid)
        .eq("marketplace", marketplace);
      if (delErr) throw new Error(`Clearing snapshots failed: ${delErr.message}`);

      const snapshotRows = accepted.slice(0, MAX_SNAPSHOTS_PER_MARKETPLACE).map(l => ({
        pin_id: pinUuid,
        ebay_item_id: l.itemId,
        marketplace,
        title: l.title,
        item_url: l.itemUrl ?? null,
        image_url: l.imageUrl ?? null,
        item_price: l.itemPrice ?? null,
        delivery_price: l.deliveryPrice ?? null,
        total_price: l.totalPrice,
        currency: l.currency ?? currency,
        condition: l.condition ?? null,
        relevance_score: l.relevance,
        accepted_for_valuation: true,
        retrieved_at: now.toISOString(),
      }));
      if (snapshotRows.length > 0) {
        const { error: insErr } = await sb.from("ebay_listing_snapshots").insert(snapshotRows);
        if (insErr) throw new Error(`Saving snapshots failed: ${insErr.message}`);
      }
    }

    const result = await getMarketValueForPin(pinhuntId);
    if (!result) throw new Error("Failed to read back saved valuation.");
    return result;
  })();

  inFlight.set(pinhuntId, run);
  // Swallow rejection on this side-channel so it never becomes an unhandled
  // promise rejection (the caller still receives the original rejection).
  run.catch(() => {}).finally(() => inFlight.delete(pinhuntId));
  return run;
}
