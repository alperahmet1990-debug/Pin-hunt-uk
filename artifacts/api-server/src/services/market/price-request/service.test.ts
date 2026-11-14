/**
 * "Get a price" (on-demand sold-price request): switches, caps, budget stop,
 * cache including empty results, duplicate in-flight requests, and status.
 *
 * The real refresh code runs (planning, matching, storing, revaluing) against
 * an in-memory database; Soldgraph is a fake client fed from the synthetic
 * fixtures in __fixtures__/soldgraph. Nothing here reaches a network.
 */
import { describe, expect, it, vi } from "vitest";
import type { MarketCode } from "@workspace/pin-repository";
import { BudgetExceededError, SoldgraphHttpError } from "../../soldgraph/errors";
import type { SoldgraphClient, SoldgraphSearchResult } from "../../soldgraph/client";
import { fixturePin, readFixture } from "../__fixtures__/load";
import type { MarketValuationV2 } from "../valuation-v2";
import type { RefreshResult } from "../refresh/refresh";
import type { BudgetStatus, MarketListingRow, PinRef, RefreshStore, SourceRow } from "../refresh/types";
import { priceRequestLimits, requestSources } from "./config";
import { priceRequestStatus, startPriceRequest, summarise, type PriceRequestDeps } from "./service";
import type { ClaimDecision, ClaimInput, FinishInput, PriceRequestRecord, PriceRequestStore } from "./types";

const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);
const DAY = 86_400_000;
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ENV_ON = {
  MARKET_PRICE_REQUEST_ENABLED: "true",
  MARKET_VALUATION_V2_ENABLED: "true",
  MARKET_VALUATION_PUBLISHED_MARKETS: "UK,US",
  SOLDGRAPH_ENABLED: "true",
  SOLDGRAPH_API_KEY: "test-key-not-real",
} as NodeJS.ProcessEnv;

const SOURCES: SourceRow[] = [
  { id: "soldgraph:ebay_gb_sold", provider: "soldgraph", market: "UK", evidenceType: "sold", enabled: true, retentionDays: null },
  { id: "soldgraph:ebay_us_sold", provider: "soldgraph", market: "US", evidenceType: "sold", enabled: true, retentionDays: null },
  { id: "soldgraph:ebay_fr_sold", provider: "soldgraph", market: "FR", evidenceType: "sold", enabled: false, retentionDays: null },
];

const PINS: PinRef[] = ["A", "B", "C", "D"].map((k, i) => ({
  uuid: `${String(i + 1).repeat(8)}-1111-4111-8111-111111111111`,
  pinhuntId: `PHUK-0000000${i + 1}`,
  pin: { ...fixturePin("hatbox"), id: `PHUK-0000000${i + 1}` },
}));
const uuidOf = (pinhuntId: string) => PINS.find(p => p.pinhuntId === pinhuntId)!.uuid;

const UK_ROWS = readFixture<{ result: { data: unknown[] } }>("soldgraph/ebay-sold-uk.json").result.data;
// Synthetic US sold rows shaped like the UK rows that match the Hatbox Ghost
// fixture pin (ebay-sold-us.json is built for parser edge cases instead).
const US_ROWS: unknown[] = [
  { item_id: "us-9001", title: "Disney Hatbox Ghost pin LE 2000 Haunted Mansion 50th", price: { value: "32.00", currency: "USD" }, sold_date: "2026-10-02T10:00:00Z", best_offer_accepted: false, url: "https://www.ebay.com/itm/9001" },
  { item_id: "us-9002", title: "Hatbox Ghost Disney pin LE 2000", price: 36, currency: "USD", sold_date: "2026-09-29", best_offer_accepted: false, url: "https://www.ebay.com/itm/9002" },
];

// ─── In-memory market database (the refresh's view) ──────────────────────────

