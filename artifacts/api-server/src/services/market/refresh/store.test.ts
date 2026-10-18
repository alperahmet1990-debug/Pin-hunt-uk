/**
 * SupabaseRefreshStore (SG-06, #409) against a recording fake client: the
 * right tables, filters, conflict key and RPCs. No network.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { RefreshStoreError, SupabaseRefreshStore } from "./store";

const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);

type Result = { data?: unknown; error?: unknown; count?: number };
interface Call { table: string; ops: Array<[string, unknown[]]> }

function fakeDb(results: Record<string, Result | ((call: Call) => Result)>) {
  const calls: Call[] = [];
  const rpcs: Array<[string, unknown]> = [];
  const resolve = (call: Call): Result => {
    const opNames = call.ops.map(o => o[0]);
    const key = [`${call.table}:${opNames.find(o => ["upsert", "delete"].includes(o)) ?? "select"}`, call.table].find(k => k in results);
    const r = key ? results[key] : undefined;
    return (typeof r === "function" ? r(call) : r) ?? { data: [], error: null };
  };
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const b: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "gt", "gte", "or", "order", "range", "upsert", "delete", "maybeSingle"]) {
      b[op] = (...args: unknown[]) => {
        call.ops.push([op, args]);
        return b;
      };
    }
    b.then = (ok: (r: Result) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve(call)).then(ok, bad);
    return b;
  };
  const rpc = (name: string, args: unknown) => {
    rpcs.push([name, args]);
    return Promise.resolve((results[`rpc:${name}`] as Result) ?? { data: null, error: null });
  };
  return { db: { from, rpc } as unknown as SupabaseClient, calls, rpcs };
}

const op = (c: { ops: Array<[string, unknown[]]> }, name: string) => c.ops.filter(o => o[0] === name).map(o => o[1]);

describe("SupabaseRefreshStore", () => {
  it("upserts listings on (source_id, external_id, pin_id) without first_seen_at", async () => {
    const { db, calls } = fakeDb({});
    await new SupabaseRefreshStore(db, {}).upsertListings([{ source_id: "s:a", external_id: "1", pin_id: "p" } as never]);
    const c = calls.find(x => x.table === "market_listings")!;
    const [rows, options] = op(c, "upsert")[0] as [Array<Record<string, unknown>>, Record<string, unknown>];
    expect(options).toEqual({ onConflict: "source_id,external_id,pin_id" });
    expect(rows[0]).not.toHaveProperty("first_seen_at");
  });

  it("reads the cache from unexpired rows only, keeping the latest last_seen_at", async () => {
    const { db, calls } = fakeDb({
      market_listings: {
        data: [
          { pin_id: "p1", source_id: "s:a", last_seen_at: "2026-10-10T00:00:00Z" },
          { pin_id: "p1", source_id: "s:a", last_seen_at: "2026-10-15T00:00:00Z" },
        ],
        error: null,
      },
    });
    const m = await new SupabaseRefreshStore(db, {}).lastSeen(["p1"], ["s:a"], NOW);
    expect(m.get("p1|s:a")).toBe("2026-10-15T00:00:00Z");
    const c = calls[0];
    expect(op(c, "gt")).toEqual([["expires_at", new Date(NOW).toISOString()]]);
    expect(op(c, "in")).toEqual([["pin_id", ["p1"]], ["source_id", ["s:a"]]]);
  });

  it("counts expired rows with the purge rule and purges through purge_market_listings", async () => {
    const { db, calls, rpcs } = fakeDb({
      "market_sources": { data: [{ id: "soldgraph:ebay_gb_sold", provider: "soldgraph", market: "UK", evidence_type: "sold", enabled: true, retention_days: 30 }], error: null },
      "market_listings": { count: 4, error: null },
      "rpc:purge_market_listings": { data: 4, error: null },
    });
    const store = new SupabaseRefreshStore(db, {});
    expect(await store.countExpired(null, NOW)).toEqual([{ sourceId: "soldgraph:ebay_gb_sold", count: 4 }]);
    const c = calls.find(x => x.table === "market_listings")!;
    const cutoff = new Date(NOW - 30 * 86_400_000).toISOString();
    expect(op(c, "or")).toEqual([[`expires_at.lte.${new Date(NOW).toISOString()},last_seen_at.lte.${cutoff}`]]);
    expect(await store.purgeExpired("soldgraph:ebay_gb_sold")).toBe(4);
    expect(rpcs).toEqual([["purge_market_listings", { p_source_id: "soldgraph:ebay_gb_sold", p_all: false }]]);
  });

  it("uses the default budget (SOLDGRAPH_MONTHLY_LIMIT or 100, hard stop) when no row exists", async () => {
    const { db } = fakeDb({
      "rpc:get_provider_month_usage": { data: [{ credits: 7, requests: 9 }], error: null },
      provider_budgets: { data: null, error: null },
    });
    expect(await new SupabaseRefreshStore(db, {}).budget("2026-10")).toEqual({
      month: "2026-10", usedCredits: 7, requests: 9, limitCredits: 100, hardStop: true, origin: "default",
    });
  });

  it("throws generic errors with no database detail", async () => {
    const { db } = fakeDb({ market_sources: { data: null, error: { message: "relation secret_detail does not exist" } } });
    const err = await new SupabaseRefreshStore(db, {}).loadSources().catch(e => e);
    expect(err).toBeInstanceOf(RefreshStoreError);
    expect(String(err.message)).not.toMatch(/secret_detail/);
  });

  it("maps market_sources rows, skipping malformed ones", async () => {
    const { db } = fakeDb({
      market_sources: {
        data: [
          { id: "soldgraph:vinted_gb_active", provider: "soldgraph", market: "UK", evidence_type: "active", enabled: true, retention_days: 14 },
          { id: "bad", market: "DE", evidence_type: "sold" },
        ],
        error: null,
      },
    });
    expect(await new SupabaseRefreshStore(db, {}).loadSources()).toEqual([
      { id: "soldgraph:vinted_gb_active", provider: "soldgraph", market: "UK", evidenceType: "active", enabled: true, retentionDays: 14 },
    ]);
  });
});
