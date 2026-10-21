/**
 * Valuation v2 wiring (SG-05, #408): feature flag, credit-limited evidence
 * collection, stored-evidence reads and market_valuations-only writes.
 * Supabase and every adapter are mocked; nothing here reaches a network.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { BudgetExceededError, InMemoryUsageStore } from "../soldgraph/client";
import { createSoldgraphClientFromEnv } from "../soldgraph/factory";
import { SupabaseUsageStore } from "../soldgraph/supabase-usage-store";
import type { AdapterSearchResult, MarketplaceAdapter, NormalisedListing } from "./adapter";
import { fixturePin } from "./__fixtures__/load";
import { computeMarketValuation } from "./valuation-v2";
import {
  collectPinEvidence,
  loadStoredEvidence,
  revaluePinFromStoredEvidence,
  saveMarketValuations,
  toMarketValuationRow,
  valuationV2Enabled,
} from "./valuation-v2-service";

const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);
const PIN_UUID = "3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f";
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();
const ON = { MARKET_VALUATION_V2_ENABLED: "true" } as NodeJS.ProcessEnv;

// ─── Fakes ───────────────────────────────────────────────────────────────────

function listing(over: Partial<NormalisedListing>): NormalisedListing {
  return {
    sourceId: "soldgraph:ebay_gb_sold",
    externalId: "item-1",
    title: "Hatbox Ghost Haunted Mansion 50th Anniversary LE 2000 Disney pin",
    price: 25,
    listedPrice: null,
    shipping: null,
    currency: "GBP",
    soldDate: iso(5),
    priceKind: "sold",
    bestOfferAccepted: false,
    bestOfferAcceptedCount: null,
    medianExcludingBestOffer: null,
    url: null,
    condition: null,
    site: "uk",
    locationFilter: "domestic",
    itemCountry: null,
    displayedCurrency: "GBP",
    priceIsConverted: null,
    ...over,
  };
}

function fakeAdapter(
  sourceId: string,
  opts: {
    credits?: number;
    queries?: string[];
    evidenceType?: "sold" | "active";
    listings?: NormalisedListing[];
    error?: Error;
  } = {},
) {
  const search = vi.fn(async (query: string): Promise<AdapterSearchResult> => {
    if (opts.error) throw opts.error;
    return { sourceId, query, listings: opts.listings ?? [], rejected: {}, received: 0, truncated: false };
  });
  const adapter: MarketplaceAdapter = {
    sourceId,
    provider: sourceId.split(":")[0],
    market: "UK",
    currency: "GBP",
    evidenceType: opts.evidenceType ?? "sold",
    lang: "en",
    creditsPerSearch: opts.credits ?? 1,
    buildQueries: () => opts.queries ?? ["q1", "q2"],
    searchKey: q => `${sourceId}|${q}`,
    search,
  };
  return { adapter, search };
}

type Result = { data: unknown; error: unknown };

/** Records every table touched and every operation; resolves each table to a fixed result. */
function fakeDb(results: Record<string, Result>) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  const from = (table: string) => {
    const result = results[table] ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "gt"]) {
      builder[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return builder;
      };
    }
    builder.upsert = (...args: unknown[]) => {
      calls.push({ table, op: "upsert", args });
      return Promise.resolve({ error: (results[`${table}:upsert`] ?? { error: null }).error });
    };
    builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return builder;
  };
  return { db: { from } as unknown as SupabaseClient, calls };
}

const SOURCES_ROWS = [
  { id: "soldgraph:ebay_gb_sold", market: "UK", currency: "GBP", evidence_type: "sold", enabled: true },
  { id: "soldgraph:vinted_gb_active", market: "UK", currency: "GBP", evidence_type: "active", enabled: true },
  { id: "soldgraph:ebay_us_sold", market: "US", currency: "USD", evidence_type: "sold", enabled: false },
];

