/**
 * Market refresh (SG-06, #409): dry-run estimate, cache, TTL, dedupe, budget
 * stop, the 50-pin cap, near-miss storage, retention purge and the single
 * probe. The database is an in-memory fake and Soldgraph a fake client:
 * nothing here reaches a network.
 */
import { describe, expect, it, vi } from "vitest";
import type { CataloguePin } from "@workspace/pin-repository";
import { BudgetExceededError } from "../../soldgraph/errors";
import type { SoldgraphClient, SoldgraphSearchResult } from "../../soldgraph/client";
import { fixturePin } from "../__fixtures__/load";
import {
  MAX_PINS,
  RefreshUsageError,
  describeFields,
  isFresh,
  parseCliArgs,
  resolveCrossPinDuplicates,
  runProbe,
  runPurge,
  runRefresh,
  runUsageReport,
  type RefreshOptions,
} from "./refresh";
import { executeRefreshCli, formatProbe, formatRefresh } from "./cli";
import type {
  BudgetStatus,
  ExpiredCount,
  ListingKey,
  MarketListingRow,
  PinRef,
  RefreshStore,
  SourceRow,
  StoredAcceptedListing,
  UsageReportRow,
} from "./types";

const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const ON = {
  SOLDGRAPH_ENABLED: "true",
  SOLDGRAPH_API_KEY: "test-key-not-real",
  MARKET_VALUATION_V2_ENABLED: "true",
} as NodeJS.ProcessEnv;

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

const SOURCES: SourceRow[] = [
  { id: "soldgraph:ebay_gb_sold", provider: "soldgraph", market: "UK", evidenceType: "sold", enabled: true, retentionDays: 30 },
  { id: "soldgraph:ebay_fr_sold", provider: "soldgraph", market: "FR", evidenceType: "sold", enabled: false, retentionDays: 30 },
  { id: "soldgraph:vinted_gb_active", provider: "soldgraph", market: "UK", evidenceType: "active", enabled: true, retentionDays: 14 },
];

function pinRef(uuid: string, pinhuntId: string, pin: CataloguePin = fixturePin("hatbox")): PinRef {
  return { uuid, pinhuntId, pin: { ...pin, id: pinhuntId } };
}

type StoredRow = MarketListingRow & { first_seen_at: string };

class FakeStore implements RefreshStore {
  listings: StoredRow[] = [];
  revalued: string[] = [];
  deleted: ListingKey[] = [];
  upserts = 0;
  purged: Array<string | null> = [];
  budgetStatus: Omit<BudgetStatus, "month"> = { usedCredits: 0, requests: 0, limitCredits: 100, hardStop: true, origin: "default" };
  usage: UsageReportRow[] = [];

  constructor(public pins: PinRef[], public sources: SourceRow[] = SOURCES) {}

