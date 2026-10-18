/**
 * The default set of marketplace adapters. To add a marketplace (for example
 * Mercari): write one adapter file implementing `MarketplaceAdapter`, add it
 * to this list, and add (then enable) its `market_sources` row.
 *
 * Not wired to any route yet; nothing here is reachable from the mobile app.
 */
import type { SoldgraphClient } from "../../soldgraph/client";
import type { MarketplaceAdapter } from "../adapter";
import { createAdapterRegistry, type AdapterRegistry } from "../registry";
import { createEbayBrowseAdapter, type EbayBrowseSearch } from "./ebay-browse";
import { createSoldgraphEbaySoldAdapter } from "./soldgraph-ebay-sold";
import { createSoldgraphVintedAdapter } from "./soldgraph-vinted-active";
import { createSoldgraphWhatnotAdapter } from "./soldgraph-whatnot-active";

export interface DefaultAdapterDeps {
  soldgraph: SoldgraphClient;
  ebaySearch?: EbayBrowseSearch;
}

export function defaultAdapters(deps: DefaultAdapterDeps): MarketplaceAdapter[] {
  return [
    createSoldgraphEbaySoldAdapter(deps.soldgraph, { country: "uk" }),
    createSoldgraphEbaySoldAdapter(deps.soldgraph, { country: "fr" }),
    createSoldgraphEbaySoldAdapter(deps.soldgraph, { country: "us" }),
    createSoldgraphVintedAdapter(deps.soldgraph, { country: "uk" }),
    createSoldgraphVintedAdapter(deps.soldgraph, { country: "fr" }),
    createSoldgraphWhatnotAdapter(deps.soldgraph),
    createEbayBrowseAdapter({ marketplace: "EBAY_GB", search: deps.ebaySearch }),
    createEbayBrowseAdapter({ marketplace: "EBAY_US", search: deps.ebaySearch }),
  ];
}

export function createDefaultAdapterRegistry(deps: DefaultAdapterDeps): AdapterRegistry {
  return createAdapterRegistry(defaultAdapters(deps));
}
