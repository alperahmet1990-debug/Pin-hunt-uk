/**
 * Valuation v2 (SG-05, #408): per-market, sold-first Low / Fair / High with a
 * deterministic, explained confidence score. Pure: no I/O, no clock unless
 * passed in, no provider calls.
 *
 * It sits alongside the v1 engine (services/valuation.ts, eBay Browse asking
 * prices in pin_market_estimates), which is unchanged. v2 output is written
 * only to market_valuations (migration 049); never to pins.estimated_value_gbp
 * or user_pins.current_value_gbp.
 *
 * ── Markets ────────────────────────────────────────────────────────────────
 * UK (GBP), FR (EUR) and US (USD) are valued separately, each in its own
 * currency. Rows in another currency are dropped, never converted. Priority
 * for display is UK > FR > US (`primaryMarket`).
 *
 * ── Evidence ───────────────────────────────────────────────────────────────
 * Sold rows (eBay sold, per market):
 *   - Excluded: Best Offer sales (`bestOfferAccepted === true`; the accepted
 *     price is unknown), rows with no sale price, rows with no sale date, and
 *     sales older than 365 days.
 *   - Recency weight: 1.0 up to 90 days old, then a straight taper to 0.4 at
 *     365 days.
 *   - `sold_possible_offer` (Best Offer status not reported) keeps its weight
 *     for Low and Fair, but its price is capped at Fair when High is worked
 *     out, and its share lowers confidence.
 * Active rows (Vinted, Whatnot, eBay Browse): asking prices, weight 0.3. Rows
 * last seen more than ACTIVE_MAX_AGE_DAYS (30) ago are left out ("stale_listing").
 * Freshness is decided here, by sold date and last-seen date, never by
 * deleting stored rows (#446: Soldgraph rows have no age-based expiry). Used
 * only when there are fewer than 3 sold rows, and then Fair may not exceed
 * the sold anchor by more than FAIR_CAP_OVER_SOLD. The sold anchor is the
 * weighted median of the usable sold rows or, when there are none, Soldgraph's
 * `median_excluding_best_offer` summary.
 * Item price only: shipping is never part of a pin's value (same as v1).
 *
 * ── Region (SG-13, #450) ───────────────────────────────────────────────────
 * Rows from the Soldgraph eBay sold sources (REGION_CHECKED_SOURCE_IDS) are
 * regional evidence only when region-verified. Checked before anything else:
 *   - region_unverified: the row was not fetched with
 *     item_location=domestic (every row stored before 054), or its parsed
 *     itemCountry is a different country from the market's website.
 *   - converted_price: the provider said the price was converted.
 *   - cross_market_duplicate: the same eBay item (externalId) is
 *     region-verified under sources of more than one market for this pin.
 *     It counts once, in the market whose country matches itemCountry, and
 *     is left out of every other market. If no single market matches, it is
 *     left out of all of them.
 * Stored rows are never deleted for this: they stay as raw evidence.
 *
 * ── Figures ────────────────────────────────────────────────────────────────
 * Prices are trimmed with the 1.5×IQR rule (5 or more points), then
 *   fair = weighted median, low = weighted p20, high = weighted p80,
 * using midpoint-interpolated weighted quantiles. Low and High need at least 3
 * points; with fewer, only Fair is given.
 * Basis:
 *   "sold"     3+ usable sold rows (active rows ignored), or 1–2 sold and no
 *              active rows;
 *   "listings" fewer than 3 sold rows plus active rows: "based on current
 *              listings", confidence band capped at "low";
 *   "none"     no usable evidence: no figures, band "insufficient".
 *
 * ── Per-source summaries (SG-12, #446) ─────────────────────────────────────
 * Alongside the figures, each market lists one summary per source id, built
 * from the rows that passed the checks above (region, currency, Best Offer,
 * price, date, age), before outlier trimming:
 *   sold sources    count, latest sold date, median sold price;
 *   active sources  count, latest seen date, low–high asking range, median.
 * Derived figures only. Sources are never merged: Soldgraph eBay data and
 * eBay Browse API data always sit in separate entries.
 *
 * ── Confidence (0–100) ─────────────────────────────────────────────────────
 * Sum of whole-number points, each recorded as a reason:
 *   sold_evidence     basis "sold": 4 per sold row, up to 40 (10 rows)
 *   listing_evidence  basis "listings": 4 per row, up to 20 (5 rows)
 *   recency           up to 20: 20 × (mean sold recency weight − 0.4) / 0.6
 *   spread            up to 20: 20 × (1 − IQR / median), 3+ points only
 *   match_quality     up to 20: 20 × mean of clamp((match_score − 40) / 60)
 *   possible_offer    minus up to 10: −10 × share of sold rows whose Best
 *                     Offer status was not reported
 * Band: 70+ high, 45+ medium, otherwise low; "insufficient" with no evidence.
 * Caps (recorded as reasons, and the score is lowered to the band's ceiling
 * so score and band always agree): basis "listings", or fewer than 3 sold
 * rows → at most low (44); fewer than 5 sold rows → at most medium (69).
 */