class FakeMarketDb implements RefreshStore {
  listings: MarketListingRow[] = [];
  budgetStatus: Omit<BudgetStatus, "month"> = { usedCredits: 0, requests: 0, limitCredits: 100, hardStop: true, origin: "row" };
  sources = SOURCES.map(s => ({ ...s }));
  async loadSources() { return this.sources; }
  async loadPins(ids: string[]) { return PINS.filter(p => ids.includes(p.pinhuntId)); }
  async lastSeen(pinUuids: string[], sourceIds: string[], _now: number, filters?: ReadonlyMap<string, string | null>) {
    const out = new Map<string, string>();
    for (const r of this.listings) {
      if (!pinUuids.includes(r.pin_id) || !sourceIds.includes(r.source_id)) continue;
      if (filters?.has(r.source_id) && (r.location_filter ?? null) !== filters.get(r.source_id)) continue;
      const k = `${r.pin_id}|${r.source_id}`;
      if (!out.has(k) || r.last_seen_at > out.get(k)!) out.set(k, r.last_seen_at);
    }
    return out;
  }
  async acceptedFor() { return []; }
  async upsertListings(rows: MarketListingRow[]) {
    for (const row of rows) {
      const i = this.listings.findIndex(r => r.source_id === row.source_id && r.external_id === row.external_id && r.pin_id === row.pin_id);
      if (i >= 0) this.listings[i] = row;
      else this.listings.push(row);
    }
  }
  async deleteListings() {}
  async budget(month: string): Promise<BudgetStatus> { return { month, ...this.budgetStatus }; }
  async countExpired() { return []; }
  async purgeExpired() { return 0; }
  async usageRows() { return []; }
  async budgets() { return []; }
  /** A stand-in for valuation v2: sold count per market from stored accepted rows. */
  async revalue(uuid: string) {
    const valuations = (["UK", "FR", "US"] as MarketCode[]).map(market => {
      const ids = this.sources.filter(s => s.market === market).map(s => s.id);
      const sold = this.listings.filter(r => r.pin_id === uuid && r.accepted && ids.includes(r.source_id) && r.price !== null);
      const fair = sold.length ? sold.reduce((n, r) => n + (r.price ?? 0), 0) / sold.length : null;
      return { market, soldCount: sold.length, fair } as unknown as MarketValuationV2;
    });
    return { status: "saved" as const, valuations };
  }
}

// ─── In-memory request log, following claim_market_price_request() (079) ────

interface LogRow extends PriceRequestRecord { pinUuid: string; userId: string | null; origin: string; finish?: FinishInput }

class FakeRequestLog implements PriceRequestStore {
  rows: LogRow[] = [];
  claims: ClaimInput[] = [];
  private n = 0;
  constructor(private readonly clock: () => number) {}

  async claim(input: ClaimInput): Promise<ClaimDecision> {
    this.claims.push(input);
    const now = this.clock();
    for (const r of this.rows) {
      if (r.pinUuid === input.pinUuid && r.status === "pending" && Date.parse(r.createdAt) < now - input.pendingTimeoutMinutes * 60_000) {
        Object.assign(r, { status: "failed", outcome: "error", finishedAt: new Date(now).toISOString() });
      }
    }
    if (this.rows.some(r => r.pinUuid === input.pinUuid && r.status === "pending")) return { decision: "in_flight" };
    const cached = this.rows
      .filter(r => r.pinUuid === input.pinUuid && r.status === "complete" && r.finishedAt
        && Date.parse(r.finishedAt) > now - input.cacheDays * DAY && input.sources.every(s => r.sources.includes(s)))
      .sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!))[0];
    if (cached) {
      return {
        decision: "cached",
        outcome: cached.outcome as "priced" | "no_sales",
        finishedAt: cached.finishedAt!,
        retryAfter: new Date(Date.parse(cached.finishedAt!) + input.cacheDays * DAY).toISOString(),
      };
    }
    if (input.origin === "user") {
      const day = (r: LogRow) => Date.parse(r.createdAt) > now - DAY;
      const mine = this.rows.filter(r => r.userId === input.userId && day(r));
      if (mine.length >= input.userDailyLimit) {
        return { decision: "user_cap", retryAfter: new Date(Math.min(...mine.map(r => Date.parse(r.createdAt))) + DAY).toISOString() };
      }
      const all = this.rows.filter(r => r.origin === "user" && day(r));
      if (all.length >= input.globalDailyLimit) {
        return { decision: "global_cap", retryAfter: new Date(Math.min(...all.map(r => Date.parse(r.createdAt))) + DAY).toISOString() };
      }
    }
    const id = `req-${++this.n}`;
    this.rows.push({
      id, pinUuid: input.pinUuid, userId: input.origin === "user" ? input.userId : null, origin: input.origin,
      status: "pending", outcome: null, sources: [...input.sources], createdAt: new Date(now).toISOString(), finishedAt: null,
    });
    return { decision: "claimed", requestId: id };
  }

  async finish(input: FinishInput) {
    const r = this.rows.find(x => x.id === input.requestId && x.status === "pending");
    if (!r) return;
    Object.assign(r, { status: input.status, outcome: input.outcome, finishedAt: new Date(this.clock()).toISOString(), finish: input });
  }

  async latest(pinUuid: string) {
    return [...this.rows].reverse().find(r => r.pinUuid === pinUuid) ?? null;
  }
}

