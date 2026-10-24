/**
 * SG-03 (#406): each Soldgraph adapter maps synthetic fixture responses to
 * NormalisedListing through the real Soldgraph client (fetch is faked; no
 * network). Covers null prices, missing fields, currency mismatches, French
 * decimals, Best Offer handling, sold rows without a date, and the rule that
 * no image URL or seller detail reaches the normalised output.
 */
import { describe, expect, it, vi } from "vitest";
import { InMemoryUsageStore, createSoldgraphClient, type SoldgraphClock } from "../../soldgraph/client";
import { ADAPTER_REJECTION_REASONS, type NormalisedListing } from "../adapter";
import { fixturePin, readFixture } from "../__fixtures__/load";
import { createSoldgraphEbaySoldAdapter } from "./soldgraph-ebay-sold";
import { createSoldgraphVintedAdapter } from "./soldgraph-vinted-active";
import { createSoldgraphWhatnotAdapter } from "./soldgraph-whatnot-active";

const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);

function harness(fixtureName: string) {
  const body = readFixture<unknown>(`soldgraph/${fixtureName}`);
  const urls: string[] = [];
  const clock: SoldgraphClock = { now: () => NOW, sleep: async () => {} };
  const store = new InMemoryUsageStore(clock.now);
  store.setBudget("2026-10", { limitCredits: 10, hardStop: true });
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  let n = 0;
  const client = createSoldgraphClient({
    usageStore: store,
    apiKey: "test-key-not-real",
    enabled: true,
    fetch: fetchMock as unknown as typeof fetch,
    clock,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    uuid: () => `uuid-${++n}`,
  });
  return { client, urls, store, fetchMock, clock: () => NOW };
}

const NORMALISED_KEYS = [
  "bestOfferAccepted",
  "bestOfferAcceptedCount",
  "condition",
  "currency",
  "externalId",
  "listedPrice",
  "medianExcludingBestOffer",
  "price",
  "priceKind",
  "shipping",
  "soldDate",
  "sourceId",
  "title",
  "url",
].sort();

/** Region provenance (#450): only eBay sold rows carry these, always all five. */
const PROVENANCE_KEYS = ["displayedCurrency", "itemCountry", "locationFilter", "priceIsConverted", "site"];

function expectNoThirdPartyDetail(listings: NormalisedListing[]) {
  for (const l of listings) {
    const keys = Object.keys(l).sort();
    const expected = l.sourceId.includes("_sold") ? [...NORMALISED_KEYS, ...PROVENANCE_KEYS].sort() : NORMALISED_KEYS;
    expect(keys).toEqual(expected);
  }
  const text = JSON.stringify(listings);
  expect(text).not.toMatch(/SENTINEL|ebayimg|images\.|photo|seller|feedback|London/i);
}

