/**
 * Types shared by the maintainer-run market refresh (SG-06, #409).
 */
import type { CataloguePin } from "@workspace/pin-repository";
import type { EvidenceType, Market } from "../adapter";
import type { RevalueResult } from "../valuation-v2-service";

/** The market_sources columns the refresh needs (049). */
export interface SourceRow {
  id: string;
  provider: string;
  market: Market;
  evidenceType: EvidenceType;
  enabled: boolean;
  /**
   * Days raw listing rows from this source are kept after last seen. null =
   * no age-based expiry (Soldgraph, migration 055, #446).
   */
  retentionDays: number | null;
}

export interface PinRef {
  /** pins.id (UUID). */
  uuid: string;
  /** pins.pinhunt_id. */
  pinhuntId: string;
  pin: CataloguePin;
}

/** Exactly the market_listings columns the refresh writes (049). */
export interface MarketListingRow {
  source_id: string;
  external_id: string;
  pin_id: string;
  title: string;
  price: number | null;
  shipping: number | null;
  currency: string;
  sold_date: string | null;
  price_kind: "sold" | "sold_possible_offer" | "active";
  best_offer_accepted: boolean | null;
  listing_url: string | null;
  match_score: number;
  accepted: boolean;
  rejection_reason: string | null;
  parsed: Record<string, unknown> | null;
  last_seen_at: string;
  /** null for a source with no age-based expiry (055). The DB trigger enforces it. */
  expires_at: string | null;
  /** Region provenance (054, #450). Null when not recorded. Never seller or town text. */
  site: string | null;
  location_filter: string | null;
  item_country: string | null;
  displayed_currency: string | null;
  price_is_converted: boolean | null;
}

/** An accepted listing already stored, identified by (pin, source, item). */
export interface StoredAcceptedListing {
  pinUuid: string;
  sourceId: string;
  externalId: string;
  matchScore: number | null;
}

export interface ListingKey {
  pinUuid: string;
  sourceId: string;
  externalId: string;
}

export interface BudgetStatus {
  /** UTC "YYYY-MM". */
  month: string;
  usedCredits: number;
  requests: number;
  limitCredits: number;
  hardStop: boolean;
  /** "row" when provider_budgets has a row for the month, else the client's default. */
  origin: "row" | "default";
}

export interface UsageReportRow {
  month: string;
  route: string;
  status: string;
  credits: number;
}

export interface ExpiredCount {
  sourceId: string;
  count: number;
}

/**
 * Everything the refresh reads or writes in the database. The Supabase
 * implementation is in store.ts; tests use an in-memory fake.
 */
export interface RefreshStore {
  loadSources(): Promise<SourceRow[]>;
  /** Pins by pinhunt_id; ids that don't exist are simply absent. */
  loadPins(pinhuntIds: string[]): Promise<PinRef[]>;
  /**
   * Latest market_listings.last_seen_at (any row, accepted or rejected, not
   * expired; rows with no expiry count) per pin and source, keyed `${pinUuid}|${sourceId}`.
   * For a source listed in `locationFilters`, only rows fetched with that
   * location_filter count (so rows fetched without the domestic filter
   * never stop a domestic search from running).
   */
  lastSeen(
    pinUuids: string[],
    sourceIds: string[],
    now: number,
    locationFilters?: ReadonlyMap<string, string | null>,
  ): Promise<Map<string, string>>;
  /** Accepted rows for these (source, item) pairs, on any pin. */
  acceptedFor(pairs: Array<{ sourceId: string; externalId: string }>): Promise<StoredAcceptedListing[]>;
  upsertListings(rows: MarketListingRow[]): Promise<void>;
  deleteListings(keys: ListingKey[]): Promise<void>;
  budget(month: string): Promise<BudgetStatus>;
  /**
   * Rows purge_market_listings() would delete now, per source. Sources with
   * no age-based expiry (retentionDays null) are left out: nothing of theirs
   * is ever deleted by age.
   */
  countExpired(sourceId: string | null, now: number): Promise<ExpiredCount[]>;
  /** Age-based purge of one source (never all sources at once from the CLI). */
  purgeExpired(sourceId: string): Promise<number>;
  usageRows(fromMonth: string): Promise<UsageReportRow[]>;
  budgets(fromMonth: string): Promise<Array<{ month: string; limitCredits: number; hardStop: boolean }>>;
  revalue(pinUuid: string, now: number): Promise<RevalueResult>;
}
