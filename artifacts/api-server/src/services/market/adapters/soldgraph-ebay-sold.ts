/**
 * Soldgraph eBay sold listings. One adapter for every eBay market; the market
 * is chosen with Soldgraph's `country=uk|fr|us` (priority UK > FR > US).
 *
 * Best Offer (#403): Soldgraph reports `best_offer_accepted` but not the
 * accepted price. So:
 *   best_offer_accepted === false  → priceKind "sold", price = sale price
 *   best_offer_accepted === true   → priceKind "sold_possible_offer",
 *                                    price = null, listedPrice = listed price
 *   not reported                   → priceKind "sold_possible_offer",
 *                                    price = reported price
 * `best_offer_accepted_count` and `median_excluding_best_offer` are kept on
 * every row. Rows with no parseable sold date are dropped (049 requires one).
 */
import type { CataloguePin } from "@workspace/pin-repository";
import type { SoldgraphClient, SoldgraphParams } from "../../soldgraph/client";
import type { AdapterRejectionReason, MarketplaceAdapter, NormalisedListing } from "../adapter";
import { buildEnglishQueries, buildFrenchQueries } from "../queries";
import {
  cleanExternalId,
  cleanText,
  parseBool,
  parseCount,
  parseDate,
  parseMoney,
  pick,
  rowPrices,
  safeListingUrl,
  type RawRow,
} from "./normalise";
import {
  COUNTRY_MARKET,
  SOLDGRAPH_DEFAULT_MAX_QUERIES,
  createSoldgraphAdapter,
  type RowContext,
  type SoldgraphCountry,
} from "./soldgraph-common";

/** Provisional route name; confirm against a recorded response (SG-08). */
export const SOLDGRAPH_EBAY_SOLD_ROUTE = "ebay/sold";

export const EBAY_HOSTS = ["ebay.co.uk", "ebay.fr", "ebay.com"] as const;

export type EbaySoldCountry = SoldgraphCountry;

const SOURCE_IDS: Record<EbaySoldCountry, string> = {
  uk: "soldgraph:ebay_gb_sold",
  fr: "soldgraph:ebay_fr_sold",
  us: "soldgraph:ebay_us_sold",
};

/** Map one Soldgraph eBay sold row. Exported for fixture tests. */
export function mapEbaySoldRow(row: RawRow, ctx: RowContext): NormalisedListing | AdapterRejectionReason {
  const externalId = cleanExternalId(pick(row, "item_id", "id", "listing_id", "external_id"));
  if (!externalId) return "missing_external_id";
  const title = cleanText(pick(row, "title", "name"), 500);
  if (!title) return "missing_title";
  const soldDate = parseDate(pick(row, "sold_date", "sold_at", "end_date", "ended_at", "date_sold"), ctx.market, ctx.now);
  if (!soldDate) return "missing_sold_date";
  const prices = rowPrices(row, ctx, ["sold_price", "price", "sale_price"]);
  if (prices === "currency_mismatch") return prices;

  const bestOfferAccepted = parseBool(pick(row, "best_offer_accepted"));
  const median = parseMoney(pick(row, "median_excluding_best_offer"), ctx.lang);

  return {
    sourceId: ctx.sourceId,
    externalId,
    title,
    // Never record the listed price of an accepted Best Offer as a sale price.
    price: bestOfferAccepted === true ? null : prices.price,
    listedPrice: bestOfferAccepted === true ? prices.price : null,
    shipping: prices.shipping,
    currency: ctx.currency,
    soldDate,
    priceKind: bestOfferAccepted === false ? "sold" : "sold_possible_offer",
    bestOfferAccepted,
    bestOfferAcceptedCount: parseCount(pick(row, "best_offer_accepted_count")),
    medianExcludingBestOffer: median.currency && median.currency !== ctx.currency ? null : median.amount,
    url: safeListingUrl(pick(row, "url", "item_url", "listing_url", "link"), EBAY_HOSTS),
    condition: cleanText(pick(row, "condition", "condition_name", "item_condition"), 100),
  };
}

export interface EbaySoldAdapterOptions {
  country: EbaySoldCountry;
  /** Paid searches per pin (default 2). */
  maxQueries?: number;
  /** Pages per search; each completed page costs one credit (default 1, up to 200 rows). */
  maxPages?: number;
  params?: SoldgraphParams;
  clock?: () => number;
}

export function createSoldgraphEbaySoldAdapter(
  client: SoldgraphClient,
  opts: EbaySoldAdapterOptions,
): MarketplaceAdapter {
  const max = opts.maxQueries ?? SOLDGRAPH_DEFAULT_MAX_QUERIES;
  const lang = COUNTRY_MARKET[opts.country].lang;
  return createSoldgraphAdapter(client, {
    sourceId: SOURCE_IDS[opts.country],
    route: SOLDGRAPH_EBAY_SOLD_ROUTE,
    country: opts.country,
    evidenceType: "sold",
    params: opts.params,
    maxPages: opts.maxPages,
    clock: opts.clock,
    buildQueries: (pin: CataloguePin) => (lang === "fr" ? buildFrenchQueries(pin, max) : buildEnglishQueries(pin, max)),
    mapRow: mapEbaySoldRow,
  });
}
