import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Gates for the bulk image matcher routes. All upstreams are mocked.
const state = vi.hoisted(() => ({ isAppCreator: true, inserted: [] as unknown[] }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "creator-1" } }, error: null }) },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { is_app_creator: state.isAppCreator }, error: null }) }) }),
      insert: (row: unknown) => {
        state.inserted.push({ table, row });
        return { select: () => ({ single: async () => ({ data: { id: "batch-1", ...(row as object) }, error: null }) }) };
      },
    }),
  }),
}));

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
