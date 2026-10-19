/**
 * SG-03 (#406): registry enablement, kill switch, priority order, per-pin
 * query planning with cross-adapter de-duplication and credit limits, and a
 * fake "Mercari" adapter added with no change anywhere else.
 */
import { describe, expect, it, vi } from "vitest";
import type { CataloguePin } from "@workspace/pin-repository";
import type { SoldgraphClient } from "../soldgraph/client";
import { normaliseQueryKey, type MarketplaceAdapter, type NormalisedListing } from "./adapter";
import { createDefaultAdapterRegistry, defaultAdapters } from "./adapters";
import { fixturePin } from "./__fixtures__/load";
import { buildEnglishQueries, buildFrenchQueries, dedupeQueries, planPinSearches, shortKeywordQuery } from "./queries";
import { createAdapterRegistry, type MarketSourceSetting } from "./registry";

/** A client that must never be called in these tests. */
const noCallClient: SoldgraphClient = {
  search: vi.fn(async () => {
    throw new Error("unexpected Soldgraph call");
  }),
};

/** Every source id seeded by migration 049, all enabled. */
const ALL_049_SOURCES: MarketSourceSetting[] = [
  "soldgraph:ebay_gb_sold",
  "soldgraph:ebay_fr_sold",
  "soldgraph:ebay_us_sold",
  "soldgraph:vinted_gb_active",
  "soldgraph:vinted_fr_active",
  "soldgraph:whatnot_us_active",
  "ebay_browse:ebay_gb_active",
].map(id => ({ id, enabled: true }));

const ON = { SOLDGRAPH_ENABLED: "true" } as NodeJS.ProcessEnv;
const OFF = { SOLDGRAPH_ENABLED: "" } as NodeJS.ProcessEnv;

describe("default adapters", () => {
  it("use exactly the market_sources ids seeded by 049 (plus the unseeded US Browse id)", () => {
    const ids = defaultAdapters({ soldgraph: noCallClient }).map(a => a.sourceId);
    expect(ids.filter(id => id !== "ebay_browse:ebay_us_active").sort()).toEqual(
      ALL_049_SOURCES.map(s => s.id).sort(),
    );
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+:[a-z0-9_]+$/);
  });

  it("returns enabled adapters in priority order: sold UK > FR > US, then asking prices", () => {
    const reg = createDefaultAdapterRegistry({ soldgraph: noCallClient });
    expect(reg.enabled(ALL_049_SOURCES, ON).map(a => a.sourceId)).toEqual([
      "soldgraph:ebay_gb_sold",
      "soldgraph:ebay_fr_sold",
      "soldgraph:ebay_us_sold",
      "soldgraph:vinted_gb_active",
      "ebay_browse:ebay_gb_active",
      "soldgraph:vinted_fr_active",
      "soldgraph:whatnot_us_active",
    ]);
  });

  it("keeps Soldgraph adapters off when the kill switch is off, whatever market_sources says", () => {
    const reg = createDefaultAdapterRegistry({ soldgraph: noCallClient });
    expect(reg.enabled(ALL_049_SOURCES, OFF).map(a => a.sourceId)).toEqual(["ebay_browse:ebay_gb_active"]);
  });

  it("keeps adapters off when their row is disabled or missing", () => {
    const reg = createDefaultAdapterRegistry({ soldgraph: noCallClient });
    expect(reg.enabled([], ON)).toEqual([]);
    expect(
      reg.enabled(
        [
          { id: "soldgraph:ebay_gb_sold", enabled: true },
          { id: "soldgraph:ebay_fr_sold", enabled: false },
        ],
        ON,
      ).map(a => a.sourceId),
    ).toEqual(["soldgraph:ebay_gb_sold"]);
    // 049 seeds no row for US Browse, so it stays off.
    expect(reg.enabled(ALL_049_SOURCES, ON).some(a => a.sourceId === "ebay_browse:ebay_us_active")).toBe(false);
  });

  it("rejects duplicate source ids", () => {
    const [a] = defaultAdapters({ soldgraph: noCallClient });
    expect(() => createAdapterRegistry([a, a])).toThrow(/Duplicate market adapter/);
  });
});

describe("query building", () => {
  const hatbox = fixturePin("hatbox");

  it("English sources lead with a short keyword search, then reuse v1 buildSearchQueries", () => {
    expect(buildEnglishQueries(hatbox, 1)).toEqual(["Hatbox Ghost pin"]);
    expect(buildEnglishQueries(hatbox, 2)).toEqual(["Hatbox Ghost pin", "Disney Hatbox Ghost pin LE 2000"]);
  });

  it("French sources add French terms first", () => {
    expect(buildFrenchQueries(fixturePin("tink"), 3)).toEqual([
      "pin's Tinker Bell Pixie Dust",
      "pin's Disney Tinker Bell Pixie Dust",
      "pin Disney Tinker Bell Pixie Dust",
    ]);
  });

  it("short keyword search: the pin's own name first, no filler, years or park codes, at most 5 words", () => {
    const short = (title: string) => shortKeywordQuery({ ...hatbox, title });
    // Titles from the #411 mini-pilot.
    expect(short("Disney Royalty Reveal / Conceal - Aladdin")).toBe("Aladdin Royalty Reveal Conceal");
    expect(short("Hidden Mickey 2013 WDW - Characters - Tinker Bell")).toBe("Tinker Bell Hidden Mickey");
    expect(short("Stitch Summer Series - Sandcastle")).toBe("Sandcastle Stitch Summer");
    expect(short("Stitch with Nature Series - Duckling")).toBe("Duckling Stitch Nature");
    expect(short("Pixar Squares - Nemo")).toBe("Nemo Pixar Squares");
    expect(short("Hidden Mickey 2018 DLR – Moana Coconuts – Silver Claw Chaser")).toBe("Silver Claw Chaser Moana Coconuts");
    expect(short("101 Dalmatians - Lucky")).toBe("Lucky 101 Dalmatians");
    expect(short("Disney Pin")).toBeNull();
  });

  it("dedupeQueries is case and whitespace insensitive", () => {
    expect(dedupeQueries(["A  b", "a B", " ", "c"], 5)).toEqual(["A b", "c"]);
  });
});