  async loadSources() { return this.sources; }
  async loadPins(ids: string[]) { return this.pins.filter(p => ids.includes(p.pinhuntId)); }
  async lastSeen(pinUuids: string[], sourceIds: string[], now: number) {
    const out = new Map<string, string>();
    for (const r of this.listings) {
      if (!pinUuids.includes(r.pin_id) || !sourceIds.includes(r.source_id) || Date.parse(r.expires_at) <= now) continue;
      const k = `${r.pin_id}|${r.source_id}`;
      if (!out.has(k) || Date.parse(r.last_seen_at) > Date.parse(out.get(k)!)) out.set(k, r.last_seen_at);
    }
    return out;
  }
  async acceptedFor(pairs: Array<{ sourceId: string; externalId: string }>): Promise<StoredAcceptedListing[]> {
    return this.listings
      .filter(r => r.accepted && pairs.some(p => p.sourceId === r.source_id && p.externalId === r.external_id))
      .map(r => ({ pinUuid: r.pin_id, sourceId: r.source_id, externalId: r.external_id, matchScore: r.match_score }));
  }
  async upsertListings(rows: MarketListingRow[]) {
    this.upserts += 1;
    for (const row of rows) {
      const i = this.listings.findIndex(r =>
        r.source_id === row.source_id && r.external_id === row.external_id && r.pin_id === row.pin_id);
      if (i >= 0) this.listings[i] = { ...this.listings[i], ...row };
      else this.listings.push({ ...row, first_seen_at: row.last_seen_at });
    }
  }
  async deleteListings(keys: ListingKey[]) {
    this.deleted.push(...keys);
    this.listings = this.listings.filter(r =>
      !keys.some(k => k.pinUuid === r.pin_id && k.sourceId === r.source_id && k.externalId === r.external_id));
  }
  async budget(month: string): Promise<BudgetStatus> { return { month, ...this.budgetStatus }; }
  async countExpired(sourceId: string | null, now: number): Promise<ExpiredCount[]> {
    return this.sources.filter(s => sourceId === null || s.id === sourceId).map(s => ({
      sourceId: s.id,
      count: this.listings.filter(r => r.source_id === s.id &&
        (Date.parse(r.expires_at) <= now || Date.parse(r.last_seen_at) + s.retentionDays * DAY <= now)).length,
    }));
  }
  async purgeExpired(sourceId: string | null) {
    this.purged.push(sourceId);
    const before = this.listings.length;
    const expired = await this.countExpired(sourceId, NOW);
    this.listings = this.listings.filter(r => {
      const s = this.sources.find(x => x.id === r.source_id)!;
      const gone = (sourceId === null || r.source_id === sourceId) &&
        (Date.parse(r.expires_at) <= NOW || Date.parse(r.last_seen_at) + s.retentionDays * DAY <= NOW);
      return !gone;
    });
    expect(before - this.listings.length).toBe(expired.reduce((n, e) => n + e.count, 0));
    return before - this.listings.length;
  }
  async usageRows(from: string) { return this.usage.filter(u => u.month >= from); }
  async budgets() { return []; }
  async revalue(uuid: string) {
    this.revalued.push(uuid);
    return { status: "saved" as const, valuations: [] };
  }
}

/** A stored row as the refresh would have written it. */
function storedRow(over: Partial<StoredRow>): StoredRow {
  return {
    source_id: "soldgraph:ebay_gb_sold", external_id: "old-1", pin_id: UUID_A, title: "Hatbox Ghost pin",
    price: 20, shipping: null, currency: "GBP", sold_date: iso(10), price_kind: "sold", best_offer_accepted: false,
    listing_url: null, match_score: 80, accepted: true, rejection_reason: null, parsed: {},
    first_seen_at: iso(1), last_seen_at: iso(1), expires_at: new Date(NOW + 29 * DAY).toISOString(),
    ...over,
  };
}

const SOLD_ROWS = [
  {
    item_id: "uk-1", title: "Disney Hatbox Ghost pin LE 2000 Haunted Mansion 50th", price: { value: "24.99", currency: "GBP" },
    sold_date: "2026-10-10T10:00:00Z", best_offer_accepted: false, url: "https://www.ebay.co.uk/itm/1?x=1",
    image_url: "https://i.ebayimg.example/IMAGE_SENTINEL.jpg", seller: { username: "SELLER_SENTINEL" },
  },
  {
    item_id: "uk-2", title: "Disney Hatbox Ghost pin LE 500 Haunted Mansion 50th", price: 40, currency: "GBP",
    sold_date: "2026-10-09T10:00:00Z", best_offer_accepted: false,
  },
  { item_id: "uk-3", title: "Mickey Mouse fridge magnet", price: 3, currency: "GBP", sold_date: "2026-10-09T10:00:00Z" },
];

function fakeClient(rows: unknown[] = SOLD_ROWS, opts: { failOn?: number; error?: Error } = {}) {
  let n = 0;
  const search = vi.fn(async (_route: string, _params?: unknown, _opts?: unknown): Promise<SoldgraphSearchResult<unknown>> => {
    n += 1;
    if (opts.failOn !== undefined && n >= opts.failOn) throw opts.error ?? new BudgetExceededError("2026-10", 100, 100);
    return { rows, pages: 1, truncated: false, requestIds: [] };
  });
  return { client: { search } as unknown as SoldgraphClient, search };
}

