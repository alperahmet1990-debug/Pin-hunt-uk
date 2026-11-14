/** SupabaseBatchStore: the pin filters it sends and the request-log check. Supabase is faked. */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseBatchStore } from "./batch-store";

type Call = { table: string; ops: Array<[string, unknown[]]> };

function fakeDb(rowsFor: (c: Call) => unknown[]) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const op of ["select", "in", "eq", "neq", "gt", "order"]) {
        q[op] = (...a: unknown[]) => {
          call.ops.push([op, a]);
          return q;
        };
      }
      q.range = (...a: unknown[]) => {
        call.ops.push(["range", a]);
        return Promise.resolve({ data: rowsFor(call), error: null });
      };
      q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: rowsFor(call), error: null }).then(ok);
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const op = (c: Call, name: string) => c.ops.filter(o => o[0] === name).map(o => o[1]);

describe("SupabaseBatchStore", () => {
  it("lists verified, non-archived pins of the given years in pinhunt_id order, then pages", async () => {
    const rows = [{ id: "u1", pinhunt_id: "PHUK-1" }, { id: "u2", pinhunt_id: "PHUK-2" }, { id: "u3", pinhunt_id: "PHUK-3" }];
    const { db, calls } = fakeDb(() => rows);
    const out = await new SupabaseBatchStore(db).listPins({ years: [2025, 2026], pinhuntIds: null, offset: 1, limit: 1 });
    expect(out).toEqual([{ uuid: "u2", pinhuntId: "PHUK-2" }]);
    const c = calls[0];
    expect(c.table).toBe("pins");
    expect(op(c, "in")).toEqual([["release_year", [2025, 2026]]]);
    expect(op(c, "eq")).toEqual([["verification_status", "verified"]]);
    expect(op(c, "neq")).toEqual([["catalogue_status", "archived"]]);
    expect(op(c, "order")).toEqual([["pinhunt_id", { ascending: true }]]);
  });

  it("keeps an --ids-file's order", async () => {
    const { db } = fakeDb(() => [{ id: "u1", pinhunt_id: "PHUK-1" }, { id: "u2", pinhunt_id: "PHUK-2" }]);
    const out = await new SupabaseBatchStore(db).listPins({ years: [], pinhuntIds: ["PHUK-2", "PHUK-1"], offset: 0, limit: null });
    expect(out.map(p => p.pinhuntId)).toEqual(["PHUK-2", "PHUK-1"]);
  });

  it("counts a pin as answered only when a completed request covered every source asked for", async () => {
    const { db, calls } = fakeDb(() => [
      { pin_id: "u1", sources: ["soldgraph:ebay_gb_sold", "soldgraph:ebay_us_sold"] },
      { pin_id: "u2", sources: ["soldgraph:ebay_gb_sold"] },
    ]);
    const out = await new SupabaseBatchStore(db).recentlyAnswered(["u1", "u2"], ["soldgraph:ebay_gb_sold", "soldgraph:ebay_us_sold"], "2026-05-18T00:00:00.000Z");
    expect([...out]).toEqual(["u1"]);
    const c = calls[0];
    expect(c.table).toBe("market_price_requests");
    expect(op(c, "eq")).toEqual([["status", "complete"]]);
    expect(op(c, "gt")).toEqual([["finished_at", "2026-05-18T00:00:00.000Z"]]);
  });
});
