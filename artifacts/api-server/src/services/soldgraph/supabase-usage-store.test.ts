import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { SupabaseUsageStore, UsageStoreError, createSupabaseUsageStoreFromEnv } from "./supabase-usage-store";

const PIN = "3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f";

type Result = { data: unknown; error: unknown };

function mockDb(opts: { rpc?: (fn: string, args: Record<string, unknown>) => Result; table?: Result } = {}) {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => opts.rpc?.(fn, args) ?? { data: null, error: null });
  const filters: Array<[string, unknown]> = [];
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: unknown) => {
      filters.push([col, val]);
      return builder;
    }),
    maybeSingle: vi.fn(async () => opts.table ?? { data: null, error: null }),
  };
  const from = vi.fn(() => builder);
  const db = { rpc, from } as unknown as SupabaseClient;
  return { db, rpc, from, builder, filters };
}

describe("SupabaseUsageStore", () => {
  it("recordUsage settles through record_provider_usage with the UTC month of occurredAt", async () => {
    const { db, rpc } = mockDb();
    await new SupabaseUsageStore(db).recordUsage({
      provider: "soldgraph",
      route: "ebay/sold",
      requestId: "req-1",
      idempotencyKey: "key-1",
      status: "complete",
      credits: 1,
      pinId: PIN,
      occurredAt: "2026-10-31T23:59:59.000Z",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_provider_usage", {
      p_provider: "soldgraph",
      p_month: "2026-10",
      p_route: "ebay/sold",
      p_idempotency_key: "key-1",
      p_status: "complete",
      p_credits: 1,
      p_request_id: "req-1",
      p_pin_id: PIN,
      p_occurred_at: "2026-10-31T23:59:59.000Z",
    });
  });

  it("stores a non-uuid pinId as null instead of failing the usage write", async () => {
    const { db, rpc } = mockDb();
    await new SupabaseUsageStore(db).recordUsage({
      provider: "soldgraph",
      route: "ebay/sold",
      requestId: null,
      idempotencyKey: "key-2",
      status: "failed",
      credits: 0,
      pinId: "PHUK-00000001",
      occurredAt: "2026-10-18T12:00:00.000Z",
    });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_pin_id: null, p_credits: 0, p_status: "failed" });
  });

  it("recordUsage throws a generic error when the database errors", async () => {
    const { db } = mockDb({ rpc: () => ({ data: null, error: { message: "relation provider_usage does not exist" } }) });
    const err = await new SupabaseUsageStore(db)
      .recordUsage({ provider: "soldgraph", route: "r", requestId: null, idempotencyKey: "k", status: "error", credits: 0 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(UsageStoreError);
    expect(String(err.message)).not.toContain("relation");
  });

  it("getMonthUsage reads totals from get_provider_month_usage (array or object rows)", async () => {
    const { db, rpc } = mockDb({ rpc: () => ({ data: [{ credits: 7, requests: 9 }], error: null }) });
    const store = new SupabaseUsageStore(db);
    expect(await store.getMonthUsage("2026-10")).toEqual({ credits: 7, requests: 9 });
    expect(rpc).toHaveBeenCalledWith("get_provider_month_usage", { p_provider: "soldgraph", p_month: "2026-10" });

    const single = mockDb({ rpc: () => ({ data: { credits: "3", requests: "4" }, error: null }) });
    expect(await new SupabaseUsageStore(single.db).getMonthUsage("2026-01")).toEqual({ credits: 3, requests: 4 });
  });

  it("getMonthUsage rejects malformed months and malformed rows", async () => {
    const { db, rpc } = mockDb({ rpc: () => ({ data: [{ credits: -1, requests: 0 }], error: null }) });
    const store = new SupabaseUsageStore(db);
    await expect(store.getMonthUsage("2026-13")).rejects.toBeInstanceOf(UsageStoreError);
    expect(rpc).not.toHaveBeenCalled();
    await expect(store.getMonthUsage("2026-10")).rejects.toBeInstanceOf(UsageStoreError);
    const empty = mockDb({ rpc: () => ({ data: [], error: null }) });
    await expect(new SupabaseUsageStore(empty.db).getMonthUsage("2026-10")).rejects.toBeInstanceOf(UsageStoreError);
  });

  it("getBudget reads provider_budgets for the provider and month", async () => {
    const { db, from, filters, builder } = mockDb({ table: { data: { limit_credits: 2000, hard_stop: true }, error: null } });
    expect(await new SupabaseUsageStore(db).getBudget("2026-10")).toEqual({ limitCredits: 2000, hardStop: true });
    expect(from).toHaveBeenCalledWith("provider_budgets");
    expect(builder.select).toHaveBeenCalledWith("limit_credits, hard_stop");
    expect(filters).toEqual([
      ["provider", "soldgraph"],
      ["month", "2026-10"],
    ]);
  });

  it("getBudget returns null when there is no row, and throws on error or a bad row", async () => {
    expect(await new SupabaseUsageStore(mockDb().db).getBudget("2026-10")).toBeNull();
    const failing = mockDb({ table: { data: null, error: { message: "boom" } } });
    await expect(new SupabaseUsageStore(failing.db).getBudget("2026-10")).rejects.toBeInstanceOf(UsageStoreError);
    const bad = mockDb({ table: { data: { limit_credits: 10, hard_stop: "yes" }, error: null } });
    await expect(new SupabaseUsageStore(bad.db).getBudget("2026-10")).rejects.toBeInstanceOf(UsageStoreError);
  });

  it("reserveCredit calls reserve_provider_credit with the default budget and maps the result", async () => {
    const { db, rpc } = mockDb({
      rpc: () => ({ data: [{ allowed: true, used_credits: 4, limit_credits: 100, hard_stop: true }], error: null }),
    });
    const out = await new SupabaseUsageStore(db).reserveCredit({
      provider: "soldgraph",
      month: "2026-10",
      route: "ebay/sold",
      idempotencyKey: "key-3",
      credits: 1,
      pinId: PIN,
      occurredAt: "2026-10-18T12:00:00.000Z",
      defaultBudget: { limitCredits: 100, hardStop: true },
    });
    expect(out).toEqual({ allowed: true, usedCredits: 4, limitCredits: 100, hardStop: true });
    expect(rpc).toHaveBeenCalledWith("reserve_provider_credit", {
      p_provider: "soldgraph",
      p_month: "2026-10",
      p_route: "ebay/sold",
      p_idempotency_key: "key-3",
      p_credits: 1,
      p_pin_id: PIN,
      p_occurred_at: "2026-10-18T12:00:00.000Z",
      p_default_limit: 100,
      p_default_hard_stop: true,
    });
  });

  it("reserveCredit passes a refusal through and throws on errors or malformed rows", async () => {
    const req = {
      provider: "soldgraph" as const,
      month: "2026-10",
      route: "ebay/sold",
      idempotencyKey: "key-4",
      credits: 1,
      occurredAt: "2026-10-18T12:00:00.000Z",
      defaultBudget: { limitCredits: 100, hardStop: true },
    };
    const refused = mockDb({
      rpc: () => ({ data: [{ allowed: false, used_credits: 100, limit_credits: 100, hard_stop: true }], error: null }),
    });
    expect(await new SupabaseUsageStore(refused.db).reserveCredit(req)).toMatchObject({ allowed: false, usedCredits: 100 });

    const failing = mockDb({ rpc: () => ({ data: null, error: { message: "permission denied" } }) });
    await expect(new SupabaseUsageStore(failing.db).reserveCredit(req)).rejects.toBeInstanceOf(UsageStoreError);

    const malformed = mockDb({ rpc: () => ({ data: [{ allowed: "true", used_credits: 1, limit_credits: 2, hard_stop: true }], error: null }) });
    await expect(new SupabaseUsageStore(malformed.db).reserveCredit(req)).rejects.toBeInstanceOf(UsageStoreError);
  });

  it("createSupabaseUsageStoreFromEnv needs both the URL and the service role key", () => {
    expect(createSupabaseUsageStoreFromEnv({})).toBeNull();
    expect(createSupabaseUsageStoreFromEnv({ SUPABASE_URL: "https://example.invalid" })).toBeNull();
    expect(
      createSupabaseUsageStoreFromEnv({ SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-placeholder" }),
    ).toBeInstanceOf(SupabaseUsageStore);
  });
});