const LISTING_ROWS = [
  ...[10, 12, 14].map((p, i) => ({
    source_id: "soldgraph:ebay_gb_sold", external_id: `uk-${i}`, price: String(p), currency: "GBP", sold_date: iso(3),
    price_kind: "sold", best_offer_accepted: false, match_score: "90.00", last_seen_at: iso(1),
    location_filter: "domestic", item_country: null, price_is_converted: null,
  })),
  // Disabled source: ignored.
  { source_id: "soldgraph:ebay_us_sold", price: "99", currency: "USD", sold_date: iso(3),
    price_kind: "sold", best_offer_accepted: false, match_score: "90", last_seen_at: iso(1) },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("feature flag", () => {
  it("is on only when MARKET_VALUATION_V2_ENABLED is exactly 'true'", () => {
    expect(valuationV2Enabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(valuationV2Enabled({ MARKET_VALUATION_V2_ENABLED: "1" } as NodeJS.ProcessEnv)).toBe(false);
    expect(valuationV2Enabled(ON)).toBe(true);
  });
});

describe("collectPinEvidence", () => {
  const pin = fixturePin("hatbox");

  it("refuses to plan without a credit limit", async () => {
    const { adapter, search } = fakeAdapter("soldgraph:ebay_gb_sold");
    await expect(collectPinEvidence(pin, [adapter], {} as never)).rejects.toThrow(TypeError);
    await expect(collectPinEvidence(pin, [adapter], { creditLimit: -1 })).rejects.toThrow(TypeError);
    await expect(collectPinEvidence(pin, [adapter], { creditLimit: 1.5 })).rejects.toThrow(TypeError);
    expect(search).not.toHaveBeenCalled();
  });

  it("passes the credit limit to the planner: paid searches stop at the limit, free ones still run", async () => {
    const uk = fakeAdapter("soldgraph:ebay_gb_sold");
    const fr = fakeAdapter("soldgraph:ebay_fr_sold");
    const free = fakeAdapter("ebay_browse:ebay_gb_active", { credits: 0, evidenceType: "active" });
    const res = await collectPinEvidence(pin, [uk.adapter, fr.adapter, free.adapter], { creditLimit: 2 });
    expect(res.plannedCredits).toBe(2);
    expect(uk.search).toHaveBeenCalledTimes(2);
    expect(fr.search).not.toHaveBeenCalled();
    expect(free.search).toHaveBeenCalledTimes(2);

    const none = fakeAdapter("soldgraph:ebay_gb_sold");
    const zero = await collectPinEvidence(pin, [none.adapter], { creditLimit: 0 });
    expect(zero.plannedCredits).toBe(0);
    expect(none.search).not.toHaveBeenCalled();
  });

  it("stops every remaining search when the budget is reached", async () => {
    const uk = fakeAdapter("soldgraph:ebay_gb_sold", { error: new BudgetExceededError("2026-10", 100, 100) });
    const fr = fakeAdapter("soldgraph:ebay_fr_sold");
    const res = await collectPinEvidence(pin, [uk.adapter, fr.adapter], { creditLimit: 10 });
    expect(res.stoppedBy).toBe("budget");
    expect(uk.search).toHaveBeenCalledTimes(1);
    expect(fr.search).not.toHaveBeenCalled();
  });

  it("matches with matchListing v2, de-duplicates per item and keeps near-misses apart", async () => {
    const { adapter } = fakeAdapter("soldgraph:ebay_gb_sold", {
      queries: ["q1"],
      listings: [
        listing({ externalId: "a" }),
        listing({ externalId: "a" }),
        listing({ externalId: "b", price: null, priceKind: "sold_possible_offer", bestOfferAccepted: true, listedPrice: 40 }),
        listing({ externalId: "c", title: "Hatbox Ghost Haunted Mansion keychain" }),
      ],
    });
    const res = await collectPinEvidence(pin, [adapter], { creditLimit: 5, pinId: PIN_UUID });
    expect(res.accepted.map(c => c.listing.externalId).sort()).toEqual(["a", "b"]);
    expect(res.rejected.map(c => c.listing.externalId)).toEqual(["c"]);
    expect(res.evidence).toHaveLength(2);
    expect(res.evidence.every(e => e.market === "UK" && e.evidenceType === "sold")).toBe(true);
    // The accepted Best Offer has no sale price, so it never sets a figure.
    const v = computeMarketValuation("UK", res.evidence, { now: NOW });
    expect(v).toMatchObject({ fair: 25, soldCount: 1 });
    expect(v.excluded).toEqual({ best_offer: 1 });
  });
});

describe("stored evidence and market_valuations writes", () => {
  it("reads explicit columns of accepted, unexpired rows from enabled sources only", async () => {
    const { db, calls } = fakeDb({
      market_sources: { data: SOURCES_ROWS, error: null },
      market_listings: { data: LISTING_ROWS, error: null },
    });
    const ev = await loadStoredEvidence(db, PIN_UUID, NOW);
    expect(ev).toHaveLength(3);
    expect(ev.every(e => e.market === "UK" && e.price !== null)).toBe(true);
    const selects = calls.filter(c => c.op === "select").map(c => String(c.args[0]));
    expect(selects.some(s => s.includes("*"))).toBe(false);
    // Item ids and region provenance are read (#450); titles, links and any location text are not.
    expect(selects.join(" ")).not.toMatch(/title|listing_url|location_text|seller/);
    expect(calls).toContainEqual({ table: "market_listings", op: "eq", args: ["accepted", true] });
    expect(calls).toContainEqual({ table: "market_listings", op: "gt", args: ["expires_at", new Date(NOW).toISOString()] });
  });

  it("builds rows with exactly the 049 columns and source keys", () => {
    const v = computeMarketValuation("UK", [], { now: NOW });
    const row = toMarketValuationRow(PIN_UUID, { ...v, sources: [{ source_id: "a:b", count: 2, latest_date: "2026-10-01" }] }, NOW);
    expect(Object.keys(row).sort()).toEqual([
      "active_count", "calculated_at", "confidence_band", "confidence_score", "currency", "expires_at", "fair",
      "high", "low", "market", "method_version", "pin_id", "sold_count", "sources", "updated_at",
    ]);
    expect(row.sources).toEqual([{ source_id: "a:b", count: 2, latest_date: "2026-10-01" }]);
    expect(row.expires_at).toBe(new Date(NOW + 7 * 86_400_000).toISOString());
  });

  it("revalues from stored evidence and writes only market_valuations", async () => {
    const { db, calls } = fakeDb({
      market_sources: { data: SOURCES_ROWS, error: null },
      market_listings: { data: LISTING_ROWS, error: null },
    });
    const res = await revaluePinFromStoredEvidence(db, PIN_UUID, { now: NOW, env: ON });
    expect(res.status).toBe("saved");
    const writes = calls.filter(c => c.op === "upsert");
    expect(writes.map(w => w.table)).toEqual(["market_valuations"]);
    expect(writes[0].args[1]).toEqual({ onConflict: "pin_id,market" });
    const rows = writes[0].args[0] as Array<Record<string, unknown>>;
    expect(rows.map(r => [r.market, r.currency, r.fair, r.confidence_band])).toEqual([
      ["UK", "GBP", 12, "medium"],
      ["FR", "EUR", null, "insufficient"],
      ["US", "USD", null, "insufficient"],
    ]);
    const touched = new Set(calls.map(c => c.table));
    expect([...touched].sort()).toEqual(["market_listings", "market_sources", "market_valuations"]);
    for (const t of ["pins", "user_pins", "pin_market_estimates", "ebay_listing_snapshots"]) expect(touched.has(t)).toBe(false);
  });

  it("does nothing while the flag is off", async () => {
    const { db, calls } = fakeDb({});
    expect(await revaluePinFromStoredEvidence(db, PIN_UUID, { now: NOW, env: {} as NodeJS.ProcessEnv })).toEqual({ status: "disabled" });
    expect(calls).toEqual([]);
  });

  it("fails with a generic error on a database error", async () => {
    const { db } = fakeDb({ "market_valuations:upsert": { data: null, error: { message: "secret detail" } } });
    const row = toMarketValuationRow(PIN_UUID, computeMarketValuation("UK", [], { now: NOW }), NOW);
    await expect(saveMarketValuations(db, [row])).rejects.toThrow("valuation v2: save valuations failed");
    const failing = fakeDb({ market_sources: { data: null, error: { message: "secret detail" } } });
    await expect(loadStoredEvidence(failing.db, PIN_UUID, NOW)).rejects.toThrow(/^valuation v2: load sources failed$/);
  });
});

describe("createSoldgraphClientFromEnv", () => {
  const supabaseStore = () => new SupabaseUsageStore({} as SupabaseClient);

  it("refuses while the kill switch is off, without building a store", () => {
    const createStore = vi.fn(supabaseStore);
    const createClient = vi.fn();
    expect(() => createSoldgraphClientFromEnv({} as NodeJS.ProcessEnv, {}, { createStore, createClient })).toThrow(
      "Soldgraph provider is disabled",
    );
    expect(createStore).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses without the Supabase-backed usage store, and never falls back to memory", () => {
    const env = { SOLDGRAPH_ENABLED: "true" } as NodeJS.ProcessEnv;
    const createClient = vi.fn();
    expect(() => createSoldgraphClientFromEnv(env, {}, { createStore: () => null, createClient })).toThrow(
      "Soldgraph provider is not configured",
    );
    expect(() =>
      createSoldgraphClientFromEnv(env, {}, { createStore: () => new InMemoryUsageStore() as never, createClient }),
    ).toThrow("Soldgraph provider is not configured");
    // The real env factory returns null without SUPABASE_SERVICE_ROLE_KEY.
    expect(() => createSoldgraphClientFromEnv({ ...env, SUPABASE_URL: "http://127.0.0.1:9" }, {}, { createClient })).toThrow(
      "Soldgraph provider is not configured",
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("builds the client with the Supabase store when both are present", () => {
    const store = supabaseStore();
    const createClient = vi.fn(() => ({ search: vi.fn() }));
    createSoldgraphClientFromEnv({ SOLDGRAPH_ENABLED: "true" } as NodeJS.ProcessEnv, {}, { createStore: () => store, createClient });
    expect(createClient).toHaveBeenCalledWith({ usageStore: store });
  });
});