function opts(over: Partial<RefreshOptions> = {}): RefreshOptions {
  return {
    command: "refresh", pinhuntIds: ["PHUK-A"], sources: ["soldgraph:ebay_gb_sold"], queriesPerSource: 1,
    soldTtlDays: 7, activeTtlDays: 2, apply: false, confirmCredits: null, ...over,
  };
}

function deps(store: FakeStore, client?: SoldgraphClient, env: NodeJS.ProcessEnv = ON) {
  const createClient = vi.fn(() => {
    if (!client) throw new Error("no client in this test");
    return client;
  });
  return { d: { store, env, now: () => NOW, createClient }, createClient };
}

// ─── Arguments ───────────────────────────────────────────────────────────────

describe("parseCliArgs", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `PHUK-${String(i).padStart(8, "0")}`);

  it("defaults to a dry run of the refresh command", () => {
    const o = parseCliArgs(["--pinhunt-ids", "PHUK-1,PHUK-2,PHUK-1", "--sources", "soldgraph:ebay_gb_sold"]);
    expect(o).toMatchObject({ command: "refresh", pinhuntIds: ["PHUK-1", "PHUK-2"], apply: false, confirmCredits: null, queriesPerSource: 1, soldTtlDays: 7, activeTtlDays: 2 });
  });

  it(`refuses a list of more than ${MAX_PINS} pins, from flags or a file`, () => {
    expect(() => parseCliArgs(["--pinhunt-ids", ids(51).join(","), "--sources", "soldgraph:ebay_gb_sold"])).toThrow(RefreshUsageError);
    expect(() => parseCliArgs(["--ids-file", "f.txt", "--sources", "soldgraph:ebay_gb_sold"], () => ids(51).join("\n"))).toThrow(/most per run is 50/);
    expect(parseCliArgs(["--ids-file", "f.txt", "--sources", "soldgraph:ebay_gb_sold"], () => `# pilot\n${ids(50).join("\n")}\n`).command).toBe("refresh");
  });

  it("has no --all, and needs an explicit pin and source list", () => {
    expect(() => parseCliArgs(["--all", "--sources", "soldgraph:ebay_gb_sold"])).toThrow(/no --all/);
    expect(() => parseCliArgs(["--sources", "soldgraph:ebay_gb_sold"])).toThrow(/--pinhunt-ids/);
    expect(() => parseCliArgs(["--pinhunt-ids", "PHUK-1"])).toThrow(/--sources/);
    expect(() => parseCliArgs(["--pinhunt-ids", "PHUK-1", "--sources", "ebay_browse:ebay_gb_active"])).toThrow(/Unknown source/);
  });

  it("only takes --confirm-credits with --apply, and checks numbers", () => {
    const base = ["--pinhunt-ids", "PHUK-1", "--sources", "soldgraph:ebay_gb_sold"];
    expect(() => parseCliArgs([...base, "--confirm-credits", "2"])).toThrow(/only goes with --apply/);
    expect(parseCliArgs([...base, "--apply", "--confirm-credits", "2"])).toMatchObject({ apply: true, confirmCredits: 2 });
    expect(() => parseCliArgs([...base, "--queries-per-source", "4"])).toThrow(/1 to 3/);
    expect(() => parseCliArgs([...base, "--sold-ttl-days", "0"])).toThrow();
    expect(() => parseCliArgs([...base, "--bogus", "1"])).toThrow(/Unknown flag/);
  });

  it("parses probe and purge", () => {
    expect(parseCliArgs(["probe", "--pinhunt-id", "PHUK-1", "--source", "soldgraph:vinted_gb_active"]))
      .toMatchObject({ command: "probe", pinhuntId: "PHUK-1", source: "soldgraph:vinted_gb_active", apply: false });
    expect(parseCliArgs(["purge"])).toEqual({ command: "purge", source: null, apply: false });
    expect(() => parseCliArgs(["purge", "--apply", "--confirm-credits", "1"])).toThrow(/no provider calls/);
    expect(() => parseCliArgs(["delete-everything"])).toThrow(/Unknown command/);
  });
});

// ─── Cache and TTL ───────────────────────────────────────────────────────────