import type { MarketCode } from "@workspace/pin-repository";
import type { EvidenceType, PriceKind } from "./adapter";
import { MARKET_COUNTRY, REGION_CHECKED_SOURCE_IDS } from "./region";

/**
 * v2.1 (#446): freshness by sold / last-seen date instead of stored expiry,
 * per-source summaries, region-verified evidence only (054, #450).
 */
export const VALUATION_V2_METHOD_VERSION = "v2.1";

/**
 * Method versions whose stored values were built from region-verified
 * evidence only (054, #450). Values from earlier versions (v2.0, including
 * the pre-#450 pilot) may contain unverified regional sales and are never
 * published.
 */
export const REGION_VERIFIED_METHOD_VERSIONS: ReadonlySet<string> = new Set(["v2.1"]);

export const MARKET_CURRENCY: Record<MarketCode, string> = { UK: "GBP", FR: "EUR", US: "USD" };
/** Display / fallback priority: eBay UK sold first, then FR, then US. */
export const MARKET_PRIORITY: readonly MarketCode[] = ["UK", "FR", "US"];

export const VALUATION_V2_CONFIG = {
  /** Sold rows needed for a sold-only range; below this, active rows fill in. */
  minSoldForRange: 3,
  /** Points needed for Low and High (otherwise Fair only). */
  minPointsForRange: 3,
  /** Points needed before IQR trimming applies. */
  minPointsForTrim: 5,
  fullWeightDays: 90,
  maxAgeDays: 365,
  oldestWeight: 0.4,
  activeWeight: 0.3,
  /** Active rows last seen longer ago than this are stale and left out. */
  activeMaxAgeDays: 30,
  /** Active rows can never lift Fair more than this fraction above the sold anchor. */
  fairCapOverSold: 0.15,
  lowQuantile: 0.2,
  highQuantile: 0.8,
  /** match_score at or below this counts as 0 quality; this much above counts as 1. */
  matchScoreFloor: 40,
  matchScoreRange: 60,
  highBandMinScore: 70,
  mediumBandMinScore: 45,
  /** Sold rows needed before the band may be "high". */
  minSoldForHighBand: 5,
} as const;

export type ValuationBasis = "sold" | "listings" | "none";
export type ConfidenceBand = "insufficient" | "low" | "medium" | "high";

/** One piece of matched evidence for a pin (accepted by matchListing v2). */
export interface ValuationEvidence {
  /** market_sources.id. */
  sourceId: string;
  market: MarketCode;
  /** market_sources.evidence_type. */
  evidenceType: EvidenceType;
  priceKind: PriceKind;
  /** Item price in `currency`; null when unknown (always null for accepted Best Offers). */
  price: number | null;
  currency: string;
  /** ISO timestamp of the sale; null for active rows. */
  soldDate: string | null;
  bestOfferAccepted: boolean | null;
  /** matchListing v2 score; null when unknown. */
  matchScore: number | null;
  /** Soldgraph's median_excluding_best_offer for the search, when reported. */
  medianExcludingBestOffer?: number | null;
  /** When an active row was last seen (ISO); used for attribution dates. */
  seenAt?: string | null;
  /** The marketplace's item id; used only to count one transaction once across markets. */
  externalId?: string | null;
  /** Region provenance (054). Missing or null = not recorded. */
  locationFilter?: string | null;
  itemCountry?: string | null;
  priceIsConverted?: boolean | null;
}

export type ExclusionReason =
  | "best_offer"
  | "no_sale_price"
  | "no_sale_date"
  | "too_old"
  | "currency_mismatch"
  | "outlier"
  | "stale_listing"
  | "region_unverified"
  | "cross_market_duplicate"
  | "converted_price";

