/**
 * Shared plumbing for Soldgraph-backed adapters: one search() call is one
 * client.search() (one credit per completed page; the client enforces the
 * kill switch, budget and idempotency). Each adapter supplies only its route,
 * params and a row mapper.
 *
 * Route names and response field names are provisional until checked against
 * a recorded Soldgraph response (SG-08). They are kept here and in each
 * adapter's mapper so a correction touches one place.
 */
import type { CataloguePin } from "@workspace/pin-repository";
import type { SoldgraphClient, SoldgraphParams } from "../../soldgraph/client";
import {
  type AdapterRejectionCounts,
  type AdapterRejectionReason,
  type AdapterSearchResult,
  type EvidenceType,
  type Market,
  type MarketplaceAdapter,
  type NormalisedListing,
  countRejection,
  normaliseQueryKey,
} from "../adapter";
import type { MatchLang } from "../matching";
import { isRawRow, type RawRow } from "./normalise";

export const SOLDGRAPH_PROVIDER = "soldgraph";
export const SOLDGRAPH_KILL_SWITCH_ENV = "SOLDGRAPH_ENABLED";

/** Default number of paid searches per pin per Soldgraph source. */
export const SOLDGRAPH_DEFAULT_MAX_QUERIES = 2;

/** Soldgraph's `country` parameter. */
export type SoldgraphCountry = "uk" | "fr" | "us";

export const COUNTRY_MARKET: Record<SoldgraphCountry, { market: Market; currency: string; lang: MatchLang }> = {
  uk: { market: "UK", currency: "GBP", lang: "en" },
  fr: { market: "FR", currency: "EUR", lang: "fr" },
  us: { market: "US", currency: "USD", lang: "en" },
};

export interface RowContext {
  sourceId: string;
  market: Market;
  currency: string;
  lang: MatchLang;
  now: number;
}

export type RowMapper = (row: RawRow, ctx: RowContext) => NormalisedListing | AdapterRejectionReason;

export interface SoldgraphAdapterConfig {
  sourceId: string;
  route: string;
  country: SoldgraphCountry;
  evidenceType: EvidenceType;
  /** Extra fixed query parameters for every search. */
  params?: SoldgraphParams;
  maxPages?: number;
  buildQueries(pin: CataloguePin): string[];
  mapRow: RowMapper;
  clock?: () => number;
}

export function createSoldgraphAdapter(client: SoldgraphClient, cfg: SoldgraphAdapterConfig): MarketplaceAdapter {
  const { market, currency, lang } = COUNTRY_MARKET[cfg.country];
  const now = cfg.clock ?? Date.now;
  const params = cfg.params ?? {};
  const fixedParams = Object.keys(params)
    .sort()
    .map(k => `${k}=${String(params[k])}`)
    .join("&");

  return {
    sourceId: cfg.sourceId,
    provider: SOLDGRAPH_PROVIDER,
    market,
    currency,
    evidenceType: cfg.evidenceType,
    lang,
    creditsPerSearch: Math.max(1, cfg.maxPages ?? 1),
    killSwitchEnv: SOLDGRAPH_KILL_SWITCH_ENV,
    buildQueries: cfg.buildQueries,
    searchKey: query => `${SOLDGRAPH_PROVIDER}|${cfg.route}|${cfg.country}|${fixedParams}|${normaliseQueryKey(query)}`,
    async search(query, opts = {}): Promise<AdapterSearchResult> {
      const res = await client.search<unknown>(
        cfg.route,
        { ...params, q: query, country: cfg.country },
        { pinId: opts.pinId, ...(cfg.maxPages ? { maxPages: cfg.maxPages } : {}) },
      );
      const ctx: RowContext = { sourceId: cfg.sourceId, market, currency, lang, now: now() };
      const listings: NormalisedListing[] = [];
      const rejected: AdapterRejectionCounts = {};
      const seen = new Set<string>();
      for (const row of res.rows) {
        if (!isRawRow(row)) {
          countRejection(rejected, "invalid_row");
          continue;
        }
        const out = cfg.mapRow(row, ctx);
        if (typeof out === "string") {
          countRejection(rejected, out);
          continue;
        }
        if (seen.has(out.externalId)) {
          countRejection(rejected, "duplicate");
          continue;
        }
        seen.add(out.externalId);
        listings.push(out);
      }
      return {
        sourceId: cfg.sourceId,
        query,
        listings,
        rejected,
        received: res.rows.length,
        truncated: res.truncated,
      };
    },
  };
}