describe("isFresh", () => {
  it("is fresh inside the TTL and stale at or after it", () => {
    expect(isFresh(iso(6.9), 7, NOW)).toBe(true);
    expect(isFresh(iso(7), 7, NOW)).toBe(false);
    expect(isFresh(iso(1.5), 2, NOW)).toBe(true);
    expect(isFresh(iso(2.5), 2, NOW)).toBe(false);
    expect(isFresh(undefined, 7, NOW)).toBe(false);
    expect(isFresh("not a date", 7, NOW)).toBe(false);
  });
});

describe("runRefresh: dry run", () => {
  it("prints the worst-case credits and month budget, and calls and writes nothing", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A", fixturePin("hatbox")), pinRef(UUID_B, "PHUK-B", fixturePin("tink"))]);
    store.budgetStatus.usedCredits = 10;
    const { d, createClient } = deps(store);
    const r = await runRefresh(opts({ pinhuntIds: ["PHUK-A", "PHUK-B", "PHUK-NOPE"], sources: ["soldgraph:ebay_gb_sold", "soldgraph:vinted_gb_active"] }), d);
    expect(r.applied).toBe(false);
    expect(r.plan.worstCaseCredits).toBe(4); // 2 pins × 2 sources × 1 query
    expect(r.plan.remainingCredits).toBe(90);
    expect(r.plan.overBudget).toBe(false);
    expect(r.plan.missingPins).toEqual(["PHUK-NOPE"]);
    expect(createClient).not.toHaveBeenCalled();
    expect(store.upserts).toBe(0);
    expect(store.revalued).toEqual([]);
    const text = formatRefresh(r, opts({ sources: ["soldgraph:ebay_gb_sold", "soldgraph:vinted_gb_active"] }), ON).join("\n");
    expect(text).toMatch(/Worst case: 4 credit/);
    expect(text).toMatch(/10 of 100 credits used/);
    expect(text).toMatch(/--apply --confirm-credits 4/);
  });

  it("counts more queries per source in the worst case", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    const r = await runRefresh(opts({ queriesPerSource: 3 }), deps(store).d);
    expect(r.plan.worstCaseCredits).toBe(3);
  });

  it("reports sources missing or disabled in market_sources", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")], SOURCES.filter(s => s.id !== "soldgraph:vinted_gb_active"));
    const r = await runRefresh(opts({ sources: ["soldgraph:ebay_fr_sold", "soldgraph:vinted_gb_active"] }), deps(store).d);
    expect(r.plan.disabledSources).toEqual(["soldgraph:ebay_fr_sold"]);
    expect(r.plan.missingSources).toEqual(["soldgraph:vinted_gb_active"]);
  });
});

describe("runRefresh: cache", () => {
  it("a fresh stored listing for (pin, source) means no call", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    store.listings.push(storedRow({ last_seen_at: iso(3) }));
    const { client, search } = fakeClient();
    const { d, createClient } = deps(store, client);
    const plan = await runRefresh(opts(), d);
    expect(plan.plan.pins[0].cachedSources).toEqual(["soldgraph:ebay_gb_sold"]);
    expect(plan.plan.worstCaseCredits).toBe(0);

    const r = await runRefresh(opts({ apply: true, confirmCredits: 0 }), d);
    expect(r.applied).toBe(true);
    expect(search).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(r.creditsSpent).toBe(0);
    // Still revalued from stored evidence.
    expect(store.revalued).toEqual([UUID_A]);
  });

  it("searches again once the TTL has passed (sold 7 days, active 2 days)", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    store.listings.push(storedRow({ last_seen_at: iso(8) }));
    store.listings.push(storedRow({ source_id: "soldgraph:vinted_gb_active", external_id: "v-1", price_kind: "active", sold_date: null, best_offer_accepted: null, last_seen_at: iso(3) }));
    const r = await runRefresh(opts({ sources: ["soldgraph:ebay_gb_sold", "soldgraph:vinted_gb_active"] }), deps(store).d);
    expect(r.plan.pins[0].cachedSources).toEqual([]);
    expect(r.plan.worstCaseCredits).toBe(2);

    // A shorter TTL flag, or a fresher row, flips each one.
    store.listings[1].last_seen_at = iso(1);
    const r2 = await runRefresh(opts({ sources: ["soldgraph:ebay_gb_sold", "soldgraph:vinted_gb_active"], soldTtlDays: 9 }), deps(store).d);
    expect(r2.plan.pins[0].cachedSources.sort()).toEqual(["soldgraph:ebay_gb_sold", "soldgraph:vinted_gb_active"]);
    expect(r2.plan.worstCaseCredits).toBe(0);
  });

  it("an expired row is not a cache hit", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    store.listings.push(storedRow({ last_seen_at: iso(1), expires_at: iso(0.5) }));
    const r = await runRefresh(opts(), deps(store).d);
    expect(r.plan.worstCaseCredits).toBe(1);
  });
});

