/**
 * The Soldgraph sources the refresh can run, with the route and `country`
 * each one sends (the same values the adapters use), so the single probe can
 * call the client directly and the refresh can build adapters with a chosen
 * number of queries per source.
 *
 * eBay Browse (v1 asking prices) is deliberately not offered: v1 already
 * refreshes it, and this script is for the Soldgraph pilot.
 */
import type { CataloguePin } from "@workspace/pin-repository";
import type { SoldgraphClient } from "../../soldgraph/client";
import type { AdapterRejectionReason, MarketplaceAdapter, NormalisedListing } from "../adapter";
import type { RawRow } from "../adapters/normalise";
import {
  COUNTRY_MARKET,
  type RowContext,
  type SoldgraphCountry,
} from "../adapters/soldgraph-common";
import type { ItemLocation } from "../region";
import {
  EBAY_SOLD_ITEM_LOCATION,
  SOLDGRAPH_EBAY_SOLD_ROUTE,
  createSoldgraphEbaySoldAdapter,
  mapEbaySoldRow,
} from "../adapters/soldgraph-ebay-sold";
import {
  SOLDGRAPH_VINTED_ROUTE,
  createSoldgraphVintedAdapter,
  mapVintedRow,
} from "../adapters/soldgraph-vinted-active";
import {
  SOLDGRAPH_WHATNOT_ROUTE,
  createSoldgraphWhatnotAdapter,
  mapWhatnotRow,
} from "../adapters/soldgraph-whatnot-active";
import { createAdapterRegistry } from "../registry";

export interface RefreshSourceSpec {
  id: string;
  route: string;
  country: SoldgraphCountry;
  mapRow: (row: RawRow, ctx: RowContext) => NormalisedListing | AdapterRejectionReason;
  /** `item_location` every search of this source sends (#450); null = none. */
  itemLocation: ItemLocation | null;
  build(client: SoldgraphClient, maxQueries: number, clock?: () => number): MarketplaceAdapter;
}

export const REFRESH_SOURCES: readonly RefreshSourceSpec[] = [
  {
    id: "soldgraph:ebay_gb_sold", route: SOLDGRAPH_EBAY_SOLD_ROUTE, country: "uk", mapRow: mapEbaySoldRow,
    itemLocation: EBAY_SOLD_ITEM_LOCATION.uk,
    build: (c, maxQueries, clock) => createSoldgraphEbaySoldAdapter(c, { country: "uk", itemLocation: EBAY_SOLD_ITEM_LOCATION.uk, maxQueries, maxPages: 1, clock }),
  },
  {
    id: "soldgraph:ebay_fr_sold", route: SOLDGRAPH_EBAY_SOLD_ROUTE, country: "fr", mapRow: mapEbaySoldRow,
    itemLocation: EBAY_SOLD_ITEM_LOCATION.fr,
    build: (c, maxQueries, clock) => createSoldgraphEbaySoldAdapter(c, { country: "fr", itemLocation: EBAY_SOLD_ITEM_LOCATION.fr, maxQueries, maxPages: 1, clock }),
  },
  {
    id: "soldgraph:ebay_us_sold", route: SOLDGRAPH_EBAY_SOLD_ROUTE, country: "us", mapRow: mapEbaySoldRow,
    itemLocation: EBAY_SOLD_ITEM_LOCATION.us,
    build: (c, maxQueries, clock) => createSoldgraphEbaySoldAdapter(c, { country: "us", itemLocation: EBAY_SOLD_ITEM_LOCATION.us, maxQueries, maxPages: 1, clock }),
  },
  {
    id: "soldgraph:vinted_gb_active", route: SOLDGRAPH_VINTED_ROUTE, country: "uk", mapRow: mapVintedRow, itemLocation: null,
    build: (c, maxQueries, clock) => createSoldgraphVintedAdapter(c, { country: "uk", maxQueries, maxPages: 1, clock }),
  },
  {
    id: "soldgraph:vinted_fr_active", route: SOLDGRAPH_VINTED_ROUTE, country: "fr", mapRow: mapVintedRow, itemLocation: null,
    build: (c, maxQueries, clock) => createSoldgraphVintedAdapter(c, { country: "fr", maxQueries, maxPages: 1, clock }),
  },
  {
    id: "soldgraph:whatnot_us_active", route: SOLDGRAPH_WHATNOT_ROUTE, country: "us", mapRow: mapWhatnotRow, itemLocation: null,
    build: (c, maxQueries, clock) => createSoldgraphWhatnotAdapter(c, { maxQueries, maxPages: 1, clock }),
  },
];

export const REFRESH_SOURCE_IDS: readonly string[] = REFRESH_SOURCES.map(s => s.id);

export function refreshSource(id: string): RefreshSourceSpec | undefined {
  return REFRESH_SOURCES.find(s => s.id === id);
}

/** Row context for mapping one source's raw rows (probe only). */
export function rowContext(spec: RefreshSourceSpec, now: number): RowContext {
  const { market, currency, lang } = COUNTRY_MARKET[spec.country];
  return { sourceId: spec.id, market, currency, lang, now, country: spec.country, locationFilter: spec.itemLocation };
}

/** The query parameters a search of this source sends besides `q` (probe). */
export function sourceParams(spec: RefreshSourceSpec): { country: SoldgraphCountry; item_location?: ItemLocation } {
  return spec.itemLocation ? { country: spec.country, item_location: spec.itemLocation } : { country: spec.country };
}

/** The `item_location` filter for each requested source that sends one (cache matching, output). */
export function locationFilters(sourceIds: readonly string[]): Map<string, ItemLocation> {
  const out = new Map<string, ItemLocation>();
  for (const id of sourceIds) {
    const spec = refreshSource(id);
    if (spec?.itemLocation) out.set(id, spec.itemLocation);
  }
  return out;
}

/** "item_location=domestic" or "no item_location filter", for terminal output. */
export function describeFilter(spec: Pick<RefreshSourceSpec, "itemLocation" | "route">): string {
  if (spec.itemLocation) return `item_location=${spec.itemLocation}`;
  return spec.route === SOLDGRAPH_EBAY_SOLD_ROUTE ? "no item_location filter (rows will not count as regional evidence)" : "no item_location filter";
}

/**
 * Adapters for the requested sources, in registry priority order (sold
 * before asking prices, UK > FR > US). Every adapter makes at most
 * `maxQueries` one-page searches per pin.
 */
export function buildRefreshAdapters(
  client: SoldgraphClient,
  sourceIds: readonly string[],
  maxQueries: number,
  clock?: () => number,
): MarketplaceAdapter[] {
  const wanted = new Set(sourceIds);
  const adapters = REFRESH_SOURCES.filter(s => wanted.has(s.id)).map(s => s.build(client, maxQueries, clock));
  return createAdapterRegistry(adapters).list();
}

/** Planning only: a client that refuses every call, so a dry run can never spend. */
export const PLANNING_CLIENT: SoldgraphClient = {
  async search() {
    throw new Error("planning client: no searches in a dry run");
  },
};

/** The first query the adapter would send for this pin (probe). */
export function firstQuery(adapter: MarketplaceAdapter, pin: CataloguePin): string | null {
  return adapter.buildQueries(pin)[0] ?? null;
}
