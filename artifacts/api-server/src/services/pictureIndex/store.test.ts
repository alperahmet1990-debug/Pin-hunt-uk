import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setBoardDbForTests } from "../boardScan/store";
import { indexStatus, pendingReferences, PENDING_PAGE, resetStatusCacheForTests } from "./store";
import { INDEX_MODEL } from "./vertex";
import { createHash } from "node:crypto";

// The picture index's reads against a tiny in-memory database: paged by id
// with simple filters (no big join), and progress counts that are cached and
// shared so a busy admin screen can't pile queries onto the database.

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

interface Tables {
  pin_images: Array<Record<string, unknown>>;
  pin_picture_index: Array<Record<string, unknown>>;
  pins: Array<Record<string, unknown>>;
}

function fakeDb(t: Tables, calls: string[]) {
  return {
    from: (table: keyof Tables) => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      let head = false;
      let limit = Infinity;
      const q = {
        select: (_c: string, o?: { head?: boolean }) => { head = !!o?.head; return q; },
        eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
        like: (k: string, p: string) => { filters.push((r) => String(r[k]).startsWith(p.replace("%", ""))); return q; },
        gt: (k: string, v: string) => { filters.push((r) => String(r[k]) > v); return q; },
        in: (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return q; },
        is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return q; },
        not: (k: string, _op: string, v: unknown) => { filters.push((r) => (r[k] ?? null) !== v); return q; },
        order: () => q,
        limit: (n: number) => { limit = n; return q; },
        then: (resolve: (v: unknown) => void) => {
          calls.push(table);
          const rows = t[table].filter((r) => filters.every((f) => f(r))).sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(0, limit);
          resolve(head ? { count: rows.length, error: null } : { data: rows, error: null });
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const id = (n: number) => `img-${String(n).padStart(4, "0")}`;
let tables: Tables;
let calls: string[];

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://db.test.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  resetStatusCacheForTests();
  calls = [];
  tables = {
    pin_images: Array.from({ length: 450 }, (_, n) => ({
      id: id(n), pin_id: `pin-${n}`, image_url: `https://pinandpop.test/${n}.jpg`, source: "pin_and_pop", image_type: "reference",
    })),
    pin_picture_index: [],
    pins: [{ id: "pin-3", archived_at: "2026-01-01" }],
  };
  setBoardDbForTests(fakeDb(tables, calls));
});
afterEach(() => { setBoardDbForTests(null); vi.unstubAllEnvs(); });

describe("picture index store", () => {
  it("pages through the reference pictures by id, skipping described and archived ones", async () => {
    tables.pin_picture_index.push(
      { pin_image_id: id(1), model: INDEX_MODEL, image_url_md5: md5("https://pinandpop.test/1.jpg"), error: null },
      { pin_image_id: id(2), model: INDEX_MODEL, image_url_md5: md5("https://pinandpop.test/old.jpg"), error: null }, // picture changed
      { pin_image_id: id(5), model: INDEX_MODEL, image_url_md5: md5("https://pinandpop.test/5.jpg"), error: "gone" }, // failed
    );
    const first = await pendingReferences(null);
    const ids = first.refs.map((r) => r.pin_image_id);
    expect(ids).not.toContain(id(1)); // done
    expect(ids).toContain(id(2)); // its picture changed
    expect(ids).not.toContain(id(3)); // archived pin
    expect(ids).not.toContain(id(5)); // failed: only when retrying
    expect(first.next).toBe(id(PENDING_PAGE - 1));
    expect((await pendingReferences(null, true)).refs.map((r) => r.pin_image_id)).toContain(id(5));

    const second = await pendingReferences(first.next);
    expect(second.refs[0].pin_image_id).toBe(id(PENDING_PAGE));
    const last = await pendingReferences(second.next);
    expect(last.refs).toHaveLength(450 - 2 * PENDING_PAGE);
    expect(last.next).toBeNull();
  });

  it("counts progress without a join, caches the total and shares a call in flight", async () => {
    tables.pin_picture_index.push(
      { pin_image_id: id(1), model: INDEX_MODEL, error: null },
      { pin_image_id: id(2), model: INDEX_MODEL, error: "gone" },
    );
    const [a, b] = await Promise.all([indexStatus(), indexStatus()]);
    expect(a).toEqual({ referencesTotal: 450, indexed: 1, failed: 1 });
    expect(b).toBe(a);
    expect(calls.filter((c) => c === "pin_images")).toHaveLength(1);
    await indexStatus();
    // The total isn't counted again within 10 minutes; the progress counts are.
    expect(calls.filter((c) => c === "pin_images")).toHaveLength(1);
    expect(calls.filter((c) => c === "pin_picture_index")).toHaveLength(4);
  });
});
