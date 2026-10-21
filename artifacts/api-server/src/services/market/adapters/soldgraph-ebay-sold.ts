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
 *
 * Region (SG-13, #450): `country` picks the eBay website only, and results
 * otherwise include international sellers with prices converted to the
 * website's currency. Every search therefore sends `item_location`
 * (default "domestic": sellers in the website's country only, per
 * Soldgraph's docs), configurable per country with EBAY_SOLD_ITEM_LOCATION
 * or the `itemLocation` option. Each row records the website searched, the
 * filter sent, the currency the row stated, and the ISO-2 country parsed
 * from `location_text`. The location text, any town and `seller_text` are
 * never kept.
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
  currencyCode,
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
import { DEFAULT_EBAY_SOLD_ITEM_LOCATION, parseItemCountry, type ItemLocation } from "../region";

/** Provisional route name; confirm against a recorded response (SG-08). */
export const SOLDGRAPH_EBAY_SOLD_ROUTE = "ebay/sold";

export const EBAY_HOSTS = ["ebay.co.uk", "ebay.fr", "ebay.com"] as const;

export type EbaySoldCountry = SoldgraphCountry;

/**
 * `item_location` sent for each eBay website. "domestic" restricts results
 * to sellers in that website's country (Soldgraph docs, confirmed by the
 * maintainer 2026-10-19). Change a value here (or pass `itemLocation`) to
 * search differently; rows fetched without "domestic" never count as
 * regional evidence.
 */
export const EBAY_SOLD_ITEM_LOCATION: Readonly<Record<EbaySoldCountry, ItemLocation>> = {
  uk: DEFAULT_EBAY_SOLD_ITEM_LOCATION,
  fr: DEFAULT_EBAY_SOLD_ITEM_LOCATION,
  us: DEFAULT_EBAY_SOLD_ITEM_LOCATION,
};

export const EBAY_SOLD_SOURCE_IDS: Readonly<Record<EbaySoldCountry, string>> = {
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
  const prices = rowPrices(row, ctx, ["sold_price", "price", "sale_price", "displayed_price"]);
  if (prices === "currency_mismatch") return prices;

  const priceField = pick(row, "sold_price", "price", "sale_price", "displayed_price");
  const displayedCurrency = parseMoney(priceField, ctx.lang).currency ?? currencyCode(pick(row, "currency", "currency_code"));

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
    site: ctx.country ?? null,
    locationFilter: ctx.locationFilter ?? null,
    // Country only: the location text and any town in it are not kept.
    itemCountry: parseItemCountry(pick(row, "location_text", "location")),
    displayedCurrency,
    // Soldgraph has no field saying a price was converted (#450), so this
    // stays unknown; the domestic filter is what keeps conversions out.
    priceIsConverted: null,
  };
}

export interface EbaySoldAdapterOptions {
  country: EbaySoldCountry;
  /** Paid searches per pin (default 2). */
  maxQueries?: number;
  /** Pages per search; each completed page costs one credit (default 1, up to 200 rows). */
  maxPages?: number;
  params?: SoldgraphParams;
  /**
   * `item_location` to send. Undefined = EBAY_SOLD_ITEM_LOCATION[country];
   * null = send none (rows are then never regional evidence).
   */
  itemLocation?: ItemLocation | null;
  clock?: () => number;
}

/** The `item_location` an adapter built with these options sends (null = none). */
export function ebaySoldItemLocation(opts: Pick<EbaySoldAdapterOptions, "country" | "itemLocation">): ItemLocation | null {
  return opts.itemLocation === undefined ? EBAY_SOLD_ITEM_LOCATION[opts.country] : opts.itemLocation;
}

export function createSoldgraphEbaySoldAdapter(
  client: SoldgraphClient,
  opts: EbaySoldAdapterOptions,
): MarketplaceAdapter {
  const max = opts.maxQueries ?? SOLDGRAPH_DEFAULT_MAX_QUERIES;
  const lang = COUNTRY_MARKET[opts.country].lang;
  return createSoldgraphAdapter(client, {
    sourceId: EBAY_SOLD_SOURCE_IDS[opts.country],
    route: SOLDGRAPH_EBAY_SOLD_ROUTE,
    country: opts.country,
    evidenceType: "sold",
    params: (() => {
      const itemLocation = ebaySoldItemLocation(opts);
      return itemLocation ? { ...opts.params, item_location: itemLocation } : opts.params;
    })(),
    maxPages: opts.maxPages,
    clock: opts.clock,
    buildQueries: (pin: CataloguePin) => (lang === "fr" ? buildFrenchQueries(pin, max) : buildEnglishQueries(pin, max)),
    mapRow: mapEbaySoldRow,
  });
}