// ─── Fake Soldgraph ──────────────────────────────────────────────────────────

type Behaviour = { uk?: unknown[] | Error; us?: unknown[] | Error; gate?: Promise<void> };

function fakeSoldgraph(behaviour: Behaviour = {}) {
  const calls: Array<Record<string, unknown>> = [];
  const search = vi.fn(async (_route: string, params?: Record<string, unknown>): Promise<SoldgraphSearchResult<unknown>> => {
    calls.push(params ?? {});
    if (behaviour.gate) await behaviour.gate;
    const country = params?.country === "us" ? "us" : "uk";
    const b = behaviour[country] ?? (country === "us" ? US_ROWS : UK_ROWS);
    if (b instanceof Error) throw b;
    return { rows: b, pages: 1, truncated: false, requestIds: [] };
  });
  return { client: { search } as unknown as SoldgraphClient, search, calls };
}

function setup(opts: { env?: NodeJS.ProcessEnv; behaviour?: Behaviour } = {}) {
  let now = NOW;
  const clock = () => now;
  const db = new FakeMarketDb();
  const log = new FakeRequestLog(clock);
  const sg = fakeSoldgraph(opts.behaviour);
  const createClient = vi.fn(() => sg.client);
  const deps: PriceRequestDeps = { requests: log, refresh: db, env: opts.env ?? ENV_ON, now: clock, createClient };
  return { db, log, sg, createClient, deps, advance: (ms: number) => { now += ms; } };
}

const ask = (deps: PriceRequestDeps, pinhuntId = "PHUK-00000001", userId: string | null = USER) =>
  startPriceRequest({ pinhuntId, origin: "user", userId }, deps);

async function askAndWait(deps: PriceRequestDeps, pinhuntId?: string, userId?: string) {
  const r = await ask(deps, pinhuntId, userId);
  if (r.kind === "started") return { start: r, done: await r.done };
  return { start: r, done: null };
}

// ─── Switches ────────────────────────────────────────────────────────────────

describe("switches (flag off)", () => {
  it.each([
    ["the request flag is off", { MARKET_PRICE_REQUEST_ENABLED: "" }, "disabled"],
    ["valuation v2 is off", { MARKET_VALUATION_V2_ENABLED: "false" }, "disabled"],
    ["no market is published", { MARKET_VALUATION_PUBLISHED_MARKETS: "" }, "no_markets"],
    ["only FR is published (no FR source on purpose)", { MARKET_VALUATION_PUBLISHED_MARKETS: "FR" }, "no_markets"],
    ["the Soldgraph kill switch is off", { SOLDGRAPH_ENABLED: "false" }, "provider_off"],
    ["there is no Soldgraph key", { SOLDGRAPH_API_KEY: "" }, "provider_off"],
  ])("refuses before any database or provider call when %s", async (_label, over, reason) => {
    const { deps, log, createClient, sg } = setup({ env: { ...ENV_ON, ...over } });
    const loadSources = vi.spyOn(deps.refresh, "loadSources");
    expect(await ask(deps)).toEqual({ kind: "unavailable", reason });
    expect(loadSources).not.toHaveBeenCalled();
    expect(log.claims).toHaveLength(0);
    expect(createClient).not.toHaveBeenCalled();
    expect(sg.search).not.toHaveBeenCalled();
  });

  it("refuses when a source is not switched on in market_sources", async () => {
    const { deps, db, log, sg } = setup();
    db.sources.find(s => s.id === "soldgraph:ebay_us_sold")!.enabled = false;
    expect(await ask(deps)).toEqual({ kind: "unavailable", reason: "sources_off" });
    expect(log.claims).toHaveLength(0);
    expect(sg.search).not.toHaveBeenCalled();
  });

  it("is a 'not found' for a pin that does not exist, without claiming", async () => {
    const { deps, log } = setup();
    expect(await ask(deps, "PHUK-99999999")).toEqual({ kind: "not_found" });
    expect(log.claims).toHaveLength(0);
  });

  it("searches only published markets: UK alone costs 1 credit", async () => {
    const { deps, sg, log } = setup({ env: { ...ENV_ON, MARKET_VALUATION_PUBLISHED_MARKETS: "UK" } });
    const { start, done } = await askAndWait(deps);
    expect(start).toMatchObject({ kind: "started", worstCaseCredits: 1 });
    expect(sg.calls.map(c => c.country)).toEqual(["uk"]);
    expect(log.claims[0].sources).toEqual(["soldgraph:ebay_gb_sold"]);
    expect(done).toMatchObject({ status: "complete", soldCounts: { UK: expect.any(Number) } });
    expect(Object.keys(done!.soldCounts!)).toEqual(["UK"]);
  });
});