export type RegionExclusion = Extract<ExclusionReason, "region_unverified" | "cross_market_duplicate" | "converted_price">;

/** True for rows that need region provenance to count (Soldgraph eBay sold). */
export function isRegionChecked(ev: Pick<ValuationEvidence, "sourceId">): boolean {
  return REGION_CHECKED_SOURCE_IDS.has(ev.sourceId);
}

function regionCheck(ev: ValuationEvidence): RegionExclusion | null {
  if (ev.priceIsConverted === true) return "converted_price";
  if (ev.locationFilter !== "domestic") return "region_unverified";
  if (ev.itemCountry && ev.itemCountry !== MARKET_COUNTRY[ev.market]) return "region_unverified";
  return null;
}

/**
 * Region decision for every row of one pin's evidence (all markets), in the
 * same order: null = may count (or not region-checked), otherwise why it is
 * left out. Pure; nothing is removed from storage.
 */
export function regionExclusions(evidence: readonly ValuationEvidence[]): Array<RegionExclusion | null> {
  const out = evidence.map(ev => (isRegionChecked(ev) ? regionCheck(ev) : null));
  // The same item, region-verified in more than one market: one owner at most.
  const byItem = new Map<string, number[]>();
  evidence.forEach((ev, i) => {
    if (!isRegionChecked(ev) || out[i] !== null || !ev.externalId) return;
    byItem.set(ev.externalId, [...(byItem.get(ev.externalId) ?? []), i]);
  });
  for (const idx of byItem.values()) {
    if (new Set(idx.map(i => evidence[i].market)).size < 2) continue;
    const owners = new Set(
      idx.filter(i => evidence[i].itemCountry === MARKET_COUNTRY[evidence[i].market]).map(i => evidence[i].market),
    );
    const owner = owners.size === 1 ? [...owners][0] : null;
    for (const i of idx) if (evidence[i].market !== owner) out[i] = "cross_market_duplicate";
  }
  return out;
}

export type ConfidenceReasonCode =
  | "no_evidence"
  | "sold_evidence"
  | "listing_evidence"
  | "recency"
  | "spread"
  | "match_quality"
  | "possible_offer"
  | "cap_listings_only"
  | "cap_few_sales";

export interface ConfidenceReason {
  code: ConfidenceReasonCode;
  /** Points this reason added (negative for penalties and caps). */
  points: number;
  /** The measured value behind the points (count, share or ratio), when there is one. */
  value?: number;
}

export interface ValuationConfidence {
  score: number;
  band: ConfidenceBand;
  reasons: ConfidenceReason[];
}

/** market_valuations.sources entry: exactly these three keys (049 CHECK). */
export interface ValuationSourceAttribution {
  source_id: string;
  count: number;
  latest_date: string;
}

/**
 * market_valuations.source_summaries entry (055 CHECK: only these keys).
 * Sold sources carry latest_date and median; active sources also low/high.
 */
export interface ValuationSourceSummary {
  source_id: string;
  provider: string;
  evidence_type: "sold" | "active";
  count: number;
  latest_date: string | null;
  median: number | null;
  low?: number | null;
  high?: number | null;
}

