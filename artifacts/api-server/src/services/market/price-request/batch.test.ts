/**
 * Batch pricing: arguments, plan, blockers and the run loop's stops. The
 * request path itself (startPriceRequest) is covered in service.test.ts; here
 * it is replaced by a stub so each outcome can be driven. No network.
 */
import { describe, expect, it, vi } from "vitest";
import {
  BatchUsageError,
  DEFAULT_BATCH_CACHE_DAYS,
  MAX_RUN_CREDITS,
  batchEnv,
  formatBatch,
  parseBatchArgs,
  runBatch,
  type BatchDeps,
  type BatchOptions,
  type BatchPin,
  type BatchStore,
} from "./batch";
import { unavailableReason, type FinishSummary, type StartInput, type StartResult } from "./service";

const NOW = Date.UTC(2026, 10, 14, 12);
const ON = {
  SOLDGRAPH_ENABLED: "true",
  SOLDGRAPH_API_KEY: "test-key-not-real",
  MARKET_VALUATION_V2_ENABLED: "true",
  MARKET_VALUATION_PUBLISHED_MARKETS: "UK,US",
} as NodeJS.ProcessEnv;

const pins = (n: number): BatchPin[] =>
  Array.from({ length: n }, (_, i) => ({ uuid: `uuid-${i}`, pinhuntId: `PHUK-${String(i).padStart(8, "0")}` }));

function store(all: BatchPin[], answered: string[] = [], budget = { usedCredits: 0, limitCredits: 2000, hardStop: true }) {
  const s: BatchStore & { listCalls: unknown[]; answeredCalls: unknown[] } = {
    listCalls: [],
    answeredCalls: [],
    async listPins(q) {
      s.listCalls.push(q);
      const end = q.limit === null ? undefined : q.offset + q.limit;
      return all.slice(q.offset, end);
    },
    async recentlyAnswered(uuids, sources, since) {
      s.answeredCalls.push({ uuids: uuids.length, sources, since });
      return new Set(answered.filter(u => uuids.includes(u)));
    },
    async budget() {
      return budget;
    },
  };
  return s;
}

const finished = (over: Partial<FinishSummary> = {}): FinishSummary =>
  ({ status: "complete", outcome: "priced", soldCounts: { UK: 3, US: 1 }, creditsSpent: 2, ...over }) as FinishSummary;
const started = (done: FinishSummary): StartResult => ({ kind: "started", requestId: "r", worstCaseCredits: 2, done: Promise.resolve(done) });

function deps(s: BatchStore, start: (i: StartInput) => StartResult | Promise<StartResult>, env = ON) {
  const startFn = vi.fn(async (input: StartInput, d: { env: NodeJS.ProcessEnv }) => {
    startFn.envs.push(d.env);
    return start(input);
  }) as ReturnType<typeof vi.fn> & { envs: NodeJS.ProcessEnv[] };
  startFn.envs = [];
  const progress = vi.fn();
  const d: BatchDeps = {
    store: s,
    request: {} as BatchDeps["request"],
    env,
    now: () => NOW,
    start: startFn as unknown as BatchDeps["start"],
    progress,
  };
  return { d, startFn, progress };
}

const args = (extra: string[] = []) => parseBatchArgs(["--markets", "UK,US", ...extra], () => "");
const applyArgs = (max: number, confirm: number, extra: string[] = []) =>
  args(["--max-credits", String(max), "--apply", "--confirm-credits", String(confirm), ...extra]);

// ─── Arguments ───────────────────────────────────────────────────────────────

