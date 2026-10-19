import { describe, expect, it, vi } from "vitest";
import {
  BudgetExceededError,
  InMemoryUsageStore,
  ProviderDisabledError,
  ProviderUnavailableError,
  RateLimiter,
  SoldgraphHttpError,
  SoldgraphTimeoutError,
  createSoldgraphClient,
  defaultSoldgraphBudget,
  soldgraphCreditsForCall,
  type SoldgraphClientOptions,
  type SoldgraphClock,
  type SoldgraphReservation,
  type SoldgraphReserveRequest,
  type SoldgraphUsageRecord,
} from "./client";

const KEY = "sg_test_SECRET_KEY_123";
const START = Date.UTC(2026, 9, 18, 12, 0, 0);
const MONTH = "2026-10";

function fakeClock(): SoldgraphClock & { t: number; sleeps: number[] } {
  const c = {
    t: START,
    sleeps: [] as number[],
    now: () => c.t,
    sleep: async (ms: number) => {
      c.sleeps.push(ms);
      c.t += ms;
    },
  };
  return c;
}

function res(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const complete = (data: unknown[] = [{ id: "1" }], extra: Record<string, unknown> = {}) => ({
  status: "complete",
  result: { data, next_page: null, next_cursor: null, ...extra },
});

function setup(responses: Array<Response | (() => Response) | Error>, over: Partial<SoldgraphClientOptions> = {}) {
  const queue = [...responses];
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra fetch");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next;
  });
  const clock = fakeClock();
  const store = new InMemoryUsageStore(clock.now);
  store.setBudget(MONTH, { limitCredits: 100, hardStop: true });
  const logs: unknown[] = [];
  const rec = (o: unknown, m: string) => logs.push([o, m]);
  const client = createSoldgraphClient({
    usageStore: store,
    apiKey: KEY,
    enabled: true,
    fetch: fetchMock as unknown as typeof fetch,
    clock,
    logger: { info: rec, warn: rec, error: rec },
    random: () => 1,
    uuid: (() => {
      let n = 0;
      return () => `uuid-${++n}`;
    })(),
    ...over,
  });
  return { client, fetchMock, calls, clock, store, logs };
}

const auth = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;
const idem = (init: RequestInit) => (init.headers as Record<string, string>)["Idempotency-Key"];

