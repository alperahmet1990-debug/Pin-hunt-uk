/**
 * Region-true eBay sold evidence (SG-13, #450): the domestic filter on every
 * eBay sold search, the item-country parser, provenance without location or
 * seller text, and the valuation rules (region_unverified,
 * cross_market_duplicate, converted_price). Pure fakes: no network.
 */
import { describe, expect, it, vi } from "vitest";
import type { SoldgraphClient, SoldgraphSearchResult } from "../soldgraph/client";
import { mapEbaySoldRow, createSoldgraphEbaySoldAdapter } from "./adapters/soldgraph-ebay-sold";
import type { RowContext } from "./adapters/soldgraph-common";
import { DEFAULT_EBAY_SOLD_ITEM_LOCATION, parseItemCountry } from "./region";
import { toListingRow } from "./refresh/refresh";
import { formatValuation } from "./refresh/cli";
import { computeMarketValuation, computePinValuations, regionExclusions, type ValuationEvidence } from "./valuation-v2";
import type { CollectedListing } from "./valuation-v2-service";
import type { MatchResult } from "./matching";

const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

// ─── Item-country parser ─────────────────────────────────────────────────────

describe("parseItemCountry", () => {
  it.each([
    ["London, United Kingdom", "GB"],
    ["Manchester, Greater Manchester, United Kingdom", "GB"],
    ["Paris, France", "FR"],
    ["Marne-la-Vallée, France", "FR"],
    ["from United Kingdom", "GB"],
    ["Located in: United States", "US"],
    ["US", "US"],
    ["United States", "US"],
    ["Orlando, Florida, United States", "US"],
    ["Royaume-Uni", "GB"],
    ["États-Unis", "US"],
    ["de Chine", "CN"],
    ["Hong Kong", "HK"],
  ])("%s → %s", (text, code) => {
    expect(parseItemCountry(text)).toBe(code);
  });

  it.each([
    ["London"],                // a town only
    ["Paris"],                 // a town (and not only in France)
    ["Lafayette, CA"],         // a state code after a comma is never read as a country
    ["Paris, FR"],
    ["Georgia"],               // a country and a US state
    ["Somewhere, Narnia"],
    [""],
    ["   "],
  ])("%s → null (unsure)", text => {
    expect(parseItemCountry(text)).toBeNull();
  });

  it("ignores anything that is not a short string", () => {
    expect(parseItemCountry(undefined)).toBeNull();
    expect(parseItemCountry(42)).toBeNull();
    expect(parseItemCountry({ country: "GB" })).toBeNull();
    expect(parseItemCountry(`${"x".repeat(300)}, France`)).toBeNull();
  });
});

// ─── Adapter: request and provenance ─────────────────────────────────────────

const ROW = {
  id: "item-77",
  title: "Disney Hatbox Ghost pin LE 2000 Haunted Mansion 50th",
  sold_date: "2026-10-10",
  best_offer_accepted: false,
  displayed_price: { amount: 22.51, currency: "GBP" },
  displayed_shipping: { amount: 3.2, currency: "GBP" },
  link: "https://www.ebay.co.uk/itm/item-77",
  location_text: "Little Whinging, Surrey, United Kingdom",
  seller_text: "SELLERNAME-SENTINEL (1234) 99.8%",
  image: "https://i.ebayimg.com/images/g/SENTINEL/s-l500.jpg",
};

const UK_CTX: RowContext = {
  sourceId: "soldgraph:ebay_gb_sold", market: "UK", currency: "GBP", lang: "en", now: NOW,
  country: "uk", locationFilter: "domestic",
};

function fakeClient(rows: unknown[] = [ROW]) {
  const search = vi.fn(async (_route: string, _params?: unknown, _opts?: unknown): Promise<SoldgraphSearchResult<unknown>> =>
    ({ rows, pages: 1, truncated: false, requestIds: [] }));
  return { client: { search } as unknown as SoldgraphClient, search };
}

