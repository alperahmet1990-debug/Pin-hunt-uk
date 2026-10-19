/**
 * Soldgraph Vinted active listings (UK and FR). Asking-price evidence only:
 * Vinted has no verified sales, so any row that reports itself sold is
 * dropped as "not_active".
 */
import type { CataloguePin } from "@workspace/pin-repository";
import type { SoldgraphClient, SoldgraphParams } from "../../soldgraph/client";
import type { AdapterRejectionReason, MarketplaceAdapter, NormalisedListing } from "../adapter";
import { buildEnglishQueries, buildFrenchQueries } from "../queries";
import { cleanExternalId, cleanText, parseBool, pick, rowPrices, safeListingUrl, type RawRow } from "./normalise";
import { SOLDGRAPH_DEFAULT_MAX_QUERIES, createSoldgraphAdapter, type RowContext } from "./soldgraph-common";

/** Provisional route name; confirm against a recorded response (SG-08). */
export const SOLDGRAPH_VINTED_ROUTE = "vinted/search";

export const VINTED_HOSTS = ["vinted.co.uk", "vinted.fr", "vinted.com"] as const;

export type VintedCountry = "uk" | "fr";

const SOURCE_IDS: Record<VintedCountry, string> = {
  uk: "soldgraph:vinted_gb_active",
  fr: "soldgraph:vinted_fr_active",
};

const SOLD_STATUSES = new Set(["sold", "closed", "ended", "reserved", "hidden"]);

/** Map one Soldgraph Vinted row. Exported for fixture tests. */
export function mapVintedRow(row: RawRow, ctx: RowContext): NormalisedListing | AdapterRejectionReason {
  const externalId = cleanExternalId(pick(row, "id", "item_id", "listing_id", "external_id"));
  if (!externalId) return "missing_external_id";
  const title = cleanText(pick(row, "title", "name"), 500);
  if (!title) return "missing_title";
  const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
  if (parseBool(pick(row, "is_sold", "sold")) === true || SOLD_STATUSES.has(status)) return "not_active";
  // `price` is the seller's asking price; buyer-protection totals are ignored.
  const prices = rowPrices(row, ctx, ["price", "asking_price", "displayed_price"]);
  if (prices === "currency_mismatch") return prices;

  return {
    sourceId: ctx.sourceId,
    externalId,
    title,
    price: prices.price,
    listedPrice: null,
    shipping: prices.shipping,
    currency: ctx.currency,
    soldDate: null,
    priceKind: "active",
    bestOfferAccepted: null,
    bestOfferAcceptedCount: null,
    medianExcludingBestOffer: null,
    url: safeListingUrl(pick(row, "url", "listing_url", "link"), VINTED_HOSTS),
    condition: cleanText(pick(row, "condition", "status_label", "item_condition"), 100),
  };
}

export interface VintedAdapterOptions {
  country: VintedCountry;
  maxQueries?: number;
  maxPages?: number;
  params?: SoldgraphParams;
  clock?: () => number;
}

export function createSoldgraphVintedAdapter(client: SoldgraphClient, opts: VintedAdapterOptions): MarketplaceAdapter {
  const max = opts.maxQueries ?? SOLDGRAPH_DEFAULT_MAX_QUERIES;
  return createSoldgraphAdapter(client, {
    sourceId: SOURCE_IDS[opts.country],
    route: SOLDGRAPH_VINTED_ROUTE,
    country: opts.country,
    evidenceType: "active",
    params: opts.params,
    maxPages: opts.maxPages,
    clock: opts.clock,
    buildQueries: (pin: CataloguePin) =>
      opts.country === "fr" ? buildFrenchQueries(pin, max) : buildEnglishQueries(pin, max),
    mapRow: mapVintedRow,
  });
}
