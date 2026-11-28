/**
 * Admin "Price pins": input checks, plan, the confirmation rule, one run at a
 * time, progress and Stop. The request path is a stub. No network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BatchUsageError,
  adminBatchStatus,
  parseAdminBatchInput,
  planAdminBatch,
  resetAdminBatchForTests,
  startAdminBatch,
  stopAdminBatch,
  type AdminBatchDeps,
} from "./admin-batch";
import type { BatchPin, BatchStore } from "./batch";
import type { FinishSummary, StartInput, StartResult } from "./service";

const NOW = Date.UTC(2026, 10, 28, 12);
const ON = {
  SOLDGRAPH_ENABLED: "true",
  SOLDGRAPH_API_KEY: "test-key-not-real",
  MARKET_VALUATION_V2_ENABLED: "true",
  MARKET_VALUATION_PUBLISHED_MARKETS: "UK,US",
} as NodeJS.ProcessEnv;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `PHUK-${String(i).padStart(8, "0")}`);

function store(answered: string[] = [], budget = { usedCredits: 0, limitCredits: 100, hardStop: true }): BatchStore {
  return {
    async listPins(q) {
      return (q.pinhuntIds ?? []).map((id): BatchPin => ({ uuid: `u-${id}`, pinhuntId: id }));
    },
    async recentlyAnswered(uuids) {
      return new Set(answered.filter(u => uuids.includes(u)));
    },
    async budget() {
      return budget;
    },
  };
}

const finished: FinishSummary = { status: "complete", outcome: "priced", soldCounts: { UK: 3, US: 1 }, creditsSpent: 2 } as FinishSummary;

function deps(opts: { popular?: string[]; s?: BatchStore; env?: NodeJS.ProcessEnv; start?: (i: StartInput) => Promise<StartResult> } = {}) {
  const start = vi.fn(opts.start ?? (async (): Promise<StartResult> => ({ kind: "started", requestId: "r", worstCaseCredits: 2, done: Promise.resolve(finished) })));
  const d: AdminBatchDeps = {
    store: opts.s ?? store(),
    request: {} as AdminBatchDeps["request"],
    env: opts.env ?? ON,
    now: () => NOW,
    start: start as unknown as AdminBatchDeps["start"],
    popularPinhuntIds: vi.fn(async (n: number) => (opts.popular ?? ids(10)).slice(0, n)),
  };
  return { d, start };
}

const body = (over: Record<string, unknown> = {}) => ({ pins: { kind: "popular", count: 5 }, maxCredits: 100, ...over });

afterEach(() => resetAdminBatchForTests());

describe("parseAdminBatchInput", () => {
  it("defaults markets to the published ones and the re-check window to 30 days", () => {
    const i = parseAdminBatchInput(body(), ON);
    expect(i.markets).toEqual(["UK", "US"]);
    expect(i.cacheDays).toBe(30);
    expect(i.confirmCredits).toBeNull();
  });

  it("takes pasted IDs separated by spaces, commas or new lines, without repeats", () => {
    const i = parseAdminBatchInput(body({ pins: { kind: "ids", pinhuntIds: "PHUK-1, PHUK-2\nPHUK-1" } }), ON);
    expect(i.pins).toEqual({ kind: "ids", pinhuntIds: ["PHUK-1", "PHUK-2"] });
  });

  it("refuses bad input", () => {
    expect(() => parseAdminBatchInput(body({ pins: { kind: "ids", pinhuntIds: "bad id!" } }), ON)).toThrow(BatchUsageError);
    expect(() => parseAdminBatchInput(body({ pins: { kind: "years" } }), ON)).toThrow(BatchUsageError);
    expect(() => parseAdminBatchInput(body({ maxCredits: 0 }), ON)).toThrow(BatchUsageError);
    expect(() => parseAdminBatchInput(body({ maxCredits: 20_000 }), ON)).toThrow(BatchUsageError);
    expect(() => parseAdminBatchInput(body({ markets: ["FR"] }), ON)).toThrow(BatchUsageError);
    expect(() => parseAdminBatchInput(body(), { ...ON, MARKET_VALUATION_PUBLISHED_MARKETS: "" })).toThrow(/No market/);
  });
});

describe("planAdminBatch", () => {
  it("prices the most collected pins, skipping ones answered recently, and calls nothing paid", async () => {
    const { d, start } = deps({ s: store(["u-PHUK-00000000"]) });
    const r = await planAdminBatch(parseAdminBatchInput(body(), ON), d);
    expect(d.popularPinhuntIds).toHaveBeenCalledWith(5);
    expect(r.plan).toMatchObject({ candidates: 5, alreadyAnswered: 1, toPrice: 4, plannedCredits: 8 });
    expect(r.blockers).toEqual([]);
    expect(start).not.toHaveBeenCalled();
  });

  it("says why it couldn't run", async () => {
    const off = await planAdminBatch(parseAdminBatchInput(body(), ON), deps({ env: { ...ON, SOLDGRAPH_ENABLED: "false" } }).d);
    expect(off.blockers.join()).toMatch(/SOLDGRAPH_ENABLED/);
    const soft = await planAdminBatch(parseAdminBatchInput(body(), ON), deps({ s: store([], { usedCredits: 0, limitCredits: 100, hardStop: false }) }).d);
    expect(soft.blockers.join()).toMatch(/hard stop/);
    const none = await planAdminBatch(parseAdminBatchInput(body(), ON), deps({ popular: [] }).d);
    expect(none.blockers.join()).toMatch(/no pins matched/);
  });
});

describe("startAdminBatch", () => {
  it("needs the planned credits confirmed", async () => {
    const { d, start } = deps();
    const r = await startAdminBatch(parseAdminBatchInput(body(), ON), d);
    expect(r.kind).toBe("refused");
    const wrong = await startAdminBatch(parseAdminBatchInput(body({ confirmCredits: 4 }), ON), d);
    expect(wrong.kind === "refused" && wrong.blockers.join()).toMatch(/now 10 credit/);
    expect(start).not.toHaveBeenCalled();
  });

  it("runs in the background, reports progress, and allows one run at a time", async () => {
    const { d, start } = deps();
    const r = await startAdminBatch(parseAdminBatchInput(body({ confirmCredits: 10 }), ON), d);
    expect(r.kind).toBe("started");
    const again = await startAdminBatch(parseAdminBatchInput(body({ confirmCredits: 10 }), ON), d);
    expect(again.kind).toBe("running");
    if (r.kind === "started") await r.done;
    expect(start).toHaveBeenCalledTimes(5);
    expect(start.mock.calls[0][0]).toMatchObject({ origin: "batch", userId: null });
    expect(adminBatchStatus()).toMatchObject({ state: "finished", tried: 5, creditsSpent: 10, counts: { priced: 5 } });
  });

  it("stops before the next pin when asked", async () => {
    let release!: () => void;
    const gate = new Promise<void>(res => { release = res; });
    const { d, start } = deps({
      start: async () => ({ kind: "started", requestId: "r", worstCaseCredits: 2, done: gate.then(() => finished) }),
    });
    const r = await startAdminBatch(parseAdminBatchInput(body({ confirmCredits: 10 }), ON), d);
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(stopAdminBatch()).toBe(true);
    release();
    if (r.kind === "started") await r.done;
    expect(start).toHaveBeenCalledTimes(1);
    expect(adminBatchStatus()).toMatchObject({ state: "finished", tried: 1, stoppedBy: "stopped" });
    expect(stopAdminBatch()).toBe(false);
  });
});