// ─── A normal request ────────────────────────────────────────────────────────

describe("a request", () => {
  it("searches eBay UK and US sold (domestic sellers), stores, revalues and closes as priced", async () => {
    const { deps, sg, log, db } = setup();
    const { start, done } = await askAndWait(deps);
    expect(start).toMatchObject({ kind: "started", worstCaseCredits: 2 });
    expect(sg.search).toHaveBeenCalledTimes(2);
    expect(sg.calls.map(c => [c.country, c.item_location])).toEqual([["uk", "domestic"], ["us", "domestic"]]);
    expect(db.listings.some(r => r.source_id === "soldgraph:ebay_gb_sold" && r.accepted)).toBe(true);
    expect(db.listings.some(r => r.source_id === "soldgraph:ebay_us_sold" && r.accepted)).toBe(true);
    expect(done).toMatchObject({ status: "complete", outcome: "priced", creditsSpent: 2 });
    expect(done!.soldCounts!.UK).toBeGreaterThan(0);
    expect(done!.soldCounts!.US).toBeGreaterThan(0);
    expect(log.rows[0]).toMatchObject({ status: "complete", outcome: "priced", userId: USER, origin: "user" });
    expect(log.claims[0]).toMatchObject({ worstCaseCredits: 2, userDailyLimit: 5, globalDailyLimit: 50, cacheDays: 30, pendingTimeoutMinutes: 10 });
  });

  it("costs nothing when both sources still have listings inside the refresh's own 7-day cache", async () => {
    const { deps, sg, advance } = setup({ env: { ...ENV_ON, MARKET_PRICE_REQUEST_CACHE_DAYS: "0" } });
    await askAndWait(deps);
    expect(sg.search).toHaveBeenCalledTimes(2);
    advance(DAY);
    const { start, done } = await askAndWait(deps);
    expect(start).toMatchObject({ kind: "started", worstCaseCredits: 0 });
    expect(sg.search).toHaveBeenCalledTimes(2);
    expect(done).toMatchObject({ status: "complete", outcome: "priced", creditsSpent: 0 });
  });

  it("rejects a duplicate while the first request is still running, and pays once", async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const { deps, sg, log } = setup({ behaviour: { gate } });
    const first = await ask(deps);
    expect(first.kind).toBe("started");
    // Same pin, same collector and another collector: both refused as in flight.
    expect(await ask(deps)).toEqual({ kind: "in_flight" });
    expect(await ask(deps, "PHUK-00000001", OTHER_USER)).toEqual({ kind: "in_flight" });
    release();
    if (first.kind === "started") await first.done;
    expect(sg.search).toHaveBeenCalledTimes(2);
    expect(log.rows).toHaveLength(1);
  });

  it("frees a pin whose request was abandoned (server restart) after the pending timeout", async () => {
    const { deps, log, advance } = setup();
    log.rows.push({
      id: "stuck", pinUuid: uuidOf("PHUK-00000001"), userId: OTHER_USER, origin: "user", status: "pending",
      outcome: null, sources: requestSources(ENV_ON), createdAt: new Date(NOW).toISOString(), finishedAt: null,
    });
    expect(await ask(deps)).toEqual({ kind: "in_flight" });
    advance(11 * 60_000);
    expect((await ask(deps)).kind).toBe("started");
    expect(log.rows.find(r => r.id === "stuck")).toMatchObject({ status: "failed", outcome: "error" });
  });
});

// ─── Cache, including empty results ──────────────────────────────────────────

