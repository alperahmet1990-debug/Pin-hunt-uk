import { readFileSync } from "node:fs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory fake of the Supabase tables these routes touch. No network.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let isCreator = true;
let nextId = 1;
const uuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;

function builder(table: string) {
  const filters: Array<[string, unknown]> = [];
  let inFilter: [string, unknown[]] | null = null;
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | Row[] | null = null;
  const rows = () => (tables[table] ??= []);
  const match = (r: Row) => filters.every(([k, v]) => r[k] === v) && (!inFilter || inFilter[1].includes(r[inFilter[0]]));
  const run = () => {
    if (table === "profiles") return { data: { is_app_creator: isCreator }, error: null };
    if (op === "insert") {
      const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
      const inserted = list.map(r => ({ id: uuid(), status: "researched", ...r }));
      rows().push(...inserted);
      return { data: inserted, error: null };
    }
    if (op === "update") { rows().filter(match).forEach(r => Object.assign(r, payload)); return { data: null, error: null }; }
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
const { default: app } = await import("../app");

const payload = JSON.parse(readFileSync(new URL("../lib/__fixtures__/research-run.pilot.json", import.meta.url), "utf8"));
// The pilot has no duplicates; mark one candidate as a duplicate to exercise the pin link.
payload.candidates.find((c: { research_key: string }) => c.research_key === "brush-of-magic/limited-edition/bambi").duplicate_pinhunt_id = "PHUK-00000625";
const auth = { Authorization: "Bearer good" };

describe("research review routes — access", () => {
  beforeEach(() => { isCreator = true; });
  const routes: Array<["get" | "post", string]> = [
    ["post", "/api/admin/research/runs/preview"], ["post", "/api/admin/research/runs"], ["get", "/api/admin/research/runs"],
    ["get", "/api/admin/research/candidates"], ["get", "/api/admin/research/candidates/00000000-0000-4000-8000-000000000001"],
    ["post", "/api/admin/research/candidates/00000000-0000-4000-8000-000000000001/direct-check"],
    ["post", "/api/admin/research/candidates/00000000-0000-4000-8000-000000000001/decision"],
  ];
  it.each(routes)("%s %s → 401 without a token", async (m, p) => {
    expect((await request(app)[m](p).send({})).status).toBe(401);
  });
  it.each(routes)("%s %s → 401 with an invalid token", async (m, p) => {
    expect((await request(app)[m](p).set("Authorization", "Bearer bad").send({})).status).toBe(401);
  });
  it.each(routes)("%s %s → 403 for admins who are not the App Creator", async (m, p) => {
    isCreator = false;
    expect((await request(app)[m](p).set(auth).send({})).status).toBe(403);
  });
});

describe("research review routes — flow", () => {
  beforeEach(() => { isCreator = true; for (const k of Object.keys(tables)) delete tables[k]; tables.pins = [{ id: "pin-uuid-625", pinhunt_id: "PHUK-00000625" }]; });

  it("previews without writing anything", async () => {
    const res = await request(app).post("/api/admin/research/runs/preview").set(auth).send({ run: payload });
    expect(res.status).toBe(200);
    expect(res.body.counts.pins).toBe(28);
    expect(tables.catalogue_research_runs ?? []).toHaveLength(0);
  });

  it("rejects an invalid payload with reasons and writes nothing", async () => {
    const res = await request(app).post("/api/admin/research/runs").set(auth).send({ run: { ...payload, format: "x" } });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/format/);
    expect(tables.catalogue_research_runs ?? []).toHaveLength(0);
  });

  it("loads a run, then enforces direct check → decision", async () => {
    const load = await request(app).post("/api/admin/research/runs").set(auth).send({ run: payload });
    expect(load.status).toBe(200);
    expect(tables.catalogue_candidates).toHaveLength(32);
    expect(tables.catalogue_evidence.length).toBe(payload.candidates.reduce((n: number, c: { evidence: unknown[] }) => n + c.evidence.length, 0));
    // Duplicates are linked to live pin UUIDs
    const bambi = tables.catalogue_candidates.find(c => c.research_key === "brush-of-magic/limited-edition/bambi")!;
    expect(bambi.duplicate_pin_id).toBe("pin-uuid-625");
    // Nothing touches pins
    expect(tables.pins).toHaveLength(1);

    const zazu = tables.catalogue_candidates.find(c => c.research_key === "brush-of-magic/mystery-series-3/zazu")!;
    expect(zazu.status).toBe("needs_direct_verification");
    const early = await request(app).post(`/api/admin/research/candidates/${zazu.id}/decision`).set(auth).send({ decision: "approve" });
    expect(early.status).toBe(409);

    const badSrc = await request(app).post(`/api/admin/research/candidates/${zazu.id}/direct-check`).set(auth)
      .send({ fields: ["characters"], sourceUrl: "https://pinandpop.com/pins/1" });
    expect(badSrc.status).toBe(400);

    const check = await request(app).post(`/api/admin/research/candidates/${zazu.id}/direct-check`).set(auth)
      .send({ fields: ["characters", "release_date"], sourceUrl: "https://www.disneystore.co.uk/disney-brush-of-magic-series-3", note: "UK listing names Zazu" });
    expect(check.status).toBe(200);
    expect(check.body.status).toBe("direct_verified");
    const human = tables.catalogue_evidence.filter(e => e.candidate_id === zazu.id && e.method === "human_direct_check");
    expect(human).toHaveLength(2);
    expect(human[0]).toMatchObject({ checked_by: "creator-1", source_class: "official" });

    const ok = await request(app).post(`/api/admin/research/candidates/${zazu.id}/decision`).set(auth)
      .send({ decision: "approve", notes: zazu.warnings && (zazu.warnings as string[]).length ? "confirmed on UK listing" : null });
    expect(ok.status).toBe(200);
    expect(zazu).toMatchObject({ status: "approved", decided_by: "creator-1" });
  });

  it("validates ids and filters", async () => {
    expect((await request(app).get("/api/admin/research/candidates/not-a-uuid").set(auth)).status).toBe(400);
    expect((await request(app).get("/api/admin/research/candidates?status=bogus").set(auth)).status).toBe(400);
  });
});