export interface MarketValuationV2 {
  market: MarketCode;
  currency: string;
  basis: ValuationBasis;
  low: number | null;
  fair: number | null;
  high: number | null;
  /** Sold rows behind the figures (after trimming). */
  soldCount: number;
  /** Active rows behind the figures (after trimming); 0 when basis is "sold". */
  activeCount: number;
  confidence: ValuationConfidence;
  sources: ValuationSourceAttribution[];
  /** One derived summary per source id (never merged across sources). */
  sourceSummaries: ValuationSourceSummary[];
  /** Rows left out, by reason. Diagnostic only: never stored or returned to clients. */
  excluded: Partial<Record<ExclusionReason, number>>;
  methodVersion: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const cfg = VALUATION_V2_CONFIG;

interface Point {
  ev: ValuationEvidence;
  price: number;
  weight: number;
  sold: boolean;
  possibleOffer: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Recency weight for a sale `ageDays` old, or null when too old to use. */
export function recencyWeight(ageDays: number): number | null {
  if (!Number.isFinite(ageDays)) return null;
  const age = Math.max(0, ageDays);
  if (age <= cfg.fullWeightDays) return 1;
  if (age > cfg.maxAgeDays) return null;
  return 1 - (1 - cfg.oldestWeight) * ((age - cfg.fullWeightDays) / (cfg.maxAgeDays - cfg.fullWeightDays));
}

/** Unweighted linear-interpolated quantile of sorted values (same as v1). */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

/**
 * Weighted quantile with midpoint interpolation: each point sits at
 * (cumulative weight − own weight / 2) / total weight. With equal weights the
 * median equals the ordinary median.
 */
export function weightedQuantile(values: Array<{ value: number; weight: number }>, q: number): number {
  const pts = values.filter(v => v.weight > 0).sort((a, b) => a.value - b.value);
  if (pts.length === 0) throw new Error("weightedQuantile: no points");
  const total = pts.reduce((s, p) => s + p.weight, 0);
  let cum = 0;
  const pos = pts.map(p => {
    cum += p.weight;
    return (cum - p.weight / 2) / total;
  });
  if (q <= pos[0]) return pts[0].value;
  if (q >= pos[pos.length - 1]) return pts[pts.length - 1].value;
  for (let i = 1; i < pts.length; i++) {
    if (q <= pos[i]) {
      const t = (q - pos[i - 1]) / (pos[i] - pos[i - 1]);
      return pts[i - 1].value + t * (pts[i].value - pts[i - 1].value);
    }
  }
  return pts[pts.length - 1].value;
}

/** 1.5×IQR trim on prices, when there are enough points. Never empties the set. */
function trimOutliers(points: Point[]): { kept: Point[]; trimmed: number } {
  if (points.length < cfg.minPointsForTrim) return { kept: points, trimmed: 0 };
  const sorted = points.map(p => p.price).sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const kept = points.filter(p => p.price >= q1 - 1.5 * iqr && p.price <= q3 + 1.5 * iqr);
  return kept.length > 0 ? { kept, trimmed: points.length - kept.length } : { kept: points, trimmed: 0 };
}

/** The basis a stored row's counts imply. Shared with the read route so both agree. */
export function basisForCounts(soldCount: number, activeCount: number): ValuationBasis {
  if (soldCount <= 0 && activeCount <= 0) return "none";
  if (soldCount < cfg.minSoldForRange && activeCount > 0) return "listings";
  return "sold";
}

function bandForScore(score: number): Exclude<ConfidenceBand, "insufficient"> {
  if (score >= cfg.highBandMinScore) return "high";
  if (score >= cfg.mediumBandMinScore) return "medium";
  return "low";
}

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10);
}

function attribution(points: Point[]): ValuationSourceAttribution[] {
  const by = new Map<string, { count: number; latest: string | null; sold: boolean }>();
  for (const p of points) {
    const d = dateOnly(p.sold ? p.ev.soldDate : p.ev.seenAt);
    const cur = by.get(p.ev.sourceId) ?? { count: 0, latest: null, sold: p.sold };
    cur.count += 1;
    if (d && (!cur.latest || d > cur.latest)) cur.latest = d;
    by.set(p.ev.sourceId, cur);
  }
  return [...by.entries()]
    .filter(([, v]) => v.latest !== null)
    .sort(([ia, a], [ib, b]) => Number(b.sold) - Number(a.sold) || b.count - a.count || ia.localeCompare(ib))
    .map(([id, v]) => ({ source_id: id, count: v.count, latest_date: v.latest as string }));
}

/** Provider part of a market_sources id ("soldgraph:ebay_gb_sold" → "soldgraph"). */
export function providerOf(sourceId: string): string {
  const i = sourceId.indexOf(":");
  return i > 0 ? sourceId.slice(0, i) : sourceId;
}

/**
 * Per-source summaries from usable (pre-trim) points. Keyed by source id
 * only, so two providers' rows for the same marketplace never share an entry.
 */