describe("cache", () => {
  it("caches an empty result ('no sales') and does not pay for the pin again inside the window", async () => {
    const { deps, sg, advance } = setup({ behaviour: { uk: [], us: [] } });
    const first = await askAndWait(deps);
    expect(first.done).toMatchObject({ status: "complete", outcome: "no_sales", soldCounts: { UK: 0, US: 0 }, creditsSpent: 2 });
    expect(sg.search).toHaveBeenCalledTimes(2);

    advance(10 * DAY);
    const again = await ask(deps, "PHUK-00000001", OTHER_USER);
    expect(again).toMatchObject({ kind: "cached", outcome: "no_sales", checkedAt: new Date(NOW).toISOString() });
    expect(again.kind === "cached" && again.nextRequestAt).toBe(new Date(NOW + 30 * DAY).toISOString());
    expect(sg.search).toHaveBeenCalledTimes(2);
  });

  it("caches a priced result for every collector", async () => {
    const { deps, sg } = setup();
    await askAndWait(deps);
    expect(await ask(deps, "PHUK-00000001", OTHER_USER)).toMatchObject({ kind: "cached", outcome: "priced" });
    expect(sg.search).toHaveBeenCalledTimes(2);
  });

  it("does not count a cached answer against the collector's daily cap", async () => {
    const { deps, log } = setup({ env: { ...ENV_ON, MARKET_PRICE_REQUEST_USER_DAILY: "1" } });
    await askAndWait(deps);
    for (let i = 0; i < 3; i++) expect((await ask(deps)).kind).toBe("cached");
    expect(log.rows).toHaveLength(1);
  });

  it("searches again once the window has passed", async () => {
    const { deps, sg, advance } = setup({ behaviour: { uk: [], us: [] } });
    await askAndWait(deps);
    advance(31 * DAY);
    const r = await askAndWait(deps);
    expect(r.start.kind).toBe("started");
    expect(sg.search).toHaveBeenCalledTimes(4);
  });

  it("does not answer a UK+US request from a UK-only request", async () => {
    const { deps, sg } = setup({ env: { ...ENV_ON, MARKET_VALUATION_PUBLISHED_MARKETS: "UK" } });
    await askAndWait(deps);
    deps.env = ENV_ON;
    const r = await askAndWait(deps);
    expect(r.start.kind).toBe("started");
    // UK listings are still inside the refresh's 7-day cache: only US is paid for.
    expect(r.start.kind === "started" && r.start.worstCaseCredits).toBe(1);
    expect(sg.calls.map(c => c.country)).toEqual(["uk", "us"]);
  });

  it("never caches a failed search: a provider error can be retried at once", async () => {
    const { deps, log } = setup({ behaviour: { us: new SoldgraphHttpError(502, "upstream", null) } });
    const first = await askAndWait(deps);
    expect(first.done).toMatchObject({ status: "failed", outcome: "error" });
    expect(log.rows[0]).toMatchObject({ status: "failed", outcome: "error" });
    expect((await ask(deps)).kind).toBe("started");
  });
});

// ─── Daily caps ──────────────────────────────────────────────────────────────

