/**
 * A marketplace leads file loads through the EXISTING research review route
 * (POST /api/admin/research/runs) unchanged, and the existing approval and
 * import rules keep every lead out of the catalogue (SG-10, #415).
 * Supabase is an in-memory fake; nothing reaches a network.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { input } from "../__fixtures__/leads";
import { buildLeads } from "./leads";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let nextId = 1;
const uuid = () => `00000000-0000-4000-9000-${String(nextId++).padStart(12, "0")}`;

function builder(table: string) {
  const filters: Array<[string, unknown]> = [];
  let inFilter: [string, unknown[]] | null = null;
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | Row[] | null = null;
  const rows = () => (tables[table] ??= []);
  const match = (r: Row) => filters.every(([k, v]) => r[k] === v) && (!inFilter || inFilter[1].includes(r[inFilter[0]]));
  const run = () => {
    if (table === "profiles") return { data: { is_app_creator: true }, error: null };
    if (op === "insert") {
      const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
      const inserted = list.map(r => ({ id: uuid(), status: "researched", ...r }));
      rows().push(...inserted);
      return { data: inserted, error: null };
    }
    if (op === "update") { const hit = rows().filter(match); hit.forEach(r => Object.assign(r, payload)); return { data: hit.map(r => ({ id: r.id })), error: null }; }
    if (op === "delete") { tables[table] = rows().filter(r => !match(r)); return { data: null, error: null }; }
    return { data: rows().filter(match), error: null };
  };
  const b: Row = {
    select: () => b, order: () => b, limit: () => b,
    insert: (p: Row | Row[]) => { op = "insert"; payload = p; return b; },
    update: (p: Row) => { op = "update"; payload = p; return b; },
    delete: () => { op = "delete"; return b; },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return b; },
    in: (k: string, v: unknown[]) => { inFilter = [k, v]; return b; },
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
  }),
}));
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
const { default: app } = await import("../../../app");

const auth = { Authorization: "Bearer good" };
const run = buildLeads(input()).run!;

describe("marketplace leads through the existing Research Review route", () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
    tables.pins = [
      { id: "pin-uuid-0001", pinhunt_id: "PHUK-TEST0001" },
      { id: "pin-uuid-0010", pinhunt_id: "PHUK-TEST0010" },
    ];
  });

  it("still needs a valid token", async () => {
    expect((await request(app).post("/api/admin/research/runs").send({ run })).status).toBe(401);
    expect((await request(app).post("/api/admin/research/runs").set("Authorization", "Bearer bad").send({ run })).status).toBe(401);
  });

  it("previews and loads the leads file with no change to the route", async () => {
    const preview = await request(app).post("/api/admin/research/runs/preview").set(auth).send({ run });
    expect(preview.status).toBe(200);
    expect(preview.body.engineVersion).toBe("marketplace-leads/1");
    expect(preview.body.counts.byConfidence).toMatchObject({ High: 0, Medium: 0 });

    const res = await request(app).post("/api/admin/research/runs").set(auth).send({ run });
    expect(res.status).toBe(200);
    expect(tables.catalogue_research_runs).toHaveLength(1);
    expect(tables.catalogue_research_runs[0].engine_version).toBe("marketplace-leads/1");
    expect(tables.catalogue_candidates).toHaveLength(run.candidates.length);
    for (const c of tables.catalogue_candidates) {
      expect(["Low", "Unverified"]).toContain(c.record_confidence);
      expect(c.status).toBe("researched");
    }
    // Discrepancy checks are linked to the existing pin, so they show as conflicts.
    const sizeCheck = tables.catalogue_candidates.find(c => (c.review_reasons as string[]).includes("discrepancy:edition_size"))!;
    expect(sizeCheck.duplicate_pin_id).toBe("pin-uuid-0001");
    const yearCheck = tables.catalogue_candidates.find(c => (c.review_reasons as string[]).includes("discrepancy:release_year"))!;
    expect(yearCheck.duplicate_pin_id).toBe("pin-uuid-0010");
    // Evidence is lead-only, with no source link.
    expect(tables.catalogue_evidence.length).toBeGreaterThan(0);
    for (const e of tables.catalogue_evidence) {
      expect(e.source_class).toBe("unclassified");
      expect(e.method).toBe("search_snippet");
      expect(e.source_url).toBeNull();
    }
    // Nothing touched the catalogue.
    expect(tables.pins).toHaveLength(2);
    expect(tables.pin_sets ?? []).toHaveLength(0);
  });

  it("can never be approved as it stands, even after a direct check, because confidence is at most Low", async () => {
    await request(app).post("/api/admin/research/runs").set(auth).send({ run });
    const lead = tables.catalogue_candidates.find(c => c.entity_type === "pin" && c.record_confidence === "Low")!;
    expect(lead).toBeDefined();
    Object.assign(lead, { status: "direct_verified", direct_verified_by: "creator-1" });
    const res = await request(app).post(`/api/admin/research/candidates/${lead.id}/decision`).set(auth)
      .send({ decision: "approve", notes: "checked" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/confidence is too low/);
  });

  it("is refused by the import dry run", async () => {
    await request(app).post("/api/admin/research/runs").set(auth).send({ run });
    const ids = tables.catalogue_candidates.filter(c => c.entity_type === "pin").map(c => c.id as string).slice(0, 10);
    const res = await request(app).post("/api/admin/research/import/dry-run").set(auth).send({ candidateIds: ids });
    expect(res.status).toBe(200);
    expect(res.body.wouldCreate).toHaveLength(0);
    expect(res.body.refused).toHaveLength(ids.length);
  });
});