// ─── Apply ───────────────────────────────────────────────────────────────────

describe("runRefresh: apply", () => {
  it("stores accepted matches and near-misses only, without images or seller data, then revalues", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    const { client, search } = fakeClient();
    const r = await runRefresh(opts({ apply: true, confirmCredits: 1 }), deps(store, client).d);
    expect(r.applied).toBe(true);
    expect(search).toHaveBeenCalledTimes(1);
    expect(r.creditsSpent).toBe(1);
    expect(search.mock.calls[0]).toEqual(["ebay/sold", expect.objectContaining({ country: "uk" }), expect.objectContaining({ pinId: UUID_A, maxPages: 1 })]);

    const byId = Object.fromEntries(store.listings.map(l => [l.external_id, l]));
    expect(Object.keys(byId).sort()).toEqual(["uk-1", "uk-2"]); // the magnet is not stored
    expect(byId["uk-1"]).toMatchObject({ accepted: true, rejection_reason: null, price: 24.99, currency: "GBP", price_kind: "sold", listing_url: "https://www.ebay.co.uk/itm/1" });
    expect(byId["uk-2"]).toMatchObject({ accepted: false, rejection_reason: "edition_size_conflict" });
    expect(byId["uk-2"].parsed).toMatchObject({ edition_size: 500 });
    expect(Date.parse(byId["uk-1"].expires_at) - NOW).toBe(30 * DAY);
    expect(JSON.stringify(store.listings)).not.toMatch(/SENTINEL|image|seller/i);
    expect(r.pins[0]).toMatchObject({ pinhuntId: "PHUK-A", searchesRun: 1, accepted: 1, nearMisses: 1 });
    expect(store.revalued).toEqual([UUID_A]);
  });

  it("upserts on (source, item, pin): a second run updates last_seen_at instead of adding rows", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    const { client } = fakeClient();
    await runRefresh(opts({ apply: true, confirmCredits: 1 }), deps(store, client).d);
    const first = store.listings.find(l => l.external_id === "uk-1")!.first_seen_at;
    const later = { ...deps(store, client).d, now: () => NOW + 8 * DAY };
    await runRefresh(opts({ apply: true, confirmCredits: 1 }), later);
    expect(store.listings.filter(l => l.external_id === "uk-1")).toHaveLength(1);
    const row = store.listings.find(l => l.external_id === "uk-1")!;
    expect(row.first_seen_at).toBe(first);
    expect(row.last_seen_at).toBe(new Date(NOW + 8 * DAY).toISOString());
  });

  it("runs an identical search once for two pins, and keeps a shared listing on one pin only", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A"), pinRef(UUID_B, "PHUK-B")]);
    const { client, search } = fakeClient();
    const d = deps(store, client).d;
    const plan = await runRefresh(opts({ pinhuntIds: ["PHUK-A", "PHUK-B"] }), d);
    expect(plan.plan.uniqueSearches).toBe(1);
    expect(plan.plan.sharedSearches).toBe(1);
    expect(plan.plan.worstCaseCredits).toBe(1);

    const r = await runRefresh(opts({ pinhuntIds: ["PHUK-A", "PHUK-B"], apply: true, confirmCredits: 1 }), d);
    expect(search).toHaveBeenCalledTimes(1);
    expect(r.pins.map(p => [p.searchesRun, p.sharedSearches])).toEqual([[1, 0], [0, 1]]);
    const accepted = store.listings.filter(l => l.external_id === "uk-1" && l.accepted);
    expect(accepted.map(l => l.pin_id)).toEqual([UUID_A]);
    expect(r.pins[1]).toMatchObject({ droppedAsDuplicate: 1, accepted: 0 });
  });

  it("moves a stored duplicate off a worse-matching pin and revalues that pin", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    store.listings.push(storedRow({ pin_id: UUID_C, external_id: "uk-1", match_score: 1, last_seen_at: iso(10) }));
    const { client } = fakeClient();
    const r = await runRefresh(opts({ apply: true, confirmCredits: 1 }), deps(store, client).d);
    expect(store.deleted).toEqual([{ pinUuid: UUID_C, sourceId: "soldgraph:ebay_gb_sold", externalId: "uk-1" }]);
    expect(store.listings.filter(l => l.external_id === "uk-1").map(l => l.pin_id)).toEqual([UUID_A]);
    expect(r.otherPinsRevalued).toBe(1);
    expect(store.revalued).toEqual([UUID_A, UUID_C]);
  });

  it("keeps the stored duplicate if storing the better match fails", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    store.listings.push(storedRow({ pin_id: UUID_C, external_id: "uk-1", match_score: 1, last_seen_at: iso(10) }));
    store.upsertListings = async () => { throw new Error("db down"); };
    const { client } = fakeClient();
    await expect(runRefresh(opts({ apply: true, confirmCredits: 1 }), deps(store, client).d)).rejects.toThrow("db down");
    expect(store.deleted).toEqual([]);
    expect(store.listings.filter(l => l.external_id === "uk-1").map(l => l.pin_id)).toEqual([UUID_C]);
  });

  it("does not store a match that a stored row on another pin beats", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    store.listings.push(storedRow({ pin_id: UUID_C, external_id: "uk-1", match_score: 999, last_seen_at: iso(10) }));
    const { client } = fakeClient();
    const r = await runRefresh(opts({ apply: true, confirmCredits: 1 }), deps(store, client).d);
    expect(store.listings.filter(l => l.external_id === "uk-1").map(l => l.pin_id)).toEqual([UUID_C]);
    expect(r.pins[0].droppedAsDuplicate).toBe(1);
  });
});