describe("daily caps", () => {
  it("stops a collector at their daily cap, with a retry time, without planning a search", async () => {
    const { deps, sg, advance } = setup({ env: { ...ENV_ON, MARKET_PRICE_REQUEST_USER_DAILY: "2" } });
    await askAndWait(deps, "PHUK-00000001");
    advance(60_000);
    await askAndWait(deps, "PHUK-00000002");
    const capped = await ask(deps, "PHUK-00000003");
    expect(capped).toEqual({ kind: "capped", scope: "user", retryAfter: new Date(NOW + DAY).toISOString() });
    expect(sg.search).toHaveBeenCalledTimes(4);
    // Another collector is not affected.
    expect((await askAndWait(deps, "PHUK-00000003", OTHER_USER)).start.kind).toBe("started");
    // The rolling day passes.
    advance(DAY);
    expect((await ask(deps, "PHUK-00000004")).kind).toBe("started");
  });

  it("counts failed requests too, so retrying a failing pin can't spend without limit", async () => {
    const { deps } = setup({ env: { ...ENV_ON, MARKET_PRICE_REQUEST_USER_DAILY: "2" }, behaviour: { uk: new SoldgraphHttpError(500, "x", null) } });
    await askAndWait(deps);
    await askAndWait(deps);
    expect(await ask(deps)).toMatchObject({ kind: "capped", scope: "user" });
  });

  it("stops everyone at the global daily cap", async () => {
    const { deps } = setup({ env: { ...ENV_ON, MARKET_PRICE_REQUEST_GLOBAL_DAILY: "1" } });
    await askAndWait(deps, "PHUK-00000001", USER);
    expect(await ask(deps, "PHUK-00000002", OTHER_USER)).toMatchObject({ kind: "capped", scope: "global" });
  });

  it("lets a batch request skip the daily caps but not the cache or the in-flight check", async () => {
    const { deps, log } = setup({ env: { ...ENV_ON, MARKET_PRICE_REQUEST_USER_DAILY: "0", MARKET_PRICE_REQUEST_GLOBAL_DAILY: "0" } });
    const b = await startPriceRequest({ pinhuntId: "PHUK-00000001", origin: "batch", userId: null }, deps);
    expect(b.kind).toBe("started");
    expect(await startPriceRequest({ pinhuntId: "PHUK-00000001", origin: "batch", userId: null }, deps)).toEqual({ kind: "in_flight" });
    if (b.kind === "started") await b.done;
    expect((await startPriceRequest({ pinhuntId: "PHUK-00000001", origin: "batch", userId: null }, deps)).kind).toBe("cached");
    expect(log.rows[0]).toMatchObject({ origin: "batch", userId: null });
  });

  it("requires a user for a collector's request", async () => {
    const { deps } = setup();
    await expect(ask(deps, "PHUK-00000001", null)).rejects.toThrow(/user required/);
  });
});

// ─── Monthly budget (hard stop) ──────────────────────────────────────────────

