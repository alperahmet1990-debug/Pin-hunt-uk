import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Gates for the bulk image matcher routes. All upstreams are mocked.
const state = vi.hoisted(() => ({ isAppCreator: true, inserted: [] as unknown[], pageCalls: [] as unknown[], items: [] as Array<Record<string, unknown>> }));

vi.mock("@workspace/pin-repository", async (importOriginal) => {
  const real = await importOriginal<typeof import("@workspace/pin-repository")>();
  const pin = (id: string) => ({ id, title: `Pin ${id}`, collection: "Beauty and the Beast", brand: "Disney", characters: ["Lumiere"], categories: [], imageUrl: undefined });
  return {
    ...real,
    createSupabasePinRepository: () => ({
      searchPinsPage: async (q: string, f: unknown) => { state.pageCalls.push({ q, f }); return { pins: [pin("PHUK-10000001"), pin("PHUK-10000002")], total: 45 }; },
      searchPins: async () => [pin("PHUK-10000003")],
      getPinByPinhuntId: async (id: string) => pin(id),
    }),
    createSupabaseUserRepository: () => ({ getPinAndPopReferences: async () => ({}) }),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "creator-1" } }, error: null }) },
    from: (table: string) => table === "bulk_image_items" ? itemsTable() : ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { is_app_creator: state.isAppCreator }, error: null }) }),
        in: async () => ({ data: [], error: null }),
      }),
      insert: (row: unknown) => {
        state.inserted.push({ table, row });
        return { select: () => ({ single: async () => ({ data: { id: "batch-1", ...(row as object) }, error: null }) }) };
      },
    }),
  }),
}));

/** Just enough of bulk_image_items for "Match again": load one, conditional update. */
function itemsTable() {
  const filters: Array<[string, unknown]> = [];
  let patch: Record<string, unknown> | null = null;
  const rows = () => state.items.filter((r) => filters.every(([k, v]) => r[k] === v));
  const q = {
    select: () => q,
    update: (p: Record<string, unknown>) => { patch = p; return q; },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
    in: () => q,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => void) => {
      const hit = rows();
      if (patch) for (const r of hit) Object.assign(r, patch);
      resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
    },
  };
  return q;
}

import app from "../app";
import { summarise } from "./bulk-images";

const create = (body: Record<string, unknown>) =>
  request(app).post("/api/admin/bulk-images/batches").set("Authorization", "Bearer t").send(body);

const valid = { title: "Paris haul", supplierName: "PinHunt team", permissionBasis: "own_photos", permissionPublicDisplay: true };

describe("bulk image matcher routes", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    process.env.BULK_IMAGE_MATCHER_ENABLED = "true";
    state.isAppCreator = true;
    state.inserted = [];
    state.pageCalls = [];
  });
  afterEach(() => { delete process.env.BULK_IMAGE_MATCHER_ENABLED; });

  it("is off (404) unless explicitly enabled", async () => {
    delete process.env.BULK_IMAGE_MATCHER_ENABLED;
    expect((await create(valid)).status).toBe(404);
  });

  it("is App Creator only", async () => {
    state.isAppCreator = false;
    expect((await create(valid)).status).toBe(403);
    expect((await request(app).get("/api/admin/bulk-images/batches")).status).toBe(401);
  });

  it("requires the supplier and permission basis before a batch exists", async () => {
    expect((await create({ ...valid, supplierName: "" })).status).toBe(400);
    expect((await create({ ...valid, permissionBasis: "found_online" })).status).toBe(400);
    const res = await create(valid);
    expect(res.status).toBe(201);
    expect(state.inserted[0]).toMatchObject({
      table: "bulk_image_batches",
      row: { supplier_name: "PinHunt team", permission_basis: "own_photos", permission_public_display: true, permission_recorded_by: "creator-1" },
    });
  });

  it("stores the batch's set, cleaned, when one is given", async () => {
    await create({ ...valid, sets: "  Beauty and the Beast , beauty and the beast" });
    expect(state.inserted[0]).toMatchObject({ row: { stats: { setHints: ["Beauty and the Beast"] } } });
    await create(valid);
    expect((state.inserted[1] as { row: Record<string, unknown> }).row.stats).toBeUndefined();
  });

  it("browses a set 30 at a time, narrowed by the search box, and says when there are more", async () => {
    const res = await request(app).get("/api/admin/bulk-images/search").query({ set: "Beauty and the Beast", q: "lum", offset: 30 }).set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(state.pageCalls).toEqual([{ q: "lum", f: { status: "active", collection: "Beauty and the Beast", limit: 30, offset: 30 } }]);
    expect(res.body).toMatchObject({ total: 45, more: true });
    expect(res.body.results.map((r: { pinhuntId: string }) => r.pinhuntId)).toEqual(["PHUK-10000001", "PHUK-10000002"]);
    // Without a set: the plain search, as before.
    const plain = await request(app).get("/api/admin/bulk-images/search").query({ q: "lumiere" }).set("Authorization", "Bearer t");
    expect(plain.body).toMatchObject({ more: false, results: [{ pinhuntId: "PHUK-10000003" }] });
  });

  it("Match again sends an undecided photo back to be matched, and refuses confirmed or busy ones", async () => {
    state.items = [
      { id: "u1", batch_id: "B", status: "unmatched", match_attempts: 1, error: null },
      { id: "c1", batch_id: "B", status: "confirmed", match_attempts: 1 },
      { id: "m1", batch_id: "B", status: "matching", match_attempts: 1 },
    ];
    const again = (id: string) => request(app).post(`/api/admin/bulk-images/items/${id}/rematch`).set("Authorization", "Bearer t");
    const res = await again("u1");
    expect(res.status).toBe(200);
    expect(state.items[0]).toMatchObject({ status: "uploaded", match_attempts: 0 });
    expect((await again("c1")).status).toBe(409);
    expect(state.items[1].status).toBe("confirmed");
    expect((await again("m1")).body.error).toMatch(/already being matched/);
    expect((await again("nope")).status).toBe(404);
  });

  it("public display defaults to not permitted", async () => {
    await create({ ...valid, permissionPublicDisplay: "yes" });
    expect(state.inserted[0]).toMatchObject({ row: { permission_public_display: false } });
  });
});

describe("summarise", () => {
  it("groups statuses for the dashboard", () => {
    const s = summarise([
      { status: "uploaded" }, { status: "matching" }, { status: "suggested" }, { status: "unmatched" },
      { status: "confirmed" }, { status: "cleaned" }, { status: "published" },
      { status: "failed", failed_stage: "clean" }, { status: "skipped" },
    ]);
    expect(s).toMatchObject({
      total: 9, awaitingMatching: 2, awaitingReview: 2, confirmed: 3, cleaned: 2, awaitingPublish: 1, published: 1,
      problems: 3, failedByStage: { match: 0, clean: 1, publish: 0 },
    });
  });
});
