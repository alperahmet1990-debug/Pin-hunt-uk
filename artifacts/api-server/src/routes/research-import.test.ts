import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory fake of the Supabase tables the dry run reads. Any write is recorded.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let isCreator = true;
let writes: string[] = [];

function builder(table: string) {
  let inFilter: [string, unknown[]] | null = null;
  const run = () => {
    if (table === "profiles") return { data: { is_app_creator: isCreator }, error: null };
    const rows = (tables[table] ?? []).filter(r => !inFilter || inFilter[1].includes(r[inFilter[0]]));
    return { data: rows, error: null };
  };
  const b: Row = {
    select: () => b, limit: () => b, order: () => b, eq: () => b,
    in: (k: string, v: unknown[]) => { inFilter = [k, v]; return b; },
    insert: () => { writes.push(`${table}.insert`); return b; },
    update: () => { writes.push(`${table}.update`); return b; },
    upsert: () => { writes.push(`${table}.upsert`); return b; },
    delete: () => { writes.push(`${table}.delete`); return b; },
    rpc: () => { writes.push("rpc"); return b; },
    single: async () => { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
    maybeSingle: async () => { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return b;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async (t: string) => (t === "bad" ? { data: { user: null }, error: new Error("x") } : { data: { user: { id: "creator-1" } }, error: null }) },
    from: (t: string) => builder(t),
    rpc: () => { writes.push("rpc"); return builder("rpc"); },
  }),
}));
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
const { default: app } = await import("../app");

const URL_ = "/api/admin/research/import/dry-run";
const auth = { Authorization: "Bearer good" };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const proposed = (extra: Row = {}) => ({
  "Pin name": "Bambi Brush of Magic", Brand: "Disney Store", "Main character": "Bambi", Characters: "Bambi",
  "Release year": 2026, "Edition type": "limited edition", "Edition size": 3750, "Original price": 24.99, Currency: "USD",
  Categories: "Brush of Magic", ...extra,
});
const cand = (n: number, extra: Row = {}): Row => ({
  id: id(n), entity_type: "pin", status: "approved", proposed: proposed(), review_reasons: [], warnings: [],
  duplicate_status: "NEW", duplicate_pin_id: null, direct_verified_by: "rev-1", decided_by: "rev-1", ...extra,
});

describe("research import dry run", () => {
  beforeEach(() => {
    isCreator = true; writes = [];
    for (const k of Object.keys(tables)) delete tables[k];
    tables.pins = [];
    tables.catalogue_candidates = [
      cand(1),
      cand(2, { status: "direct_verified" }),
      cand(3, { direct_verified_by: null }),
      cand(4, { duplicate_status: "DUPLICATE (exact)", duplicate_pin_id: "pin-1" }),
      cand(5, { duplicate_status: "NEW", review_reasons: ["Possible duplicate of PHUK-00000625"] }),
      cand(6, { proposed: proposed({ "Pin name": "", "Release year": null }) }),
      cand(7, { proposed: proposed({ "Pin name": "Already Here" }) }),
      cand(8, { entity_type: "set" }),
    ];
    tables.pins = [{ id: "pin-9", title: "Already Here", collection: "Brush of Magic" }];
  });

  it("401 without a token or with a bad one, 403 for non-creators", async () => {
    expect((await request(app).post(URL_).send({ candidateIds: [id(1)] })).status).toBe(401);
    expect((await request(app).post(URL_).set({ Authorization: "Bearer bad" }).send({ candidateIds: [id(1)] })).status).toBe(401);
    isCreator = false;
    expect((await request(app).post(URL_).set(auth).send({ candidateIds: [id(1)] })).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it("validates the request", async () => {
    for (const body of [{}, { candidateIds: [] }, { candidateIds: ["nope"] }, { candidateIds: [id(1), id(1)] },
      { candidateIds: Array.from({ length: 51 }, (_, i) => id(i + 1)) }]) {
      expect((await request(app).post(URL_).set(auth).send(body)).status).toBe(400);
    }
  });

  it("returns the row it would create for an eligible candidate, as not public", async () => {
    const res = await request(app).post(URL_).set(auth).send({ candidateIds: [id(1)] });
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.refused).toEqual([]);
    expect(res.body.wouldCreate).toHaveLength(1);
    const row = res.body.wouldCreate[0].row;
    expect(row).toMatchObject({
      title: "Bambi Brush of Magic", brand: "Disney Store", main_character: "Bambi", release_year: 2026,
      limited_edition_size: 3750, retail_price: 24.99, verification_status: "needs_source_verification",
      is_seed_record: true, needs_review: true,
    });
    expect(row).not.toHaveProperty("pinhunt_id");
  });

  it("refuses every ineligible candidate with a reason each", async () => {
    const ids = [2, 3, 4, 5, 6, 7, 8, 99].map(id);
    const res = await request(app).post(URL_).set(auth).send({ candidateIds: ids });
    expect(res.status).toBe(200);
    expect(res.body.wouldCreate).toEqual([]);
    const reason = (n: number) => res.body.refused.find((r: { candidateId: string }) => r.candidateId === id(n)).reason;
    expect(reason(2)).toBe("not_approved");
    expect(reason(3)).toBe("not_directly_verified");
    expect(reason(4)).toBe("catalogue_duplicate");
    expect(reason(5)).toBe("flagged_duplicate");
    expect(reason(6)).toBe("missing_required_fields");
    expect(res.body.refused.find((r: { candidateId: string }) => r.candidateId === id(6)).missing).toEqual(["Pin name", "Release year"]);
    expect(reason(7)).toBe("catalogue_duplicate");
    expect(reason(8)).toBe("not_a_pin");
    expect(reason(99)).toBe("not_found");
    expect(res.body.refused).toHaveLength(ids.length);
  });

  it("writes nothing and leaves staging and pins untouched", async () => {
    const before = JSON.stringify(tables);
    await request(app).post(URL_).set(auth).send({ candidateIds: [1, 2, 3, 4, 5, 6, 7, 8].map(id) });
    expect(writes).toEqual([]);
    expect(JSON.stringify(tables)).toBe(before);
  });
});