/** Every listing must satisfy migration 049's market_listings constraints. */
function expectStorable(listings: NormalisedListing[]) {
  for (const l of listings) {
    expect(l.externalId.length).toBeGreaterThan(0);
    expect(l.externalId.length).toBeLessThanOrEqual(200);
    expect(l.title.length).toBeLessThanOrEqual(500);
    expect(l.currency).toMatch(/^[A-Z]{3}$/);
    if (l.price !== null) expect(l.price).toBeGreaterThanOrEqual(0);
    if (l.shipping !== null) expect(l.shipping).toBeGreaterThanOrEqual(0);
    if (l.priceKind !== "active") expect(l.soldDate).not.toBeNull();
    if (l.priceKind === "active") expect(l.bestOfferAccepted).not.toBe(true);
    if (l.url !== null) expect(l.url).toMatch(/^https:\/\//);
  }
}

const hatbox = fixturePin("hatbox");

describe("soldgraph eBay sold adapter (UK)", () => {
  it("maps rows, keeps Best Offer fields, and drops bad rows with counted reasons", async () => {
    const h = harness("ebay-sold-uk.json");
    const adapter = createSoldgraphEbaySoldAdapter(h.client, { country: "uk", clock: h.clock });
    expect(adapter).toMatchObject({
      sourceId: "soldgraph:ebay_gb_sold",
      provider: "soldgraph",
      market: "UK",
      currency: "GBP",
      evidenceType: "sold",
      lang: "en",
      creditsPerSearch: 1,
      killSwitchEnv: "SOLDGRAPH_ENABLED",
    });

    const res = await adapter.search("Disney Hatbox Ghost pin LE 2000", { pinId: "pin-uuid-1" });

    // One paid search, country=uk, query passed through.
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(h.urls[0]);
    expect(url.pathname).toBe("/v1/ebay/sold");
    expect(url.searchParams.get("country")).toBe("uk");
    expect(url.searchParams.get("q")).toBe("Disney Hatbox Ghost pin LE 2000");
    // Domestic sellers only by default (#450).
    expect(url.searchParams.get("item_location")).toBe("domestic");
    expect((await h.store.getMonthUsage("2026-10")).credits).toBe(1);
    expect(h.store.records[0].pinId).toBe("pin-uuid-1");

    expect(res.sourceId).toBe("soldgraph:ebay_gb_sold");
    expect(res.received).toBe(11);
    expect(res.truncated).toBe(false);
    expect(res.rejected).toEqual({
      missing_sold_date: 1,
      currency_mismatch: 1,
      duplicate: 1,
      missing_title: 1,
      missing_external_id: 1,
      invalid_row: 1,
    });

    const byId = Object.fromEntries(res.listings.map(l => [l.externalId, l]));
    expect(Object.keys(byId)).toEqual(["uk-1001", "uk-1002", "uk-1003", "uk-1005", "uk-1009"]);

    // Confirmed not a Best Offer: a real sale price.
    expect(byId["uk-1001"]).toEqual({
      sourceId: "soldgraph:ebay_gb_sold",
      externalId: "uk-1001",
      title: "Disney Hatbox Ghost pin LE 2000 Haunted Mansion 50th",
      price: 24.99,
      listedPrice: null,
      shipping: 3.2,
      currency: "GBP",
      soldDate: "2026-10-01T14:30:00.000Z",
      priceKind: "sold",
      bestOfferAccepted: false,
      bestOfferAcceptedCount: 3,
      medianExcludingBestOffer: 22.5,
      url: "https://www.ebay.co.uk/itm/1001",
      condition: "New",
      site: "uk",
      locationFilter: "domestic",
      // The fixture's location is a town only ("London"): no country, and the town is not kept.
      itemCountry: null,
      displayedCurrency: "GBP",
      priceIsConverted: null,
    });
    // Accepted Best Offer: the listed price is never the sale price.
    expect(byId["uk-1002"]).toMatchObject({
      price: null,
      listedPrice: 30,
      priceKind: "sold_possible_offer",
      bestOfferAccepted: true,
      bestOfferAcceptedCount: 3,
      medianExcludingBestOffer: 22.5,
      soldDate: "2026-09-28T00:00:00.000Z",
      shipping: null,
    });
    // Best Offer not reported: possible offer, price kept, flag unknown.
    expect(byId["uk-1003"]).toMatchObject({
      title: "Disney Hatbox Ghost pin 2019",
      price: 18,
      listedPrice: null,
      priceKind: "sold_possible_offer",
      bestOfferAccepted: null,
      bestOfferAcceptedCount: null,
      medianExcludingBestOffer: null,
      soldDate: "2026-09-20T08:00:00.000Z",
      condition: null,
    });
    // Null price is kept as unknown, not zero.
    expect(byId["uk-1005"]).toMatchObject({ price: null, shipping: null, url: null });
    // Foreign link host dropped; shipping in another currency dropped, not mixed in.
    expect(byId["uk-1009"]).toMatchObject({ price: 19.5, shipping: null, url: null });

    expectNoThirdPartyDetail(res.listings);
    expectStorable(res.listings);
  });

  it("reads the price from displayed_price, the shape the staging probe reported (#411)", async () => {
    const h = harness("ebay-sold-uk-live-shape.json");
    const adapter = createSoldgraphEbaySoldAdapter(h.client, { country: "uk", clock: h.clock });
    const res = await adapter.search("Hatbox Ghost pin");
    const byId = Object.fromEntries(res.listings.map(l => [l.externalId, l]));
    expect(byId["live-1"]).toMatchObject({ price: 24.99, shipping: 3.2, currency: "GBP", priceKind: "sold", url: "https://www.ebay.co.uk/itm/live-1" });
    // An accepted Best Offer keeps its listed price aside, never as the sale price.
    expect(byId["live-2"]).toMatchObject({ price: null, listedPrice: 30, bestOfferAccepted: true });
    expect(byId["live-3"]).toMatchObject({ price: 19.5, shipping: 2.5 });
    expectNoThirdPartyDetail(res.listings);
    expectStorable(res.listings);
    expect(JSON.stringify(res.listings)).not.toMatch(/SENTINEL/);
  });

  it("builds at most two English queries by default and keys searches by country", () => {
    const h = harness("ebay-sold-uk.json");
    const uk = createSoldgraphEbaySoldAdapter(h.client, { country: "uk" });
    const us = createSoldgraphEbaySoldAdapter(h.client, { country: "us" });
    const q = uk.buildQueries(hatbox);
    expect(q).toEqual(["Hatbox Ghost pin", "Disney Hatbox Ghost pin LE 2000"]);
    expect(uk.searchKey(q[0])).not.toBe(us.searchKey(q[0]));
    expect(uk.searchKey("  HATBOX ghost   pin ")).toBe(uk.searchKey(q[0]));
  });

  it("propagates the client's kill switch without a network call", async () => {
    const fetchMock = vi.fn();
    const client = createSoldgraphClient({
      usageStore: new InMemoryUsageStore(),
      apiKey: "test-key-not-real",
      enabled: false,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const adapter = createSoldgraphEbaySoldAdapter(client, { country: "uk" });
    await expect(adapter.search("x")).rejects.toMatchObject({ name: "ProviderDisabledError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("soldgraph eBay sold adapter (FR)", () => {
  it("parses French decimals and dates, and rejects other currencies and impossible dates", async () => {
    const h = harness("ebay-sold-fr.json");
    const adapter = createSoldgraphEbaySoldAdapter(h.client, { country: "fr", clock: h.clock });
    expect(adapter).toMatchObject({ sourceId: "soldgraph:ebay_fr_sold", market: "FR", currency: "EUR", lang: "fr" });
    const res = await adapter.search("pin's Disney Steamboat Willie Mickey");
    expect(new URL(h.urls[0]).searchParams.get("country")).toBe("fr");
    expect(res.rejected).toEqual({ currency_mismatch: 1, missing_sold_date: 1 });

    const byId = Object.fromEntries(res.listings.map(l => [l.externalId, l]));
    expect(byId["fr-2001"]).toMatchObject({
      price: 12.5,
      shipping: 4.99,
      currency: "EUR",
      soldDate: "2026-09-14T00:00:00.000Z",
      priceKind: "sold",
      bestOfferAccepted: false,
      url: "https://www.ebay.fr/itm/2001",
      condition: "Neuf",
    });
    // http:// links are not kept.
    expect(byId["fr-2002"]).toMatchObject({ price: 1234.56, url: null, priceKind: "sold_possible_offer" });
    expect(byId["fr-2003"]).toMatchObject({
      price: null,
      listedPrice: 8.9,
      bestOfferAccepted: true,
      medianExcludingBestOffer: 10,
    });
    expect(byId["fr-2004"]).toMatchObject({ price: 1234.5 });
    expectNoThirdPartyDetail(res.listings);
    expectStorable(res.listings);
  });

  it("leads with French query terms", () => {
    const h = harness("ebay-sold-fr.json");
    const adapter = createSoldgraphEbaySoldAdapter(h.client, { country: "fr", maxQueries: 3 });
    expect(adapter.buildQueries(hatbox)).toEqual([
      "pin's Hatbox Ghost",
      "pin's Disney Hatbox Ghost LE 2000",
      "pin Disney Hatbox Ghost",
    ]);
  });
});

describe("soldgraph eBay sold adapter (US)", () => {
  it("parses US symbols, epoch and MM/DD dates, and rejects CAD", async () => {
    const h = harness("ebay-sold-us.json");
    const adapter = createSoldgraphEbaySoldAdapter(h.client, { country: "us", clock: h.clock });
    expect(adapter).toMatchObject({ sourceId: "soldgraph:ebay_us_sold", market: "US", currency: "USD" });
    const res = await adapter.search("Disney Hatbox Ghost pin");
    expect(new URL(h.urls[0]).searchParams.get("country")).toBe("us");
    expect(res.rejected).toEqual({ currency_mismatch: 1 });
    expect(res.listings.map(l => [l.externalId, l.price, l.shipping, l.soldDate, l.priceKind])).toEqual([
      ["us-3001", 45, 5.5, "2026-09-21T14:13:20.000Z", "sold"],
      ["us-3002", 1250, null, "2026-09-14T00:00:00.000Z", "sold_possible_offer"],
    ]);
    expectStorable(res.listings);
  });
});

describe("soldgraph Vinted active adapter", () => {
  it("UK: maps asking prices only and drops sold rows, photos and user details", async () => {
    const h = harness("vinted-uk.json");
    const adapter = createSoldgraphVintedAdapter(h.client, { country: "uk", clock: h.clock });
    expect(adapter).toMatchObject({ sourceId: "soldgraph:vinted_gb_active", evidenceType: "active", currency: "GBP" });
    const res = await adapter.search("Disney Stitch pin");
    const url = new URL(h.urls[0]);
    expect(url.pathname).toBe("/v1/vinted/search");
    expect(url.searchParams.get("country")).toBe("uk");
    expect(res.rejected).toEqual({ not_active: 2, currency_mismatch: 1 });
    expect(res.listings).toEqual([
      {
        sourceId: "soldgraph:vinted_gb_active",
        externalId: "4001",
        title: "Disney Stitch pin",
        price: 6,
        listedPrice: null,
        shipping: 2.79,
        currency: "GBP",
        soldDate: null,
        priceKind: "active",
        bestOfferAccepted: null,
        bestOfferAcceptedCount: null,
        medianExcludingBestOffer: null,
        url: "https://www.vinted.co.uk/items/4001-disney-stitch-pin",
        condition: "Very good",
      },
      expect.objectContaining({ externalId: "4004", price: null, shipping: null }),
    ]);
    expectNoThirdPartyDetail(res.listings);
    expectStorable(res.listings);
  });

  it("FR: parses French decimals and leaves ambiguous amounts null", async () => {
    const h = harness("vinted-fr.json");
    const adapter = createSoldgraphVintedAdapter(h.client, { country: "fr", clock: h.clock });
    expect(adapter).toMatchObject({ sourceId: "soldgraph:vinted_fr_active", currency: "EUR", lang: "fr" });
    const res = await adapter.search("pin's Disney Fée Clochette");
    expect(new URL(h.urls[0]).searchParams.get("country")).toBe("fr");
    expect(res.listings.map(l => [l.externalId, l.price, l.shipping, l.url])).toEqual([
      ["5001", 7.5, 3.1, "https://www.vinted.fr/items/5001"],
      ["5002", 1000, null, null],
      ["5003", null, null, null],
    ]);
    expectStorable(res.listings);
  });
});

describe("soldgraph Whatnot active adapter", () => {
  it("keeps active Buy It Now rows in USD only", async () => {
    const h = harness("whatnot-us.json");
    const adapter = createSoldgraphWhatnotAdapter(h.client, { clock: h.clock });
    expect(adapter).toMatchObject({ sourceId: "soldgraph:whatnot_us_active", market: "US", currency: "USD" });
    const res = await adapter.search("Disney Hatbox Ghost pin");
    expect(new URL(h.urls[0]).searchParams.get("country")).toBe("us");
    expect(res.rejected).toEqual({ not_buy_it_now: 1, currency_mismatch: 1, not_active: 1 });
    expect(res.listings.map(l => [l.externalId, l.price, l.shipping, l.url, l.priceKind])).toEqual([
      ["wn-6001", 35, 4.99, "https://www.whatnot.com/listing/6001", "active"],
      ["wn-6005", null, null, null, "active"],
    ]);
    expectNoThirdPartyDetail(res.listings);
    expectStorable(res.listings);
  });
});

describe("adapter rejection reasons", () => {
  it("are stable snake_case values that fit market_listings.rejection_reason", () => {
    for (const r of ADAPTER_REJECTION_REASONS) expect(r).toMatch(/^[a-z_]{2,40}$/);
    expect(new Set(ADAPTER_REJECTION_REASONS).size).toBe(ADAPTER_REJECTION_REASONS.length);
  });
});
