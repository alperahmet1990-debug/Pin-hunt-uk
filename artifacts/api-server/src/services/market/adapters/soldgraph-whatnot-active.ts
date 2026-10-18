/**
 * Soldgraph Whatnot active Buy It Now listings (US source, USD). Asking-price
 * evidence only. Auction rows are dropped as "not_buy_it_now"; Canadian rows
 * priced in CAD are dropped as "currency_mismatch" (no currency conversion).
 */
import type { CataloguePin } from "@workspace/pin-repository";
import type { SoldgraphClient, SoldgraphParams } from "../../soldgraph/client";
import type { AdapterRejectionReason, MarketplaceAdapter, NormalisedListing } from "../adapter";
import { buildEnglishQueries } from "../queries";
import { cleanExternalId, cleanText, parseBool, pick, rowPrices, safeListingUrl, type RawRow } from "./normalise";
import { SOLDGRAPH_DEFAULT_MAX_QUERIES, createSoldgraphAdapter, type RowContext } from "./soldgraph-common";

/** Provisional route name; confirm against a recorded response (SG-08). */
export const SOLDGRAPH_WHATNOT_ROUTE = "whatnot/search";

export const WHATNOT_HOSTS = ["whatnot.com"] as const;

export const WHATNOT_SOURCE_ID = "soldgraph:whatnot_us_active";

/** Map one Soldgraph Whatnot row. Exported for fixture tests. */
export function mapWhatnotRow(row: RawRow, ctx: RowContext): NormalisedListing | AdapterRejectionReason {
  const externalId = cleanExternalId(pick(row, "id", "listing_id", "item_id", "external_id"));
  if (!externalId) return "missing_external_id";
  const title = cleanText(pick(row, "title", "name"), 500);
  if (!title) return "missing_title";
  const format = String(pick(row, "listing_type", "format", "buying_format", "sale_type") ?? "").toLowerCase();
  if (format.includes("auction")) return "not_buy_it_now";
  const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
  if (parseBool(pick(row, "is_sold", "sold")) === true || status === "sold" || status === "ended") return "not_active";
  const prices = rowPrices(row, ctx, ["price", "buy_it_now_price", "asking_price"]);
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
    url: safeListingUrl(pick(row, "url", "listing_url", "link"), WHATNOT_HOSTS),
    condition: cleanText(pick(row, "condition", "item_condition"), 100),
  };
}

export interface WhatnotAdapterOptions {
  maxQueries?: number;
  maxPages?: number;
  params?: SoldgraphParams;
  clock?: () => number;
}

export function createSoldgraphWhatnotAdapter(
  client: SoldgraphClient,
  opts: WhatnotAdapterOptions = {},
): MarketplaceAdapter {
  const max = opts.maxQueries ?? SOLDGRAPH_DEFAULT_MAX_QUERIES;
  return createSoldgraphAdapter(client, {
    sourceId: WHATNOT_SOURCE_ID,
    route: SOLDGRAPH_WHATNOT_ROUTE,
    country: "us",
    evidenceType: "active",
    params: opts.params,
    maxPages: opts.maxPages,
    clock: opts.clock,
    buildQueries: (pin: CataloguePin) => buildEnglishQueries(pin, max),
    mapRow: mapWhatnotRow,
  });
}