function sourceSummaries(points: readonly Point[]): ValuationSourceSummary[] {
  const by = new Map<string, { sold: boolean; prices: number[]; latest: string | null }>();
  for (const p of points) {
    const cur = by.get(p.ev.sourceId) ?? { sold: p.sold, prices: [], latest: null };
    cur.prices.push(p.price);
    const d = dateOnly(p.sold ? p.ev.soldDate : p.ev.seenAt);
    if (d && (!cur.latest || d > cur.latest)) cur.latest = d;
    by.set(p.ev.sourceId, cur);
  }
  return [...by.entries()]
    .sort(([ia, a], [ib, b]) => Number(b.sold) - Number(a.sold) || b.prices.length - a.prices.length || ia.localeCompare(ib))
    .map(([id, v]) => {
      const m = median(v.prices);
      const base: ValuationSourceSummary = {
        source_id: id,
        provider: providerOf(id),
        evidence_type: v.sold ? "sold" : "active",
        count: v.prices.length,
        latest_date: v.latest,
        median: m === null ? null : round2(m),
      };
      if (v.sold) return base;
      return { ...base, low: round2(Math.min(...v.prices)), high: round2(Math.max(...v.prices)) };
    });
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return quantile(s, 0.5);
}

export interface ValuationOptions {
  /** Epoch ms used for recency. Required so results are deterministic. */
  now: number;
}

/** Value one pin in one market from its matched evidence. */
export function computeMarketValuation(
  market: MarketCode,
  evidence: readonly ValuationEvidence[],
  opts: ValuationOptions,
): MarketValuationV2 {
  const currency = MARKET_CURRENCY[market];
  const excluded: MarketValuationV2["excluded"] = {};
  const exclude = (r: ExclusionReason, n = 1) => {
    if (n > 0) excluded[r] = (excluded[r] ?? 0) + n;
  };

  const sold: Point[] = [];
  const active: Point[] = [];
  const offerMedians: number[] = [];
  const region = regionExclusions(evidence);

  for (const [i, ev] of evidence.entries()) {
    if (ev.market !== market) continue;
    const regionReason = region[i];
    if (regionReason) {
      exclude(regionReason);
      continue;
    }
    if (ev.currency !== currency) {
      exclude("currency_mismatch");
      continue;
    }
    const isSold = ev.evidenceType === "sold" && ev.priceKind !== "active";
    if (isSold && typeof ev.medianExcludingBestOffer === "number" && ev.medianExcludingBestOffer > 0) {
      offerMedians.push(ev.medianExcludingBestOffer);
    }
    if (isSold && ev.bestOfferAccepted === true) {
      exclude("best_offer");
      continue;
    }
    if (ev.price === null || !Number.isFinite(ev.price) || ev.price <= 0) {
      exclude("no_sale_price");
      continue;
    }
    if (isSold) {
      const t = ev.soldDate ? Date.parse(ev.soldDate) : NaN;
      if (Number.isNaN(t)) {
        exclude("no_sale_date");
        continue;
      }
      const w = recencyWeight((opts.now - t) / DAY_MS);
      if (w === null) {
        exclude("too_old");
        continue;
      }
      sold.push({ ev, price: ev.price, weight: w, sold: true, possibleOffer: ev.priceKind === "sold_possible_offer" });
    } else {
      const seen = ev.seenAt ? Date.parse(ev.seenAt) : NaN;
      if (!Number.isNaN(seen) && (opts.now - seen) / DAY_MS > cfg.activeMaxAgeDays) {
        exclude("stale_listing");
        continue;
      }
      active.push({ ev, price: ev.price, weight: cfg.activeWeight, sold: false, possibleOffer: false });
    }
  }

  const useActive = sold.length < cfg.minSoldForRange && active.length > 0;
  const candidate = useActive ? [...sold, ...active] : sold;
  const { kept, trimmed } = trimOutliers(candidate);
  exclude("outlier", trimmed);

  const keptSold = kept.filter(p => p.sold);
  const keptActive = kept.filter(p => !p.sold);
  const basis: ValuationBasis = kept.length === 0 ? "none" : useActive && keptActive.length > 0 ? "listings" : "sold";

  let low: number | null = null;
  let fair: number | null = null;
  let high: number | null = null;

  if (kept.length > 0) {
    const weighted = kept.map(p => ({ value: p.price, weight: p.weight }));
    fair = weightedQuantile(weighted, 0.5);

    if (basis === "listings") {
      const soldAnchor = keptSold.length > 0
        ? weightedQuantile(keptSold.map(p => ({ value: p.price, weight: p.weight })), 0.5)
        : median(offerMedians);
      if (soldAnchor !== null) fair = Math.min(fair, soldAnchor * (1 + cfg.fairCapOverSold));
    }

    if (kept.length >= cfg.minPointsForRange) {
      low = Math.min(weightedQuantile(weighted, cfg.lowQuantile), fair);
      const f = fair;
      // A possibly-Best-Offer price may be above what was paid: it can't lift High past Fair.
      high = Math.max(
        weightedQuantile(kept.map(p => ({ value: p.possibleOffer ? Math.min(p.price, f) : p.price, weight: p.weight })), cfg.highQuantile),
        fair,
      );
    }
  }

  const confidence = scoreConfidence({ basis, kept, keptSold, keptActive });

  return {
    market,
    currency,
    basis,
    low: low === null ? null : round2(low),
    fair: fair === null ? null : round2(fair),
    high: high === null ? null : round2(high),
    soldCount: keptSold.length,
    activeCount: keptActive.length,
    confidence,
    sources: attribution(kept),
    sourceSummaries: sourceSummaries([...sold, ...active]),
    excluded,
    methodVersion: VALUATION_V2_METHOD_VERSION,
  };
}