describe("soldgraph client", () => {
  it("reports the response's key names, never its values", async () => {
    const { client } = setup([res(200, { status: "complete", result: { listings: [{ id: "a" }], total: 1, "x y": "SECRET" } })]);
    const out = await client.search("ebay/sold", { q: "stitch pin" });
    expect(out.rows).toEqual([]);
    expect(out.responseKeys).toEqual({ body: ["status:string", "result:object"], result: ["listings:array(1)", "total:number"] });
    expect(JSON.stringify(out.responseKeys)).not.toMatch(/SECRET/);
  });

  it("returns rows for a completed search and records usage", async () => {
    const { client, calls, store } = setup([res(200, complete([{ id: "a" }, { id: "b" }]), { "x-request-id": "req-1" })]);
    const out = await client.search("ebay/sold", { q: "stitch pin", market: "uk" }, { pinId: "pin-1" });
    expect(out.rows).toEqual([{ id: "a" }, { id: "b" }]);
    expect(out.requestIds).toEqual(["req-1"]);
    expect(calls[0].url).toBe("https://api.soldgraph.com/v1/ebay/sold?q=stitch+pin&market=uk");
    expect(calls[0].init.method).toBe("GET");
    expect(auth(calls[0].init)).toBe(`Bearer ${KEY}`);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(store.records).toHaveLength(1);
    expect(store.records[0]).toMatchObject({
      provider: "soldgraph",
      route: "ebay/sold",
      requestId: "req-1",
      idempotencyKey: "uuid-1",
      status: "complete",
      credits: 1,
      pinId: "pin-1",
    });
  });

  it("polls a pending job to completion, joining poll_url to the origin with wait=20", async () => {
    const { client, calls, store } = setup([
      res(202, { status: "pending", poll_url: "/v1/jobs/job-9" }),
      res(200, { status: "pending" }),
      res(200, complete([{ id: "z" }])),
    ]);
    const out = await client.search("ebay/sold", { q: "x" });
    expect(out.rows).toEqual([{ id: "z" }]);
    expect(calls).toHaveLength(3);
    expect(calls[1].url).toBe("https://api.soldgraph.com/v1/jobs/job-9?wait=20");
    expect(calls[2].url).toBe("https://api.soldgraph.com/v1/jobs/job-9?wait=20");
    expect(idem(calls[1].init)).toBeUndefined();
    // Polls cost nothing: one credit for the whole job.
    expect(store.records).toHaveLength(1);
    expect(store.records[0].credits).toBe(1);
  });

  it("does not send the key to a poll_url on another origin", async () => {
    const { client, calls } = setup([res(202, { status: "pending", poll_url: "https://evil.example/v1/jobs/1" })]);
    await expect(client.search("ebay/sold")).rejects.toBeInstanceOf(SoldgraphHttpError);
    expect(calls).toHaveLength(1);
  });

  it("throws SoldgraphTimeoutError when a job stays pending past the deadline", async () => {
    const pending = () => res(200, { status: "pending", poll_url: "/v1/jobs/j" });
    const { client, store } = setup([res(202, { status: "pending", poll_url: "/v1/jobs/j" }), ...Array(80).fill(pending)], {
      deadlineMs: 5_000,
    });
    await expect(client.search("ebay/sold")).rejects.toBeInstanceOf(SoldgraphTimeoutError);
    expect(store.records[0]).toMatchObject({ status: "timeout", credits: 1 });
  });

  it("surfaces a failed job with its error code", async () => {
    const { client, store } = setup([
      res(202, { status: "pending", poll_url: "/v1/jobs/j" }),
      res(200, { status: "failed", error: { code: "bad_query", message: "nope" } }),
    ]);
    const err = await client.search("ebay/sold").catch((e) => e);
    expect(err).toBeInstanceOf(SoldgraphHttpError);
    expect(err.code).toBe("bad_query");
    // Failed searches are free (#403).
    expect(store.records[0]).toMatchObject({ status: "failed", credits: 0 });
  });

  it("maps a failed job with a quota code to ProviderUnavailableError", async () => {
    const { client, store } = setup([res(200, { status: "failed", error: { code: "upstream_daily_limit" } })]);
    await expect(client.search("ebay/sold")).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(store.records[0]).toMatchObject({ status: "unavailable", credits: 0 });
  });

  it("honours Retry-After on 429 then succeeds", async () => {
    const { client, clock, calls } = setup([
      res(429, { error: { code: "rate_limited" } }, { "retry-after": "7" }),
      res(200, complete()),
    ]);
    const out = await client.search("ebay/sold");
    expect(out.rows).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(clock.sleeps).toContain(7000);
  });

  it("retries 5xx with backoff and gives up after maxAttempts", async () => {
    const { client, calls, clock, store } = setup(
      [res(502, {}), res(503, {}), res(500, {}), res(200, complete())],
      { maxAttempts: 3 },
    );
    const err = await client.search("ebay/sold").catch((e) => e);
    expect(err).toBeInstanceOf(SoldgraphHttpError);
    expect(err.status).toBe(500);
    expect(calls).toHaveLength(3);
    expect(clock.sleeps).toEqual([500, 1000]); // random()=1 -> no jitter reduction
    expect(store.records[0]).toMatchObject({ status: "error", credits: 0 });
  });

  it("retries network errors", async () => {
    const { client, calls } = setup([new Error("socket hang up"), res(200, complete())]);
    await client.search("ebay/sold");
    expect(calls).toHaveLength(2);
  });

  it("reuses the same Idempotency-Key across retries, new key per page", async () => {
    const { client, calls } = setup([
      res(500, {}),
      res(429, {}, { "retry-after": "1" }),
      res(200, complete([{ id: "1" }], { next_cursor: "c2" })),
      res(200, complete([{ id: "2" }])),
    ]);
    const out = await client.search("ebay/sold", { q: "x" }, { maxPages: 2 });
    expect(out.rows).toHaveLength(2);
    expect(idem(calls[0].init)).toBe("uuid-1");
    expect(idem(calls[1].init)).toBe("uuid-1");
    expect(idem(calls[2].init)).toBe("uuid-1");
    expect(idem(calls[3].init)).toBe("uuid-2");
    expect(calls[3].url).toContain("cursor=c2");
  });

  it("caps pages at 1 by default and reports truncation", async () => {
    const { client, calls } = setup([res(200, complete([{ id: "1" }], { next_page: 2 })), res(200, complete())]);
    const out = await client.search("ebay/sold");
    expect(out.pages).toBe(1);
    expect(out.truncated).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it.each(["quota_exceeded", "upstream_daily_limit"])(
    "maps %s to ProviderUnavailableError without retrying",
    async (code) => {
      const { client, calls, clock } = setup([res(429, { error: { code } }), res(200, complete())]);
      const err = await client.search("ebay/sold").catch((e) => e);
      expect(err).toBeInstanceOf(ProviderUnavailableError);
      expect(err.code).toBe(code);
      expect(err.until.getTime()).toBeGreaterThan(START);
      expect(calls).toHaveLength(1);
      expect(clock.sleeps).toEqual([]);
    },
  );

  it("uses Retry-After for 'until' on a quota error", async () => {
    const { client } = setup([res(429, { error: { code: "quota_exceeded" } }, { "retry-after": "3600" })]);
    const err = await client.search("ebay/sold").catch((e) => e);
    expect(err.until.getTime()).toBe(START + 3_600_000);
  });

  it("throws ProviderUnavailableError instead of sleeping past the deadline on a long Retry-After", async () => {
    const { client, clock } = setup([res(429, {}, { "retry-after": "600" })], { deadlineMs: 30_000 });
    await expect(client.search("ebay/sold")).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(clock.sleeps).toEqual([]);
  });

  describe("budget guard", () => {
    it("refuses at the cap when hardStop, without any network call", async () => {
      const { client, fetchMock, store } = setup([res(200, complete())]);
      store.setBudget(MONTH, { limitCredits: 2, hardStop: true });
      for (const i of [1, 2]) {
        await store.recordUsage({
          provider: "soldgraph", route: "r", requestId: null, idempotencyKey: `k${i}`,
          status: "complete", credits: 1, occurredAt: new Date(START).toISOString(),
        });
      }
      await expect(client.search("ebay/sold")).rejects.toBeInstanceOf(BudgetExceededError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("warns at 80% but still calls", async () => {
      const { client, fetchMock, store, logs } = setup([res(200, complete())]);
      store.setBudget(MONTH, { limitCredits: 10, hardStop: true });
      for (let i = 0; i < 7; i++) {
        await store.recordUsage({
          provider: "soldgraph", route: "r", requestId: null, idempotencyKey: `k${i}`,
          status: "complete", credits: 1, occurredAt: new Date(START).toISOString(),
        });
      }
      await client.search("ebay/sold");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(logs)).toContain("budget warning threshold");
    });

    it("does not warn well under 80%", async () => {
      const { client, logs } = setup([res(200, complete())]);
      await client.search("ebay/sold");
      expect(JSON.stringify(logs)).not.toContain("warning threshold");
    });

    it("defaults to 100 credits with hard stop when the store has no budget row", async () => {
      const { client, fetchMock, store } = setup([res(200, complete())]);
      (store as unknown as { budgets: Map<string, unknown> }).budgets.delete(MONTH); // no budget row
      expect(await store.getBudget(MONTH)).toBeNull();
      for (let i = 0; i < 100; i++) {
        await store.recordUsage({
          provider: "soldgraph", route: "r", requestId: null, idempotencyKey: `k${i}`,
          status: "complete", credits: 1, occurredAt: new Date(START).toISOString(),
        });
      }
      const err = await client.search("ebay/sold").catch((e) => e);
      expect(err).toBeInstanceOf(BudgetExceededError);
      expect(err.limitCredits).toBe(100);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("default budget is 100 hard stop, overridable via SOLDGRAPH_MONTHLY_LIMIT", () => {
      expect(defaultSoldgraphBudget({})).toEqual({ limitCredits: 100, hardStop: true });
      expect(defaultSoldgraphBudget({ SOLDGRAPH_MONTHLY_LIMIT: "250" })).toEqual({ limitCredits: 250, hardStop: true });
      expect(defaultSoldgraphBudget({ SOLDGRAPH_MONTHLY_LIMIT: "junk" })).toEqual({ limitCredits: 100, hardStop: true });
      expect(defaultSoldgraphBudget({ SOLDGRAPH_MONTHLY_LIMIT: "-5" })).toEqual({ limitCredits: 100, hardStop: true });
    });

    it("counting rule: searches cost 1, polls and cache hits cost 0", () => {
      expect(soldgraphCreditsForCall("search")).toBe(1);
      expect(soldgraphCreditsForCall("poll")).toBe(0);
      expect(soldgraphCreditsForCall("cache_hit")).toBe(0);
    });

    it("fails closed when the usage store errors", async () => {
      const { client, fetchMock, store } = setup([res(200, complete())]);
      store.getMonthUsage = async () => {
        throw new Error("db down");
      };
      await expect(client.search("ebay/sold")).rejects.toBeInstanceOf(BudgetExceededError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("kill switch", () => {
    it("refuses with no fetch when SOLDGRAPH_ENABLED is not 'true'", async () => {
      const { client, fetchMock } = setup([res(200, complete())], { enabled: undefined });
      vi.stubEnv("SOLDGRAPH_ENABLED", "1");
      await expect(client.search("ebay/sold")).rejects.toBeInstanceOf(ProviderDisabledError);
      vi.stubEnv("SOLDGRAPH_ENABLED", "");
      await expect(client.search("ebay/sold")).rejects.toBeInstanceOf(ProviderDisabledError);
      vi.unstubAllEnvs();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses with enabled=false", async () => {
      const { client, fetchMock } = setup([], { enabled: false });
      await expect(client.search("ebay/sold")).rejects.toBeInstanceOf(ProviderDisabledError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses with no fetch when enabled but no key is configured", async () => {
      const { client, fetchMock } = setup([], { apiKey: "" });
      vi.stubEnv("SOLDGRAPH_API_KEY", "");
      await expect(client.search("ebay/sold")).rejects.toBeInstanceOf(ProviderDisabledError);
      vi.unstubAllEnvs();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reads SOLDGRAPH_ENABLED=true and the key from the environment", async () => {
      const { client, calls } = setup([res(200, complete())], { enabled: undefined, apiKey: undefined });
      vi.stubEnv("SOLDGRAPH_ENABLED", "true");
      vi.stubEnv("SOLDGRAPH_API_KEY", "sg_env_key");
      await client.search("ebay/sold");
      vi.unstubAllEnvs();
      expect(auth(calls[0].init)).toBe("Bearer sg_env_key");
    });
  });

  it("never leaks the key in thrown errors or log output", async () => {
    const scenarios: Array<[Array<Response | Error>, Partial<SoldgraphClientOptions>?]> = [
      [[res(500, { error: { code: "x", message: `echo ${KEY}` } }), res(500, {}), res(500, {})]],
      [[new Error(`boom ${KEY}`), new Error(`boom ${KEY}`), new Error(`boom ${KEY}`)]],
      [[res(429, { error: { code: "quota_exceeded", message: KEY } })]],
      [[res(400, { error: { code: "bad", message: KEY } })]],
      [[res(200, { status: "failed", error: { code: "oops", message: KEY } })]],
      [[res(200, "not an object")]],
      [[res(200, complete())]],
    ];
    for (const [responses, over] of scenarios) {
      const { client, logs } = setup(responses, over);
      const err = await client.search("ebay/sold", { q: "x" }).catch((e) => e);
      const text = JSON.stringify(logs) + String(err?.message ?? "") + JSON.stringify({ ...err }) + String(err?.stack ?? "").split("\n")[0];
      expect(text).not.toContain(KEY);
      expect(text).not.toContain("SECRET_KEY");
    }
  });

  it("rejects malformed routes without a network call", async () => {
    const { client, fetchMock } = setup([]);
    await expect(client.search("../admin")).rejects.toBeInstanceOf(SoldgraphHttpError);
    await expect(client.search("a?b=c")).rejects.toBeInstanceOf(SoldgraphHttpError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("RateLimiter", () => {
  it("lets 60 through immediately then spaces the next until the window frees", async () => {
    const clock = fakeClock();
    const rl = new RateLimiter(60, 60_000, clock);
    const deadline = START + 10 * 60_000;
    for (let i = 0; i < 60; i++) await rl.acquire(deadline);
    expect(clock.sleeps).toEqual([]);
    await rl.acquire(deadline);
    expect(clock.sleeps).toEqual([60_000]);
    expect(clock.t).toBe(START + 60_000);
  });

  it("spaces staggered requests by the oldest stamp", async () => {
    const clock = fakeClock();
    const rl = new RateLimiter(2, 1_000, clock);
    await rl.acquire(START + 10_000);
    clock.t += 300;
    await rl.acquire(START + 10_000);
    await rl.acquire(START + 10_000); // must wait until first stamp + 1000
    expect(clock.t).toBe(START + 1_000);
  });

  it("throws a timeout if the wait would pass the deadline", async () => {
    const clock = fakeClock();
    const rl = new RateLimiter(1, 60_000, clock);
    await rl.acquire(START + 1_000);
    await expect(rl.acquire(START + 1_000)).rejects.toBeInstanceOf(SoldgraphTimeoutError);
  });

  it("the client waits for the limiter when 60 calls have just been made", async () => {
    const responses = Array.from({ length: 61 }, () => res(200, complete()));
    const { client, clock, store } = setup(responses, { deadlineMs: 120_000 });
    store.setBudget(MONTH, { limitCredits: 1000, hardStop: true });
    for (let i = 0; i < 60; i++) await client.search("ebay/sold");
    expect(clock.sleeps).toEqual([]);
    await client.search("ebay/sold");
    expect(clock.sleeps).toEqual([60_000]);
  });
});

// A store with the atomic reserve path, mirroring reserve_provider_credit() /
// record_provider_usage() from migration 049: a reservation is a row that
// recordUsage later settles under the same idempotency key.
class ReservingStore extends InMemoryUsageStore {
  reserveCalls: SoldgraphReserveRequest[] = [];
  monthReads = 0;
  constructor(
    now: () => number,
    private readonly limit: number | null,
  ) {
    super(now);
  }
  override async getMonthUsage(month: string) {
    this.monthReads += 1;
    return super.getMonthUsage(month);
  }
  async reserveCredit(req: SoldgraphReserveRequest): Promise<SoldgraphReservation> {
    this.reserveCalls.push(req);
    const limitCredits = this.limit ?? req.defaultBudget.limitCredits;
    const usedCredits = this.records
      .filter((r) => (r.occurredAt ?? "").slice(0, 7) === req.month)
      .reduce((n, r) => n + r.credits, 0);
    if (usedCredits + req.credits > limitCredits) return { allowed: false, usedCredits, limitCredits, hardStop: true };
    this.records.push({
      provider: "soldgraph",
      route: req.route,
      requestId: null,
      idempotencyKey: req.idempotencyKey,
      status: "complete",
      credits: req.credits,
      occurredAt: req.occurredAt,
    });
    return { allowed: true, usedCredits, limitCredits, hardStop: true };
  }
  override async recordUsage(record: SoldgraphUsageRecord): Promise<void> {
    const i = this.records.findIndex((r) => r.idempotencyKey === record.idempotencyKey);
    if (i >= 0) this.records[i] = { ...record };
    else this.records.push({ ...record });
  }
}

describe("soldgraph client with an atomic reserving store", () => {
  function setupReserving(responses: Response[], limit: number | null) {
    const clock = fakeClock();
    const store = new ReservingStore(clock.now, limit);
    const queue = [...responses];
    const fetchMock = vi.fn(async () => {
      const next = queue.shift();
      if (!next) throw new Error("unexpected extra fetch");
      return next;
    });
    let n = 0;
    const client = createSoldgraphClient({
      usageStore: store,
      apiKey: KEY,
      enabled: true,
      fetch: fetchMock as unknown as typeof fetch,
      clock,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      random: () => 1,
      uuid: () => `uuid-${++n}`,
    });
    return { client, store, fetchMock };
  }

  it("reserves before the call and settles the same row afterwards", async () => {
    const { client, store, fetchMock } = setupReserving([res(200, complete())], 10);
    await client.search("ebay/sold", { q: "x" }, { pinId: "pin-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.reserveCalls).toHaveLength(1);
    expect(store.reserveCalls[0]).toMatchObject({
      provider: "soldgraph",
      month: MONTH,
      route: "ebay/sold",
      idempotencyKey: "uuid-1",
      credits: 1,
      pinId: "pin-1",
      defaultBudget: { limitCredits: 100, hardStop: true },
    });
    // The budget is not also checked the non-atomic way.
    expect(store.monthReads).toBe(0);
    expect(store.records).toHaveLength(1);
    expect(store.records[0]).toMatchObject({ idempotencyKey: "uuid-1", status: "complete", credits: 1 });
  });

  it("refuses without a network call when the reservation is not allowed", async () => {
    const { client, store, fetchMock } = setupReserving([res(200, complete())], 0);
    const err = await client.search("ebay/sold").catch((e) => e);
    expect(err).toBeInstanceOf(BudgetExceededError);
    expect(err.limitCredits).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.records).toHaveLength(0);
  });

  it("fails closed when the reservation errors", async () => {
    const { client, store, fetchMock } = setupReserving([res(200, complete())], 10);
    store.reserveCredit = async () => {
      throw new Error("db down");
    };
    await expect(client.search("ebay/sold")).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parallel searches cannot exceed the cap", async () => {
    const { client, store, fetchMock } = setupReserving(
      Array.from({ length: 5 }, () => res(200, complete())),
      3,
    );
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => client.search("ebay/sold")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((r) => r.status === "rejected" && r.reason instanceof BudgetExceededError)).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(store.records.reduce((n, r) => n + r.credits, 0)).toBe(3);
  });

  it("a failed job settles its reservation to 0 credits", async () => {
    const { client, store } = setupReserving(
      [res(202, { status: "pending", poll_url: "/v1/jobs/j" }), res(200, { status: "failed", error: { code: "bad_query" } })],
      10,
    );
    await expect(client.search("ebay/sold")).rejects.toBeInstanceOf(SoldgraphHttpError);
    expect(store.records).toHaveLength(1);
    expect(store.records[0]).toMatchObject({ idempotencyKey: "uuid-1", status: "failed", credits: 0 });
  });
});