describe("monthly budget", () => {
  it("refuses, without claiming or calling Soldgraph, when the worst case is more than what is left", async () => {
    const { deps, db, log, createClient } = setup();
    db.budgetStatus = { ...db.budgetStatus, usedCredits: 99, limitCredits: 100 };
    expect(await ask(deps)).toEqual({ kind: "budget", remainingCredits: 1, worstCaseCredits: 2 });
    expect(log.claims).toHaveLength(0);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("keeps the configured reserve for the maintainer", async () => {
    const { deps, db } = setup({ env: { ...ENV_ON, MARKET_PRICE_REQUEST_BUDGET_RESERVE: "20" } });
    db.budgetStatus = { ...db.budgetStatus, usedCredits: 79, limitCredits: 100 };
    expect(await ask(deps)).toMatchObject({ kind: "budget", remainingCredits: 1 });
    db.budgetStatus = { ...db.budgetStatus, usedCredits: 78 };
    expect((await ask(deps)).kind).toBe("started");
  });

  it("refuses when the month's budget is not a hard stop", async () => {
    const { deps, db, log } = setup();
    db.budgetStatus = { ...db.budgetStatus, hardStop: false };
    expect(await ask(deps)).toEqual({ kind: "unavailable", reason: "budget_not_hard_stop" });
    expect(log.claims).toHaveLength(0);
  });

  it("closes as 'stopped' (not cached) when the budget runs out part way", async () => {
    const { deps, log } = setup({ behaviour: { us: new BudgetExceededError("2026-10", 100, 100) } });
    const { done } = await askAndWait(deps);
    expect(done).toMatchObject({ status: "failed", outcome: "stopped" });
    expect(log.rows[0]).toMatchObject({ status: "failed", outcome: "stopped" });
    expect((await ask(deps)).kind).toBe("started");
  });

  it("never sends more searches than the planned worst case", async () => {
    const { deps, sg } = setup();
    await askAndWait(deps);
    expect(sg.search.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

// ─── Status (what the app polls) ─────────────────────────────────────────────

describe("status", () => {
  const status = (deps: PriceRequestDeps, pin = "PHUK-00000001") => priceRequestStatus(uuidOf(pin), deps);

  it("is 'none' and open before any request", async () => {
    const { deps } = setup();
    expect(await status(deps)).toEqual({ state: "none", checkedAt: null, nextRequestAt: null, requestsOpen: true, markets: ["UK", "US"] });
  });

  it("names only the markets a request would search", async () => {
    const { deps } = setup({ env: { ...ENV_ON, MARKET_VALUATION_PUBLISHED_MARKETS: "UK,FR" } });
    expect((await status(deps)).markets).toEqual(["UK"]);
  });

  it("reports closed requests when the switches are off", async () => {
    const { deps } = setup({ env: { ...ENV_ON, SOLDGRAPH_ENABLED: "false" } });
    expect((await status(deps)).requestsOpen).toBe(false);
  });

  it("is 'pending' while running, then 'priced' or 'no_sales' with the check date", async () => {
    const { deps } = setup({ behaviour: { uk: [], us: [] } });
    const r = await ask(deps);
    expect((await status(deps)).state).toBe("pending");
    if (r.kind === "started") await r.done;
    expect(await status(deps)).toEqual({
      state: "no_sales",
      checkedAt: new Date(NOW).toISOString(),
      nextRequestAt: new Date(NOW + 30 * DAY).toISOString(),
      requestsOpen: true,
      markets: ["UK", "US"],
    });
  });

  it("goes back to 'none' after a failure, an expired window, or a stuck pending row", async () => {
    const { deps, log, advance } = setup({ behaviour: { uk: new SoldgraphHttpError(500, "x", null) } });
    await askAndWait(deps);
    expect((await status(deps)).state).toBe("none");

    log.rows.push({ id: "p", pinUuid: uuidOf("PHUK-00000002"), userId: USER, origin: "user", status: "pending", outcome: null, sources: [], createdAt: new Date(NOW).toISOString(), finishedAt: null });
    expect((await status(deps, "PHUK-00000002")).state).toBe("pending");
    advance(11 * 60_000);
    expect((await status(deps, "PHUK-00000002")).state).toBe("none");

    log.rows.push({ id: "c", pinUuid: uuidOf("PHUK-00000003"), userId: USER, origin: "user", status: "complete", outcome: "priced", sources: requestSources(ENV_ON), createdAt: new Date(NOW).toISOString(), finishedAt: new Date(NOW).toISOString() });
    expect((await status(deps, "PHUK-00000003")).state).toBe("priced");
    advance(priceRequestLimits(ENV_ON).cacheDays * DAY);
    expect((await status(deps, "PHUK-00000003")).state).toBe("none");
  });
});

// ─── summarise ───────────────────────────────────────────────────────────────

describe("summarise", () => {
  const base = { plan: {} as RefreshResult["plan"], applied: true, blockers: [], creditsSpent: 2, listingsWritten: 0, storedRowsReplaced: 0, otherPinsRevalued: 0 };
  const pin = (over: object = {}) => ({
    pinhuntId: "P", cachedSources: [], searchesRun: 2, searchesFailed: 0, sharedSearches: 0, found: 0, accepted: 0,
    nearMisses: 0, rejectedReasons: {}, droppedAsDuplicate: 0, ...over,
  });
  const vals = (uk: [number, number | null], us: [number, number | null]) => ({
    status: "saved" as const,
    valuations: [
      { market: "UK", soldCount: uk[0], fair: uk[1] },
      { market: "US", soldCount: us[0], fair: us[1] },
    ] as unknown as MarketValuationV2[],
  });

  it("is priced when any requested market has sold evidence and a fair value", () => {
    expect(summarise({ ...base, pins: [pin({ valuation: vals([0, null], [3, 20]) })] }, ["UK", "US"]))
      .toEqual({ status: "complete", outcome: "priced", soldCounts: { UK: 0, US: 3 }, creditsSpent: 2 });
  });

  it("is no_sales when the only value comes from a market that wasn't requested", () => {
    expect(summarise({ ...base, pins: [pin({ valuation: vals([0, null], [3, 20]) })] }, ["UK"]))
      .toMatchObject({ status: "complete", outcome: "no_sales", soldCounts: { UK: 0 } });
  });

  it("fails when the refresh refused to apply, stopped, or could not revalue", () => {
    expect(summarise({ ...base, applied: false, blockers: ["worst case 2 credit(s) is more than the 1 left this month"], pins: [] }, ["UK"]).outcome).toBe("stopped");
    expect(summarise({ ...base, applied: false, blockers: ["market_sources not enabled for: x"], pins: [] }, ["UK"]).outcome).toBe("error");
    expect(summarise({ ...base, stoppedBy: "disabled", pins: [pin()] }, ["UK"]).outcome).toBe("stopped");
    expect(summarise({ ...base, pins: [pin({ valuation: { status: "disabled" } })] }, ["UK"]).outcome).toBe("error");
    expect(summarise({ ...base, pins: [pin({ valuation: { status: "error" } })] }, ["UK"]).outcome).toBe("error");
  });
});