describe("eBay sold request", () => {
  it("sends item_location=domestic by default, on every country", async () => {
    expect(DEFAULT_EBAY_SOLD_ITEM_LOCATION).toBe("domestic");
    for (const country of ["uk", "fr", "us"] as const) {
      const { client, search } = fakeClient([]);
      await createSoldgraphEbaySoldAdapter(client, { country }).search("hatbox ghost pin");
      expect(search.mock.calls[0][1]).toEqual({ item_location: "domestic", q: "hatbox ghost pin", country });
    }
  });

  it("is configurable per adapter, and the filter is part of the search key", async () => {
    const world = fakeClient([]);
    const ww = createSoldgraphEbaySoldAdapter(world.client, { country: "uk", itemLocation: "worldwide" });
    await ww.search("hatbox ghost pin");
    expect(world.search.mock.calls[0][1]).toMatchObject({ item_location: "worldwide" });

    const none = fakeClient([]);
    const off = createSoldgraphEbaySoldAdapter(none.client, { country: "uk", itemLocation: null });
    const res = await off.search("hatbox ghost pin");
    expect(none.search.mock.calls[0][1]).toEqual({ q: "hatbox ghost pin", country: "uk" });
    expect(res.listings).toEqual([]);

    const dom = createSoldgraphEbaySoldAdapter(fakeClient([]).client, { country: "uk" });
    expect(dom.searchKey("q")).toContain("item_location=domestic");
    expect(dom.searchKey("q")).not.toBe(ww.searchKey("q"));
    expect(dom.searchKey("q")).not.toBe(off.searchKey("q"));
  });

  it("records the filter actually sent on each row", async () => {
    const { client } = fakeClient();
    const [dom] = (await createSoldgraphEbaySoldAdapter(client, { country: "uk" }).search("q")).listings;
    expect(dom).toMatchObject({ site: "uk", locationFilter: "domestic", itemCountry: "GB", displayedCurrency: "GBP" });
    const [off] = (await createSoldgraphEbaySoldAdapter(client, { country: "uk", itemLocation: null }).search("q")).listings;
    expect(off).toMatchObject({ site: "uk", locationFilter: null });
  });
});

describe("provenance never keeps town or seller text", () => {
  it("maps the country only", () => {
    const out = mapEbaySoldRow(ROW, UK_CTX);
    if (typeof out === "string") throw new Error(out);
    expect(out.itemCountry).toBe("GB");
    expect(out.priceIsConverted).toBeNull();
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/Whinging|Surrey|SELLERNAME|SENTINEL|seller|location_text/i);
  });

  it("stores the country only, in exactly the 049 + 054 columns", () => {
    const listing = mapEbaySoldRow(ROW, UK_CTX);
    if (typeof listing === "string") throw new Error(listing);
    const match = { accepted: true, score: 90, parsed: { variantTerms: [], charactersGuess: [] } } as unknown as MatchResult;
    const c: CollectedListing = { listing, market: "UK", evidenceType: "sold", match };
    const row = toListingRow(c, "11111111-1111-4111-8111-111111111111", 30, NOW);
    expect(row).toMatchObject({
      site: "uk", location_filter: "domestic", item_country: "GB", displayed_currency: "GBP", price_is_converted: null,
    });
    expect(Object.keys(row).sort()).toEqual([
      "accepted", "best_offer_accepted", "currency", "displayed_currency", "expires_at", "external_id", "item_country",
      "last_seen_at", "listing_url", "location_filter", "match_score", "parsed", "pin_id", "price", "price_is_converted",
      "price_kind", "rejection_reason", "shipping", "site", "sold_date", "source_id", "title",
    ]);
    expect(JSON.stringify(row)).not.toMatch(/Whinging|Surrey|SELLERNAME|SENTINEL/);
  });

  it("an unparseable location gives a null country, not the text", () => {
    const out = mapEbaySoldRow({ ...ROW, location_text: "Little Whinging" }, UK_CTX);
    if (typeof out === "string") throw new Error(out);
    expect(out.itemCountry).toBeNull();
    expect(JSON.stringify(out)).not.toMatch(/Whinging/);
  });
});

// ─── Valuation ───────────────────────────────────────────────────────────────

const SOLD_SOURCE = { UK: "soldgraph:ebay_gb_sold", FR: "soldgraph:ebay_fr_sold", US: "soldgraph:ebay_us_sold" } as const;
const CURRENCY = { UK: "GBP", FR: "EUR", US: "USD" } as const;
type M = keyof typeof SOLD_SOURCE;

function sold(market: M, externalId: string, price: number, over: Partial<ValuationEvidence> = {}): ValuationEvidence {
  return {
    sourceId: SOLD_SOURCE[market],
    market,
    evidenceType: "sold",
    priceKind: "sold",
    price,
    currency: CURRENCY[market],
    soldDate: daysAgo(9),
    bestOfferAccepted: false,
    matchScore: 90,
    externalId,
    locationFilter: "domestic",
    itemCountry: null,
    priceIsConverted: null,
    ...over,
  };
}

/** The #411 pilot pattern: one eBay item under UK and FR, FR price = UK × ~1.186 (a conversion). */
function pilotPair(id: string, gbp: number, over: Partial<ValuationEvidence> = {}): ValuationEvidence[] {
  return [sold("UK", id, gbp, over), sold("FR", id, Math.round(gbp * 1.186 * 100) / 100, over)];
}

const byMarket = (ev: ValuationEvidence[]) =>
  Object.fromEntries(computePinValuations(ev, { now: NOW }).map(v => [v.market, v]));