describe("parseBatchArgs", () => {
  it("defaults to 2025–26 pins, a 180-day skip window, dry run", () => {
    expect(args()).toMatchObject({
      years: [2025, 2026], pinhuntIds: null, markets: ["UK", "US"], offset: 0, limit: null,
      cacheDays: DEFAULT_BATCH_CACHE_DAYS, maxCredits: null, confirmCredits: null, leaveCredits: 0, apply: false,
    });
  });

  it("requires --markets, UK and/or US only (FR has no sold source here)", () => {
    expect(() => parseBatchArgs([], () => "")).toThrow(/Give --markets/);
    expect(() => parseBatchArgs(["--markets", "FR"], () => "")).toThrow(/UK and\/or US/);
    expect(parseBatchArgs(["--markets", "us"], () => "").markets).toEqual(["US"]);
  });

  it("needs --max-credits with --apply, and caps it", () => {
    expect(() => args(["--apply"])).toThrow(/--max-credits/);
    expect(() => args(["--max-credits", String(MAX_RUN_CREDITS + 1)])).toThrow(BatchUsageError);
    expect(args(["--max-credits", "1000"]).maxCredits).toBe(1000);
  });

  it("takes --ids-file instead of --years, keeping order and refusing bad ids", () => {
    const o = parseBatchArgs(["--markets", "UK", "--ids-file", "f"], () => "# top pins\nPHUK-2\nPHUK-1\nPHUK-2\n");
    expect(o.pinhuntIds).toEqual(["PHUK-2", "PHUK-1"]);
    expect(() => parseBatchArgs(["--markets", "UK", "--ids-file", "f", "--years", "2025"], () => "PHUK-1")).toThrow(/not both/);
    expect(() => parseBatchArgs(["--markets", "UK", "--ids-file", "f"], () => "bad id!")).toThrow(/Not a PinHunt ID/);
  });

  it("refuses unknown or repeated options", () => {
    expect(() => args(["--everything", "yes"])).toThrow(/Unknown option --everything/);
    expect(() => args(["--limit", "1", "--limit", "2"])).toThrow(/twice/);
  });
});

// ─── Plan (dry run) ──────────────────────────────────────────────────────────