describe("runRefresh: budget and confirmation", () => {
  it("stops before any call when the worst case is over the month's remaining budget", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A"), pinRef(UUID_B, "PHUK-B", fixturePin("tink"))]);
    store.budgetStatus.usedCredits = 99;
    const { client, search } = fakeClient();
    const { d, createClient } = deps(store, client);
    const r = await runRefresh(opts({ pinhuntIds: ["PHUK-A", "PHUK-B"], apply: true, confirmCredits: 2 }), d);
    expect(r.plan.overBudget).toBe(true);
    expect(r.applied).toBe(false);
    expect(r.blockers.join("\n")).toMatch(/more than the 1 left/);
    expect(createClient).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(store.upserts).toBe(0);
    expect(await executeRefreshCli(opts({ pinhuntIds: ["PHUK-A", "PHUK-B"], apply: true, confirmCredits: 2 }), { store, env: ON, now: () => NOW, print: () => {} })).toBe(1);
  });

  it("needs --confirm-credits equal to the worst case, the kill switch and a key", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    const { client, search } = fakeClient();
    const missing = await runRefresh(opts({ apply: true }), deps(store, client).d);
    expect(missing.blockers).toContain("--confirm-credits 1 is required with --apply");
    const wrong = await runRefresh(opts({ apply: true, confirmCredits: 5 }), deps(store, client).d);
    expect(wrong.blockers.join()).toMatch(/must equal the worst case shown \(1\)/);
    const off = await runRefresh(opts({ apply: true, confirmCredits: 1 }), deps(store, client, { SOLDGRAPH_API_KEY: "x" }).d);
    expect(off.blockers.join()).toMatch(/SOLDGRAPH_ENABLED/);
    const noKey = await runRefresh(opts({ apply: true, confirmCredits: 1 }), deps(store, client, { SOLDGRAPH_ENABLED: "true" }).d);
    expect(noKey.blockers.join()).toMatch(/SOLDGRAPH_API_KEY is not set/);
    const disabled = await runRefresh(opts({ sources: ["soldgraph:ebay_fr_sold"], apply: true, confirmCredits: 1 }), deps(store, client).d);
    expect(disabled.blockers.join()).toMatch(/not enabled/);
    expect(search).not.toHaveBeenCalled();
  });

  it("stops the whole run when the client refuses on budget mid-run, keeping what it found", async () => {
    const pins = [pinRef(UUID_A, "PHUK-A"), pinRef(UUID_B, "PHUK-B", fixturePin("tink")), pinRef(UUID_C, "PHUK-C", fixturePin("steamboat"))];
    const store = new FakeStore(pins);
    const { client, search } = fakeClient(SOLD_ROWS, { failOn: 2 });
    const r = await runRefresh(opts({ pinhuntIds: ["PHUK-A", "PHUK-B", "PHUK-C"], apply: true, confirmCredits: 3 }), deps(store, client).d);
    expect(r.stoppedBy).toBe("budget");
    expect(search).toHaveBeenCalledTimes(2);
    expect(r.pins.map(p => p.pinhuntId)).toEqual(["PHUK-A", "PHUK-B"]);
    expect(store.listings.some(l => l.pin_id === UUID_A && l.accepted)).toBe(true);
    expect(store.revalued).toEqual([UUID_A, UUID_B]);
  });

  it("never sends more paid searches than confirmed", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    const { client, search } = fakeClient();
    // Two queries per source would be the plan; confirm matches, the run spends exactly that.
    const r = await runRefresh(opts({ queriesPerSource: 2, apply: true, confirmCredits: 2 }), deps(store, client).d);
    expect(search.mock.calls.length).toBeLessThanOrEqual(2);
    expect(r.creditsSpent).toBe(search.mock.calls.length);
  });
});