describe("planPinSearches", () => {
  const hatbox = fixturePin("hatbox");

  it("plans every enabled search once and reports worst-case credits", () => {
    const adapters = createDefaultAdapterRegistry({ soldgraph: noCallClient }).enabled(ALL_049_SOURCES, ON);
    const plan = planPinSearches(hatbox, adapters);
    // 6 Soldgraph sources × 2 queries = 12 credits; Browse is free (3 queries).
    expect(plan.credits).toBe(12);
    expect(plan.searches).toHaveLength(15);
    expect(new Set(plan.searches.map(s => s.key)).size).toBe(plan.searches.length);
    expect(noCallClient.search).not.toHaveBeenCalled();
  });

  it("does not pay twice for the same search across adapters", () => {
    const fake = (sourceId: string, queries: string[]): MarketplaceAdapter => ({
      ...fakeAdapter(sourceId, []),
      buildQueries: () => queries,
      // Both adapters hit the same paid endpoint.
      searchKey: q => `shared|${normaliseQueryKey(q)}`,
    });
    const plan = planPinSearches(hatbox, [fake("x:a", ["Hatbox pin", "Ghost pin"]), fake("x:b", ["hatbox  PIN", "Other"])]);
    expect(plan.searches.map(s => [s.adapter.sourceId, s.query])).toEqual([
      ["x:a", "Hatbox pin"],
      ["x:a", "Ghost pin"],
      ["x:b", "Other"],
    ]);
    expect(plan.skippedDuplicates).toEqual([{ sourceId: "x:b", query: "hatbox  PIN", key: "shared|hatbox pin" }]);
    expect(plan.credits).toBe(3);
  });

  it("stops planning paid searches at the credit limit, highest priority first", () => {
    const adapters = createDefaultAdapterRegistry({ soldgraph: noCallClient }).enabled(ALL_049_SOURCES, ON);
    const plan = planPinSearches(hatbox, adapters, { creditLimit: 3 });
    expect(plan.credits).toBe(3);
    const paid = plan.searches.filter(s => s.adapter.creditsPerSearch > 0).map(s => s.adapter.sourceId);
    expect(paid).toEqual(["soldgraph:ebay_gb_sold", "soldgraph:ebay_gb_sold", "soldgraph:ebay_fr_sold"]);
    // Free Browse searches are still planned.
    expect(plan.searches.filter(s => s.adapter.creditsPerSearch === 0)).toHaveLength(3);
  });
});

/** A minimal adapter written only against the public interface. */
function fakeAdapter(sourceId: string, rows: NormalisedListing[]): MarketplaceAdapter {
  return {
    sourceId,
    provider: "fake_mercari",
    market: "US",
    currency: "USD",
    evidenceType: "active",
    lang: "en",
    creditsPerSearch: 1,
    killSwitchEnv: "FAKE_MERCARI_ENABLED",
    buildQueries: (pin: CataloguePin) => buildEnglishQueries(pin, 1),
    searchKey: q => `fake_mercari|${normaliseQueryKey(q)}`,
    search: async query => ({ sourceId, query, listings: rows, rejected: {}, received: rows.length, truncated: false }),
  };
}

describe("Mercari readiness", () => {
  it("a new adapter plugs into the registry and planner with no other change", async () => {
    const row: NormalisedListing = {
      sourceId: "fake_mercari:mercari_us_active",
      externalId: "m1",
      title: "Disney Hatbox Ghost pin",
      price: 20,
      listedPrice: null,
      shipping: null,
      currency: "USD",
      soldDate: null,
      priceKind: "active",
      bestOfferAccepted: null,
      bestOfferAcceptedCount: null,
      medianExcludingBestOffer: null,
      url: null,
      condition: null,
    };
    const mercari = fakeAdapter("fake_mercari:mercari_us_active", [row]);
    const reg = createAdapterRegistry([...defaultAdapters({ soldgraph: noCallClient }), mercari]);
    const sources = [...ALL_049_SOURCES, { id: mercari.sourceId, enabled: true }];

    expect(reg.enabled(sources, { ...ON, FAKE_MERCARI_ENABLED: "" }).includes(mercari)).toBe(false);
    const enabled = reg.enabled(sources, { ...ON, FAKE_MERCARI_ENABLED: "true" });
    expect(enabled.at(-1)).toBe(mercari);
    expect(reg.get(mercari.sourceId)).toBe(mercari);

    const plan = planPinSearches(fixturePin("hatbox"), enabled);
    const planned = plan.searches.filter(s => s.adapter === mercari);
    expect(planned.map(s => s.query)).toEqual(["Hatbox Ghost pin"]);
    expect(plan.credits).toBe(13);
    const res = await planned[0].adapter.search(planned[0].query);
    expect(res.listings).toEqual([row]);
  });
});