describe("valuation: region_unverified", () => {
  it("leaves out every row fetched without the domestic filter (all pilot data)", () => {
    const legacy = [22.32, 21.5, 23.1].map((p, i) => sold("UK", `legacy-${i}`, p, { locationFilter: null }));
    const v = computeMarketValuation("UK", legacy, { now: NOW });
    expect(v).toMatchObject({ fair: null, soldCount: 0, basis: "none" });
    expect(v.excluded).toEqual({ region_unverified: 3 });
    expect(formatValuation(v)).toBe("UK insufficient (left out: region_unverified 3)");
  });

  it("a worldwide search is not region-verified, even when the item country matches", () => {
    const v = computeMarketValuation("UK", [sold("UK", "w-1", 10, { locationFilter: "worldwide", itemCountry: "GB" })], { now: NOW });
    expect(v.excluded).toEqual({ region_unverified: 1 });
  });

  it("a domestic row whose parsed country is another market's is left out", () => {
    const v = computeMarketValuation("FR", [sold("FR", "d-1", 10, { itemCountry: "GB" })], { now: NOW });
    expect(v.excluded).toEqual({ region_unverified: 1 });
    expect(v.fair).toBeNull();
  });

  it("does not touch sources that are not region-checked (asking prices)", () => {
    const active: ValuationEvidence = {
      sourceId: "soldgraph:vinted_gb_active", market: "UK", evidenceType: "active", priceKind: "active", price: 9,
      currency: "GBP", soldDate: null, bestOfferAccepted: null, matchScore: 90, seenAt: daysAgo(1),
    };
    const v = computeMarketValuation("UK", [active], { now: NOW });
    expect(v).toMatchObject({ fair: 9, activeCount: 1, excluded: {} });
  });
});

describe("valuation: one transaction counts once", () => {
  it("a domestic-filtered row counts in exactly one market", () => {
    const v = byMarket([sold("UK", "one", 12.15, { itemCountry: "GB" })]);
    expect(v.UK).toMatchObject({ fair: 12.15, soldCount: 1 });
    expect(v.FR).toMatchObject({ fair: null, soldCount: 0, excluded: {} });
    expect(v.US).toMatchObject({ fair: null, soldCount: 0, excluded: {} });
  });

  it("the same item under UK and FR with unknown origin is left out of both", () => {
    const ev = [...pilotPair("dup-1", 22.32), ...pilotPair("dup-2", 5.4)];
    expect(regionExclusions(ev)).toEqual(Array(4).fill("cross_market_duplicate"));
    const v = byMarket(ev);
    expect(v.UK).toMatchObject({ fair: null, soldCount: 0, excluded: { cross_market_duplicate: 2 } });
    expect(v.FR).toMatchObject({ fair: null, soldCount: 0, excluded: { cross_market_duplicate: 2 } });
    expect(formatValuation(v.FR)).toBe("FR insufficient (left out: cross_market_duplicate 2)");
  });

  it("is counted once, in the market matching the item country; the converted copy never counts", () => {
    const ev = pilotPair("dup-1", 22.32, { itemCountry: "GB" });
    const v = byMarket(ev);
    expect(v.UK).toMatchObject({ fair: 22.32, soldCount: 1 });
    expect(v.FR).toMatchObject({ fair: null, soldCount: 0 });
    expect(v.UK.soldCount + v.FR.soldCount + v.US.soldCount).toBe(1);
  });

  it("a converted FR price (~1.186 × UK) is never independent evidence, whatever the filter state", () => {
    for (const over of [{ locationFilter: null }, { locationFilter: "domestic" }, { locationFilter: "domestic", itemCountry: "GB" }]) {
      const ev = [22.32, 5.4, 4.49, 12.15].flatMap((p, i) => pilotPair(`x-${i}`, p, over));
      const v = byMarket(ev);
      expect(v.FR.fair).toBeNull();
      expect(v.FR.soldCount).toBe(0);
      // Never more counted transactions than distinct items.
      expect(v.UK.soldCount + v.FR.soldCount).toBeLessThanOrEqual(4);
    }
  });

  it("a verified row is not blocked by an unverified copy in another market", () => {
    const ev = [sold("UK", "mix", 7.49), sold("FR", "mix", 8.88, { locationFilter: null })];
    const v = byMarket(ev);
    expect(v.UK).toMatchObject({ fair: 7.49, soldCount: 1 });
    expect(v.FR.excluded).toEqual({ region_unverified: 1 });
  });

  it("a price the provider marks as converted is left out", () => {
    const v = computeMarketValuation("UK", [sold("UK", "c-1", 10, { priceIsConverted: true })], { now: NOW });
    expect(v.excluded).toEqual({ converted_price: 1 });
  });

  it("shows exclusions next to a value in the refresh summary", () => {
    const ev = [sold("UK", "a", 10), sold("UK", "b", 12), sold("UK", "c", 14), sold("UK", "old", 30, { locationFilter: null })];
    const v = computeMarketValuation("UK", ev, { now: NOW });
    expect(formatValuation(v)).toMatch(/^UK fair 12\.00 GBP \(.*3 sold, 0 listed\) \(left out: region_unverified 1\)$/);
  });
});
