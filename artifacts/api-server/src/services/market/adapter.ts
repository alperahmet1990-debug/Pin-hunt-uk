/**
 * Marketplace adapter interface (SG-03, #406).
 *
 * An adapter turns one marketplace source (provider × marketplace × market ×
 * sold/active) into a stream of `NormalisedListing` rows that map one-to-one
 * onto the `market_listings` columns of migration 049 (#404):
 *
 *   NormalisedListing      market_listings
 *   ─────────────────      ───────────────
 *   sourceId            →  source_id        (a market_sources.id)
 *   externalId          →  external_id
 *   title               →  title
 *   price               →  price            (null = unknown or not a sale price)
 *   shipping            →  shipping         (null = unknown, never "free")
 *   currency            →  currency
 *   soldDate            →  sold_date        (required when priceKind is not "active")
 *   priceKind           →  price_kind
 *   bestOfferAccepted   →  best_offer_accepted
 *   url                 →  listing_url
 *
 * `listedPrice`, `bestOfferAcceptedCount`, `medianExcludingBestOffer` and
 * `condition` have no column in 049; they are kept in memory for the
 * valuation step.
 *
 * Normalised rows deliberately carry **no image URLs and no seller details**
 * (#403 build notes): adapters copy an explicit allow-list of fields, so
 * anything else in a provider response is dropped.
 *
 * Adding a marketplace (for example Mercari) needs one adapter file that
 * implements `MarketplaceAdapter`, its entry in `adapters/index.ts`, and one
 * `market_sources` row. Nothing else changes.
 */
import type { CataloguePin } from "@workspace/pin-repository";
import type { MatchLang } from "./matching";

/** market_sources.market. */
export type Market = "UK" | "US" | "FR";

/** market_sources.evidence_type. */
export type EvidenceType = "sold" | "active";

/**
 * market_listings.price_kind.
 * - `sold`: a completed sale at `price` (Soldgraph says it was not a Best Offer).
 * - `sold_possible_offer`: a completed sale that was, or may have been, a
 *   Best Offer. When `bestOfferAccepted` is true, `price` is null because the
 *   accepted price is unknown.
 * - `active`: a current asking price.
 */
export type PriceKind = "sold" | "sold_possible_offer" | "active";

export interface NormalisedListing {
  /** market_sources.id, e.g. "soldgraph:ebay_gb_sold". */
  sourceId: string;
  /** The marketplace's own item id (1–200 chars). */
  externalId: string;
  /** Listing title (at most 500 chars). */
  title: string;
  /**
   * The price this row is evidence for, in `currency`, or null when unknown.
   * Never the listed price of an accepted Best Offer.
   */
  price: number | null;
  /**
   * Only for sold rows with `bestOfferAccepted === true`: the listed price,
   * which is NOT the sale price. Never use it as sold-price evidence.
   */
  listedPrice: number | null;
  /** Shipping in `currency`; null when unknown (never assumed free). */
  shipping: number | null;
  /** ISO 4217, always the source's currency (other currencies are rejected). */
  currency: string;
  /** ISO timestamp of the sale; null for active rows. */
  soldDate: string | null;
  priceKind: PriceKind;
  /** Sold rows: Soldgraph's best_offer_accepted. Null when not reported or active. */
  bestOfferAccepted: boolean | null;
  /** Sold rows: Soldgraph's best_offer_accepted_count, when reported. */
  bestOfferAcceptedCount: number | null;
  /** Sold rows: Soldgraph's median_excluding_best_offer (in `currency`), when reported. */
  medianExcludingBestOffer: number | null;
  /** https link on the marketplace's own domain, query string removed; null otherwise. */
  url: string | null;
  condition: string | null;
}

/**
 * Why an adapter dropped a provider row before matching. These are
 * adapter-level (data quality) reasons, separate from the title-matching
 * `REJECTION_REASONS` in matching.ts. Never rename one; add new values.
 */
export const ADAPTER_REJECTION_REASONS = [
  "missing_external_id",  // no usable item id
  "missing_title",        // no usable title
  "missing_sold_date",    // sold row without a parseable sold date (049 requires one)
  "currency_mismatch",    // price in a currency other than the source's
  "not_active",           // active-only source returned a sold/ended listing
  "not_buy_it_now",       // Buy-It-Now-only source returned an auction
  "duplicate",            // same external id twice in one search
  "invalid_row",          // not an object
] as const;
export type AdapterRejectionReason = (typeof ADAPTER_REJECTION_REASONS)[number];

export type AdapterRejectionCounts = Partial<Record<AdapterRejectionReason, number>>;

export interface AdapterSearchResult {
  sourceId: string;
  query: string;
  listings: NormalisedListing[];
  /** Rows the adapter dropped, by reason. */
  rejected: AdapterRejectionCounts;
  /** Rows the provider returned, before any were dropped. */
  received: number;
  /** The provider had more pages than the page cap allowed. */
  truncated: boolean;
}

export interface AdapterSearchOptions {
  /** pins.id, passed through to provider usage records. */
  pinId?: string;
}

export interface MarketplaceAdapter {
  /** market_sources.id. Unique across the registry. */
  readonly sourceId: string;
  /** market_sources.provider, e.g. "soldgraph", "ebay_browse". */
  readonly provider: string;
  readonly market: Market;
  /** ISO 4217 currency of the source; rows in another currency are rejected. */
  readonly currency: string;
  readonly evidenceType: EvidenceType;
  /** Title language hint for matchListing v2. */
  readonly lang: MatchLang;
  /** Credits one search() costs (0 for free APIs). Used for planning only. */
  readonly creditsPerSearch: number;
  /**
   * Environment variable that must equal "true" for this adapter to run
   * (provider kill switch). Undefined = no kill switch.
   */
  readonly killSwitchEnv?: string;
  /** Search strings for a pin, most specific first, already capped. */
  buildQueries(pin: CataloguePin): string[];
  /**
   * Identifies the billable call `search(query)` would make. Two queries with
   * the same key are the same paid search and are only run once per pin.
   */
  searchKey(query: string): string;
  search(query: string, opts?: AdapterSearchOptions): Promise<AdapterSearchResult>;
}

/** Normalise a query for de-duplication: case and whitespace insensitive. */
export function normaliseQueryKey(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Increment a rejection counter. */
export function countRejection(counts: AdapterRejectionCounts, reason: AdapterRejectionReason): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}