function scoreConfidence(args: { basis: ValuationBasis; kept: Point[]; keptSold: Point[]; keptActive: Point[] }): ValuationConfidence {
  const { basis, kept, keptSold } = args;
  if (basis === "none") return { score: 0, band: "insufficient", reasons: [{ code: "no_evidence", points: 0 }] };

  const reasons: ConfidenceReason[] = [];
  const add = (code: ConfidenceReasonCode, points: number, value?: number) =>
    reasons.push({ code, points, ...(value !== undefined ? { value } : {}) });

  if (basis === "sold") add("sold_evidence", Math.min(keptSold.length, 10) * 4, keptSold.length);
  else add("listing_evidence", Math.min(kept.length, 5) * 4, kept.length);

  if (keptSold.length > 0) {
    const meanW = keptSold.reduce((s, p) => s + p.weight, 0) / keptSold.length;
    add("recency", Math.round(20 * clamp01((meanW - cfg.oldestWeight) / (1 - cfg.oldestWeight))), round2(meanW));
  } else {
    add("recency", 0);
  }

  if (kept.length >= cfg.minPointsForRange) {
    const sorted = kept.map(p => p.price).sort((a, b) => a - b);
    const med = quantile(sorted, 0.5);
    const ratio = med > 0 ? (quantile(sorted, 0.75) - quantile(sorted, 0.25)) / med : 1;
    add("spread", Math.round(20 * clamp01(1 - ratio)), round2(ratio));
  } else {
    add("spread", 0);
  }

  const quality =
    kept.reduce((s, p) => s + (p.ev.matchScore === null ? 0 : clamp01((p.ev.matchScore - cfg.matchScoreFloor) / cfg.matchScoreRange)), 0) /
    kept.length;
  add("match_quality", Math.round(20 * quality), round2(quality));

  if (keptSold.length > 0) {
    const share = keptSold.filter(p => p.possibleOffer).length / keptSold.length;
    if (share > 0) add("possible_offer", -Math.round(10 * share), round2(share));
  }

  let score = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)));
  const capTo = (ceiling: number, code: ConfidenceReasonCode) => {
    if (score > ceiling) {
      add(code, ceiling - score);
      score = ceiling;
    }
  };
  if (basis === "listings") capTo(cfg.mediumBandMinScore - 1, "cap_listings_only");
  else if (keptSold.length < cfg.minSoldForRange) capTo(cfg.mediumBandMinScore - 1, "cap_few_sales");
  else if (keptSold.length < cfg.minSoldForHighBand) capTo(cfg.highBandMinScore - 1, "cap_few_sales");

  return { score, band: bandForScore(score), reasons };
}

/** Value one pin in every market (UK, FR, US order). */
export function computePinValuations(evidence: readonly ValuationEvidence[], opts: ValuationOptions): MarketValuationV2[] {
  return MARKET_PRIORITY.map(m => computeMarketValuation(m, evidence, opts));
}

/** The first market, in UK > FR > US order, with a Fair value. */
export function primaryMarket<T extends { market: MarketCode; fair?: number | null }>(valuations: readonly T[]): MarketCode | null {
  for (const m of MARKET_PRIORITY) {
    const v = valuations.find(x => x.market === m);
    if (v && v.fair !== null && v.fair !== undefined) return m;
  }
  return null;
}