describe("dry run", () => {
  it("skips pins answered within the window, prices the rest at 2 credits each, and calls nothing", async () => {
    const s = store(pins(10), ["uuid-0", "uuid-1", "uuid-2"]);
    const { d, startFn } = deps(s, () => started(finished()));
    const r = await runBatch(args(), d);
    expect(r.plan).toMatchObject({ candidates: 10, alreadyAnswered: 3, toPrice: 7, creditsPerPin: 2, worstCaseAll: 14, pinsThisRun: 7, plannedCredits: 14, spendable: 2000 });
    expect(r.applied).toBe(false);
    expect(startFn).not.toHaveBeenCalled();
    expect(s.answeredCalls[0]).toMatchObject({ sources: ["soldgraph:ebay_gb_sold", "soldgraph:ebay_us_sold"], since: new Date(NOW - 180 * 86_400_000).toISOString() });
  });

  it("plans only as many pins as --max-credits allows (--markets UK: 1 credit each)", async () => {
    const { d } = deps(store(pins(50)), () => started(finished()));
    const r = await runBatch(parseBatchArgs(["--markets", "UK", "--max-credits", "20"], () => ""), d);
    expect(r.plan).toMatchObject({ markets: ["UK"], toPrice: 50, worstCaseAll: 50, pinsThisRun: 20, plannedCredits: 20, creditsPerPin: 1 });
  });

  it("refuses --markets the host doesn't publish, before reading anything", async () => {
    for (const published of ["", "FR", "UK"]) {
      const s = store(pins(5));
      const { d, startFn } = deps(s, () => started(finished()), { ...ON, MARKET_VALUATION_PUBLISHED_MARKETS: published });
      await expect(runBatch(args(), d)).rejects.toThrow(/not in MARKET_VALUATION_PUBLISHED_MARKETS/);
      expect(s.listCalls).toHaveLength(0);
      expect(startFn).not.toHaveBeenCalled();
    }
  });

  it("an odd ceiling rounds down to whole pins", async () => {
    const { d } = deps(store(pins(50)), () => started(finished()));
    expect((await runBatch(args(["--max-credits", "7"]), d)).plan).toMatchObject({ pinsThisRun: 3, plannedCredits: 6 });
  });

  it("passes --offset/--limit and --years to the store", async () => {
    const s = store(pins(10));
    const { d } = deps(s, () => started(finished()));
    const r = await runBatch(args(["--years", "2026", "--offset", "4", "--limit", "3"]), d);
    expect(s.listCalls[0]).toEqual({ years: [2026], pinhuntIds: null, offset: 4, limit: 3 });
    expect(r.plan.candidates).toBe(3);
  });

  it("prints counts and an approximate cost, no keys", async () => {
    const { d } = deps(store(pins(4)), () => started(finished()));
    const lines = formatBatch(await runBatch(args(), d), args()).join("\n");
    expect(lines).toMatch(/to price: 4/);
    expect(lines).toMatch(/Worst case for all 4: 8 credit\(s\) \(≈ \$0\.04/);
    expect(lines).toMatch(/Dry run: nothing was called/);
    expect(lines).not.toContain("test-key-not-real");
  });
});

// ─── Blockers ────────────────────────────────────────────────────────────────

describe("--apply blockers", () => {
  it.each([
    ["the kill switch is off", { ...ON, SOLDGRAPH_ENABLED: "" }, /SOLDGRAPH_ENABLED/],
    ["there is no key", { ...ON, SOLDGRAPH_API_KEY: "" }, /SOLDGRAPH_API_KEY/],
    ["valuation v2 is off", { ...ON, MARKET_VALUATION_V2_ENABLED: "" }, /MARKET_VALUATION_V2_ENABLED/],
  ])("refuses when %s", async (_l, env, re) => {
    const { d, startFn } = deps(store(pins(3)), () => started(finished()), env as NodeJS.ProcessEnv);
    const r = await runBatch(applyArgs(6, 6), d);
    expect(r.applied).toBe(false);
    expect(r.blockers.join("\n")).toMatch(re);
    expect(startFn).not.toHaveBeenCalled();
  });

  it("refuses a soft budget, a plan bigger than the budget left, and a wrong --confirm-credits", async () => {
    const soft = await runBatch(applyArgs(6, 6), deps(store(pins(3), [], { usedCredits: 0, limitCredits: 2000, hardStop: false }), () => started(finished())).d);
    expect(soft.blockers.join()).toMatch(/not a hard stop/);
    const tight = await runBatch(applyArgs(6, 6), deps(store(pins(3), [], { usedCredits: 1995, limitCredits: 2000, hardStop: true }), () => started(finished())).d);
    expect(tight.blockers.join()).toMatch(/more than the 5 this run may use/);
    const left = await runBatch(applyArgs(6, 6, ["--leave-credits", "1996"]), deps(store(pins(3)), () => started(finished())).d);
    expect(left.blockers.join()).toMatch(/more than the 4 this run may use/);
    // The host's reserve applies to a batch too, on top of --leave-credits.
    const reserved = await runBatch(applyArgs(6, 6, ["--leave-credits", "1990"]), deps(store(pins(3)), () => started(finished()), { ...ON, MARKET_PRICE_REQUEST_BUDGET_RESERVE: "8" }).d);
    expect(reserved.plan).toMatchObject({ reserve: 8, spendable: 2 });
    expect(reserved.blockers.join()).toMatch(/more than the 2 this run may use \(budget left minus the reserve and --leave-credits\)/);
    const wrong = await runBatch(applyArgs(6, 5), deps(store(pins(3)), () => started(finished())).d);
    expect(wrong.blockers.join()).toMatch(/must equal the planned credits shown \(6\), not 5/);
  });
});

// ─── Run ─────────────────────────────────────────────────────────────────────

describe("--apply", () => {
  it("prices each pin as a batch request (no user), with the batch's markets and window and the host's reserve", async () => {
    const { d, startFn } = deps(store(pins(3)), () => started(finished()));
    const r = await runBatch(applyArgs(6, 6), d);
    expect(r).toMatchObject({ applied: true, pinsTried: 3, creditsSpent: 6, counts: { priced: 3 } });
    expect(startFn.mock.calls.map(c => c[0])).toEqual(pins(3).map(p => ({ pinhuntId: p.pinhuntId, origin: "batch", userId: null })));
    const env = startFn.envs[0];
    expect(env).toMatchObject({ MARKET_VALUATION_PUBLISHED_MARKETS: "UK,US", MARKET_PRICE_REQUEST_CACHE_DAYS: "180" });
    expect(env.MARKET_PRICE_REQUEST_BUDGET_RESERVE).toBeUndefined();
    expect(r.stoppedBy).toBeUndefined();
  });

  it("does not need the collector flag: the request path sees requests as open", () => {
    expect(unavailableReason(batchEnv({ ...ON, MARKET_PRICE_REQUEST_ENABLED: "false" }, { cacheDays: 180, markets: ["UK"] }))).toBeNull();
  });

  it("can narrow the published markets but never widen them, and keeps the reserve", () => {
    const host = { ...ON, MARKET_VALUATION_PUBLISHED_MARKETS: "UK,US", MARKET_PRICE_REQUEST_BUDGET_RESERVE: "25" };
    expect(batchEnv(host, { cacheDays: 180, markets: ["US"] })).toMatchObject({ MARKET_VALUATION_PUBLISHED_MARKETS: "US", MARKET_PRICE_REQUEST_BUDGET_RESERVE: "25" });
    expect(() => batchEnv({ ...host, MARKET_VALUATION_PUBLISHED_MARKETS: "UK" }, { cacheDays: 180, markets: ["UK", "US"] })).toThrow(/--markets US is not in MARKET_VALUATION_PUBLISHED_MARKETS \(UK\)/);
  });

  it("counts every outcome and carries on past cached, running-elsewhere and no-sales pins", async () => {
    const outcomes: StartResult[] = [
      started(finished({ outcome: "no_sales", soldCounts: { UK: 0, US: 0 } })),
      { kind: "cached", outcome: "priced", checkedAt: "x", nextRequestAt: null },
      { kind: "in_flight" },
      { kind: "not_found" },
      started(finished({ creditsSpent: 0 })),
    ];
    const { d } = deps(store(pins(5)), () => outcomes.shift()!);
    const r = await runBatch(applyArgs(10, 10), d);
    expect(r.counts).toEqual({ priced: 1, noSales: 1, cached: 1, inFlight: 1, failed: 0, notFound: 1 });
    expect(r.creditsSpent).toBe(2);
    expect(r.pinsTried).toBe(5);
  });

  it("stops on the monthly budget (refused before a claim, or stopped part way)", async () => {
    const a = await runBatch(applyArgs(10, 10), deps(store(pins(5)), (() => {
      let n = 0;
      return () => (++n === 3 ? { kind: "budget", remainingCredits: 1, worstCaseCredits: 2 } : started(finished()));
    })()).d);
    expect(a).toMatchObject({ stoppedBy: "budget", pinsTried: 3, counts: { priced: 2 } });
    const b = await runBatch(applyArgs(10, 10), deps(store(pins(5)), () => started(finished({ status: "failed", outcome: "stopped", soldCounts: null, creditsSpent: 1 } as FinishSummary))).d);
    expect(b).toMatchObject({ stoppedBy: "budget", pinsTried: 1, creditsSpent: 1 });
  });

  it("stops after N failures in a row, but a success resets the count", async () => {
    const fail = finished({ status: "failed", outcome: "error", soldCounts: null, creditsSpent: 0 } as FinishSummary);
    const seq = [fail, fail, finished(), fail, fail, fail];
    const { d } = deps(store(pins(10)), () => started(seq.shift() ?? finished()));
    const r = await runBatch(applyArgs(20, 20, ["--stop-after-errors", "3"]), d);
    expect(r).toMatchObject({ stoppedBy: "errors", pinsTried: 6, counts: { failed: 5, priced: 1 } });
  });

  it("stops when the request path becomes unavailable (e.g. kill switch turned off)", async () => {
    const { d } = deps(store(pins(5)), () => ({ kind: "unavailable", reason: "provider_off" }));
    expect(await runBatch(applyArgs(10, 10), d)).toMatchObject({ stoppedBy: "unavailable", stopDetail: "provider_off", pinsTried: 1 });
  });

  it("never passes the planned credits, and reports progress every 25 pins", async () => {
    const { d, startFn, progress } = deps(store(pins(100)), () => started(finished()));
    const r = await runBatch(applyArgs(60, 60), d);
    expect(r.creditsSpent).toBe(60);
    expect(startFn).toHaveBeenCalledTimes(30);
    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress.mock.calls[0][0]).toMatch(/25\/30 pins · 50 credit/);
  });

  it("prints a summary and how to resume", async () => {
    const { d } = deps(store(pins(5)), () => ({ kind: "budget", remainingCredits: 0, worstCaseCredits: 2 }));
    const o = applyArgs(10, 10);
    const text = formatBatch(await runBatch(o, d), o).join("\n");
    expect(text).toMatch(/Stopped early \(budget/);
    expect(text).toMatch(/Re-run the same command to continue/);
  });
});