describe("resolveCrossPinDuplicates", () => {
  const k = (pinUuid: string, externalId = "x", sourceId = "s:a") => ({ pinUuid, sourceId, externalId });
  it("keeps the best score, prefers the stored row on a tie, ignores the same pin's stored row", () => {
    const d = resolveCrossPinDuplicates(
      [{ ...k(UUID_A), score: 70 }, { ...k(UUID_B), score: 90 }],
      [{ ...k(UUID_C), matchScore: 80 }, { ...k(UUID_B), matchScore: 10 }],
    );
    expect([...d.dropRun]).toEqual([`${UUID_A}|s:a|x`]);
    expect(d.deleteStored).toEqual([k(UUID_C)]);
    const tie = resolveCrossPinDuplicates([{ ...k(UUID_A), score: 80 }], [{ ...k(UUID_C), matchScore: 80 }]);
    expect([...tie.dropRun]).toEqual([`${UUID_A}|s:a|x`]);
    expect(tie.deleteStored).toEqual([]);
  });
});

// ─── Purge ───────────────────────────────────────────────────────────────────

describe("runPurge", () => {
  it("counts expired rows in a dry run and deletes them only with --apply", async () => {
    const store = new FakeStore([]);
    store.listings.push(
      storedRow({ external_id: "fresh" }),
      storedRow({ external_id: "expired", expires_at: iso(1) }),
      // Retention shortened since: 14 days for Vinted, seen 20 days ago.
      storedRow({ source_id: "soldgraph:vinted_gb_active", external_id: "old", price_kind: "active", sold_date: null, best_offer_accepted: null, last_seen_at: iso(20), expires_at: new Date(NOW + DAY).toISOString() }),
    );
    const dry = await runPurge({ command: "purge", source: null, apply: false }, deps(store).d);
    expect(dry.applied).toBe(false);
    expect(dry.expired.reduce((n, e) => n + e.count, 0)).toBe(2);
    expect(store.purged).toEqual([]);
    expect(store.listings).toHaveLength(3);

    const one = await runPurge({ command: "purge", source: "soldgraph:vinted_gb_active", apply: true }, deps(store).d);
    expect(one.deleted).toBe(1);
    expect(store.purged).toEqual(["soldgraph:vinted_gb_active"]);
    const all = await runPurge({ command: "purge", source: null, apply: true }, deps(store).d);
    expect(all.deleted).toBe(1);
    expect(store.listings.map(l => l.external_id)).toEqual(["fresh"]);
  });
});

