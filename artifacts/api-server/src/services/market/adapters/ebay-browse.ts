/**
 * eBay Browse active listings through the EXISTING `services/ebay.ts`
 * `searchListings` (v1), behind the shared adapter interface, so v1 and the
 * Soldgraph sources share one shape. No behaviour change: same queries
 * (v1 `buildSearchQueries`), same marketplace filter, same items in the same
 * order, same price / delivery / currency / URL / condition values.
 *
 * Only `imageUrl` and `sellerLocation` are left out of the normalised row
 * (no third-party images or seller details, #403). valuation.ts still calls
 * `searchListings` directly and is unchanged.
 */
import type { CataloguePin } from "@workspace/pin-repository";
import { searchListings, type EbayListing, type EbayMarketplace } from "../../ebay";
import { normaliseQueryKey, type MarketplaceAdapter, type NormalisedListing } from "../adapter";
import { buildSearchQueries } from "../matching";

export const EBAY_BROWSE_PROVIDER = "ebay_browse";

const META: Record<EbayMarketplace, { sourceId: string; market: "UK" | "US"; currency: string }> = {
  EBAY_GB: { sourceId: "ebay_browse:ebay_gb_active", market: "UK", currency: "GBP" },
  // No market_sources row is seeded for this id in 049, so the registry keeps
  // it disabled until one is added.
  EBAY_US: { sourceId: "ebay_browse:ebay_us_active", market: "US", currency: "USD" },
};

export type EbayBrowseSearch = (marketplace: EbayMarketplace, query: string) => Promise<EbayListing[]>;

/** Map one v1 EbayListing. Exported for the v1 regression test. */
export function mapEbayBrowseListing(l: EbayListing, sourceId: string, currency: string): NormalisedListing {
  return {
    sourceId,
    externalId: l.itemId,
    title: l.title,
    price: l.itemPrice !== undefined && Number.isFinite(l.itemPrice) ? l.itemPrice : null,
    listedPrice: null,
    shipping: l.deliveryPrice ?? null,
    // Same fallback valuation.ts uses when saving snapshots.
    currency: l.currency ?? currency,
    soldDate: null,
    priceKind: "active",
    bestOfferAccepted: null,
    bestOfferAcceptedCount: null,
    medianExcludingBestOffer: null,
    url: l.itemUrl ?? null,
    condition: l.condition ?? null,
  };
}

export interface EbayBrowseAdapterOptions {
  marketplace: EbayMarketplace;
  /** Defaults to services/ebay.ts searchListings (v1 limit of 50). */
  search?: EbayBrowseSearch;
}

export function createEbayBrowseAdapter(opts: EbayBrowseAdapterOptions): MarketplaceAdapter {
  const { sourceId, market, currency } = META[opts.marketplace];
  const run: EbayBrowseSearch = opts.search ?? ((mp, q) => searchListings(mp, q));
  return {
    sourceId,
    provider: EBAY_BROWSE_PROVIDER,
    market,
    currency,
    evidenceType: "active",
    lang: "en",
    creditsPerSearch: 0,
    buildQueries: (pin: CataloguePin) => buildSearchQueries(pin),
    searchKey: query => `${EBAY_BROWSE_PROVIDER}|${opts.marketplace}|${normaliseQueryKey(query)}`,
    async search(query) {
      const rows = await run(opts.marketplace, query);
      return {
        sourceId,
        query,
        listings: rows.map(l => mapEbayBrowseListing(l, sourceId, currency)),
        rejected: {},
        received: rows.length,
        truncated: false,
      };
    },
  };
}
