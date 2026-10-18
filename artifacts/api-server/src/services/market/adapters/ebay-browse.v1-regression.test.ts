/**
 * SG-03 (#406) regression: the eBay Browse adapter produces exactly what v1
 * does today. Both paths call the real services/ebay.ts searchListings with
 * the same faked eBay responses (no network), and every v1 field the
 * adapter carries must be identical. Only imageUrl and sellerLocation are
 * left out of the normalised row, by design (#403).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchListings, type EbayListing } from "../../ebay";
import { buildSearchQueries as valuationBuildSearchQueries } from "../../valuation";
import { fixturePin, readFixture } from "../__fixtures__/load";
import { createEbayBrowseAdapter, mapEbayBrowseListing } from "./ebay-browse";

const browseBody = readFixture<unknown>("soldgraph/ebay-browse-gb.json");

let searchUrls: URL[];

beforeEach(() => {
  searchUrls = [];
  vi.stubEnv("EBAY_CLIENT_ID", "test-app-id");
  vi.stubEnv("EBAY_CLIENT_SECRET", "test-cert-id");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "test-token", expires_in: 7200 }), { status: 200 });
      }
      searchUrls.push(url);
      return new Response(JSON.stringify(browseBody), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** The v1 fields the normalised row carries, in v1 terms. */
function v1Projection(l: EbayListing) {
  return {
    externalId: l.itemId,
    title: l.title,
    price: l.itemPrice ?? null,
    shipping: l.deliveryPrice ?? null,
    currency: l.currency ?? "GBP",
    url: l.itemUrl ?? null,
    condition: l.condition ?? null,
  };
}

describe("eBay Browse adapter v1 regression (#406)", () => {
  it.each(["EBAY_GB", "EBAY_US"] as const)("%s: same listings, same order, same values as v1 searchListings", async mp => {
    const query = "Disney Hatbox Ghost pin LE 2000";
    const v1 = await searchListings(mp, query);
    const adapter = createEbayBrowseAdapter({ marketplace: mp });
    const res = await adapter.search(query);

    // Same request both times (v1 limit, Buy It Now and location filter, marketplace).
    expect(searchUrls).toHaveLength(2);
    expect(searchUrls[1].toString()).toBe(searchUrls[0].toString());
    expect(searchUrls[0].searchParams.get("limit")).toBe("50");

    const currency = mp === "EBAY_GB" ? "GBP" : "USD";
    expect(res.received).toBe(v1.length);
    expect(res.rejected).toEqual({});
    expect(res.listings.map(({ externalId, title, price, shipping, currency: c, url, condition }) => ({
      externalId, title, price, shipping, currency: c, url, condition,
    }))).toEqual(v1.map(l => ({ ...v1Projection(l), currency: l.currency ?? currency })));
    for (const l of res.listings) {
      expect(l).toMatchObject({ priceKind: "active", soldDate: null, bestOfferAccepted: null, listedPrice: null });
      expect(l.sourceId).toBe(mp === "EBAY_GB" ? "ebay_browse:ebay_gb_active" : "ebay_browse:ebay_us_active");
    }
    // Images and seller location are not carried over.
    expect(v1.some(l => l.imageUrl)).toBe(true);
    expect(JSON.stringify(res.listings)).not.toMatch(/ebayimg|imageUrl|sellerLocation/);
  });

  it("keeps v1's UK link rewrite, cheapest delivery and missing-price handling", async () => {
    const res = await createEbayBrowseAdapter({ marketplace: "EBAY_GB" }).search("q");
    expect(res.listings.map(l => [l.externalId, l.price, l.shipping, l.url])).toEqual([
      ["v1|1|0", 21, 1.2, "https://www.ebay.co.uk/itm/1"],
      ["v1|2|0", 18.5, null, "https://www.ebay.co.uk/itm/2"],
      ["v1|3|0", null, 0, null],
      ["v1|4|0", 9.99, null, null],
    ]);
  });

  it("builds exactly the v1 queries for every fixture pin", () => {
    const adapter = createEbayBrowseAdapter({ marketplace: "EBAY_GB" });
    for (const key of ["hatbox", "steamboat", "tink", "stitchMystery", "princessSet"]) {
      const pin = fixturePin(key);
      expect(adapter.buildQueries(pin)).toEqual(valuationBuildSearchQueries(pin));
    }
  });

  it("is free and has no kill switch, like v1", () => {
    const adapter = createEbayBrowseAdapter({ marketplace: "EBAY_GB" });
    expect(adapter.creditsPerSearch).toBe(0);
    expect(adapter.killSwitchEnv).toBeUndefined();
  });

  it("maps a non-finite v1 price to null rather than NaN", () => {
    const row = mapEbayBrowseListing({ itemId: "x", title: "t", itemPrice: Number.NaN }, "ebay_browse:ebay_gb_active", "GBP");
    expect(row.price).toBeNull();
  });
});