// ─── Probe ───────────────────────────────────────────────────────────────────

describe("describeFields", () => {
  it("reports names and types only, never values", () => {
    const report = describeFields([
      SOLD_ROWS[0],
      { ...SOLD_ROWS[1], "SELLER_SENTINEL@example.com": 1, "has space": "x" },
      "not a row",
    ]);
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/SENTINEL|ebayimg|24\.99|Hatbox/);
    expect(report.rows).toBe(2);
    expect(report.hiddenKeys).toBe(2);
    expect(report.fields.find(f => f.name === "price")).toEqual({ name: "price", types: ["number", "object"], present: 2, nested: ["currency", "value"] });
    expect(report.fields.find(f => f.name === "seller")?.nested).toEqual(["username"]);
  });
});

describe("runProbe", () => {
  const probe = (over = {}) => ({ command: "probe" as const, pinhuntId: "PHUK-A", source: "soldgraph:ebay_gb_sold", apply: false, confirmCredits: null, ...over });

  it("dry run shows the route, query and budget, and makes no call", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    const { client, search } = fakeClient();
    const r = await runProbe(probe(), deps(store, client).d);
    expect(r).toMatchObject({ applied: false, route: "ebay/sold", country: "uk", pinFound: true, remainingCredits: 100 });
    expect(r.query).toMatch(/Hatbox Ghost/);
    expect(search).not.toHaveBeenCalled();
  });

  it("runs exactly one one-page search with --apply --confirm-credits 1 and prints field names only", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    const { client, search } = fakeClient();
    const r = await runProbe(probe({ apply: true, confirmCredits: 1 }), deps(store, client).d);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][2]).toMatchObject({ maxPages: 1, pinId: UUID_A });
    expect(r).toMatchObject({ applied: true, mapped: 3, matchAccepted: 1 });
    expect(r.matchRejected).toMatchObject({ edition_size_conflict: 1 });
    const text = formatProbe(r).join("\n");
    expect(text).toMatch(/item_id: string/);
    expect(text).not.toMatch(/SENTINEL|ebayimg|24\.99|Haunted Mansion 50th|uk-1/);
    expect(store.upserts).toBe(0);
  });

  it("refuses without confirmation, kill switch or budget", async () => {
    const store = new FakeStore([pinRef(UUID_A, "PHUK-A")]);
    store.budgetStatus.usedCredits = 100;
    const { client, search } = fakeClient();
    const r = await runProbe(probe({ apply: true, confirmCredits: 2 }), deps(store, client, {}).d);
    expect(r.applied).toBe(false);
    expect(r.blockers.join("\n")).toMatch(/SOLDGRAPH_ENABLED[\s\S]*no credits left[\s\S]*--confirm-credits 1/);
    expect(search).not.toHaveBeenCalled();
  });
});

// ─── Usage report ────────────────────────────────────────────────────────────

describe("runUsageReport", () => {
  it("groups credits and calls by month and route, with what is left", async () => {
    const store = new FakeStore([]);
    store.budgetStatus = { usedCredits: 3, requests: 4, limitCredits: 100, hardStop: true, origin: "default" };
    store.usage = [
      { month: "2026-10", route: "ebay/sold", status: "complete", credits: 1 },
      { month: "2026-10", route: "ebay/sold", status: "complete", credits: 1 },
      { month: "2026-10", route: "vinted/search", status: "failed", credits: 0 },
      { month: "2026-10", route: "vinted/search", status: "complete", credits: 1 },
      { month: "2026-09", route: "ebay/sold", status: "complete", credits: 1 },
    ];
    const months = await runUsageReport({ months: 2, usdPerCredit: 0.0045 }, deps(store).d);
    expect(months.map(m => m.month)).toEqual(["2026-09", "2026-10"]);
    expect(months[1]).toMatchObject({ credits: 3, requests: 4, remainingCredits: 97, estimatedUsd: 0.01 });
    expect(months[1].byRoute).toEqual([
      { route: "ebay/sold", credits: 2, requests: 2, failed: 0 },
      { route: "vinted/search", credits: 1, requests: 2, failed: 1 },
    ]);
  });
});
