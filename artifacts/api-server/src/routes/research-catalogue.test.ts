import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory fake of the Supabase tables these routes touch. No network.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let isCreator = true;
let nextId = 100;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function builder(table: string) {
  const filters: Array<[string, unknown]> = [];
  let inFilter: [string, unknown[]] | null = null;
  let range: [number, number] | null = null;
  let op: "select" | "insert" | "update" = "select";
  let payload: Row | null = null;
  const rows = () => (tables[table] ??= []);
  const match = (r: Row) => filters.every(([k, v]) => r[k] === v) && (!inFilter || inFilter[1].includes(r[inFilter[0]]));
  const run = () => {
    if (table === "profiles") return { data: { is_app_creator: isCreator }, error: null };
    if (op === "insert") { const r = { id: uuid(nextId++), ...payload }; rows().push(r); return { data: [r], error: null }; }
    if (op === "update") { const hit = rows().filter(match); hit.forEach(r => Object.assign(r, payload)); return { data: hit.map(r => ({ id: r.id })), error: null }; }
    const all = rows().filter(match);
    return { data: range ? all.slice(range[0], range[1] + 1) : all, error: null };
  };
  const b: Row = {
    select: () => b, order: () => b, limit: () => b,
    range: (a: number, z: number) => { range = [a, z]; return b; },
    insert: (p: Row) => { op = "insert"; payload = p; return b; },
    update: (p: Row) => { op = "update"; payload = p; return b; },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return b; },
    in: (k: string, v: unknown[]) => { inFilter = [k, v]; return b; },
    maybeSingle: async () => { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
    single: async () => { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
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
const auth = { Authorization: "Bearer good" };
const RUN = uuid(1);

const pin = (n: number, key: string, set: string | null, p: Row, extra: Row = {}) => ({
  id: uuid(n), run_id: RUN, entity_type: "pin", research_key: key, set_research_key: set, proposed: p,
  status: "needs_direct_verification", record_confidence: "Medium", review_reasons: [], warnings: [],
  duplicate_status: "NEW", direct_verified_by: null, ...extra,
});

function seed() {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.catalogue_candidates = [
    pin(10, "wdw/2019/oe/stitch", "wdw/2019/oe-single/stitch", { "Pin name": "Stitch 2019", "Edition type": "open edition" }),
    pin(11, "wdw/2019/mnsshp/logo", "wdw/2019/mnsshp", { "Pin name": "MNSSHP logo", "Edition type": "limited edition", "Expected pin count": 3 }),
    pin(12, "wdw/2019/mnsshp/hades", "wdw/2019/mnsshp", { "Pin name": "Hades", "Edition type": "limited edition", "Expected pin count": 3 },
      { review_reasons: ["possible cross-set duplicate of wdw/2019/x"] }),
    pin(13, "dlr/2018/oe/castle", "dlr/2018/oe-single/castle", { "Pin name": "Castle", "Edition type": "limited release" },
      { status: "direct_verified", direct_verified_by: "creator-1" }),
  ];
  tables.catalogue_evidence = [
    { id: uuid(50), candidate_id: uuid(10), field: "pin_name", value: "Stitch", source_url: "https://wdwnt.com/a" },
    { id: uuid(51), candidate_id: uuid(13), field: "pin_name", value: "Castle", source_url: "https://disneypinsblog.com/b" },
  ];
}

describe("research catalogue routes", () => {
  beforeEach(() => { isCreator = true; seed(); });

  it.each([
    ["get", "/api/admin/research/catalogue"], ["get", "/api/admin/research/catalogue/sets"],
    ["post", "/api/admin/research/catalogue/decisions"], ["post", `/api/admin/research/candidates/${uuid(10)}/flag`],
    ["get", "/api/admin/research/catalogue/research-needed"],
  ] as Array<["get" | "post", string]>)("%s %s is App Creator only", async (m, p) => {
    expect((await request(app)[m](p).send({})).status).toBe(401);
    isCreator = false;
    expect((await request(app)[m](p).set(auth).send({})).status).toBe(403);
  });

  it("filters by year, line, edition, source and status, with facets", async () => {
    const all = await request(app).get(`/api/admin/research/catalogue?runId=${RUN}`).set(auth);
    expect(all.body.total).toBe(4);
    expect(all.body.facets.edition).toEqual({ OE: 1, LE: 2, LR: 1 });
    expect((await request(app).get("/api/admin/research/catalogue?year=2019").set(auth)).body.total).toBe(3);
    expect((await request(app).get("/api/admin/research/catalogue?line=dlr").set(auth)).body.total).toBe(1);
    expect((await request(app).get("/api/admin/research/catalogue?edition=LE").set(auth)).body.total).toBe(2);
    expect((await request(app).get("/api/admin/research/catalogue?source=wdwnt").set(auth)).body.candidates[0].research_key).toBe("wdw/2019/oe/stitch");
    expect((await request(app).get("/api/admin/research/catalogue?status=direct_verified").set(auth)).body.total).toBe(1);
    expect((await request(app).get("/api/admin/research/catalogue?only=duplicates").set(auth)).body.total).toBe(1);
    expect((await request(app).get("/api/admin/research/catalogue?only=incomplete").set(auth)).body.total).toBe(2);
    expect((await request(app).get("/api/admin/research/catalogue?limit=1&offset=1").set(auth)).body.candidates).toHaveLength(1);
    expect((await request(app).get("/api/admin/research/catalogue?edition=XX").set(auth)).status).toBe(400);
  });

  it("reports incomplete sets without inventing members", async () => {
    const r = await request(app).get("/api/admin/research/catalogue/sets?only=incomplete").set(auth);
    expect(r.body.sets).toEqual([expect.objectContaining({ set_research_key: "wdw/2019/mnsshp", expected: 3, identified: 2, missing: 1, possible_duplicates: 1 })]);
  });

  it("batch decisions re-run the per-pin rules: no approval without a direct check", async () => {
    const r = await request(app).post("/api/admin/research/catalogue/decisions").set(auth)
      .send({ candidateIds: [uuid(10), uuid(13)], decision: "approve" });
    expect(r.body.decided).toBe(1);
    expect(r.body.results.find((x: Row) => x.candidateId === uuid(10)).ok).toBe(false);
    expect(tables.catalogue_candidates.find(c => c.id === uuid(13))!.status).toBe("approved");
  });

  it("research needed and reject need a note; batch is capped", async () => {
    expect((await request(app).post("/api/admin/research/catalogue/decisions").set(auth)
      .send({ candidateIds: [uuid(10)], decision: "needs_more_research" })).body.decided).toBe(0);
    const ok = await request(app).post("/api/admin/research/catalogue/decisions").set(auth)
      .send({ candidateIds: [uuid(10), uuid(11)], decision: "needs_more_research", notes: "find the card back" });
    expect(ok.body.decided).toBe(2);
    const many = Array.from({ length: 101 }, (_, i) => uuid(1000 + i));
    expect((await request(app).post("/api/admin/research/catalogue/decisions").set(auth).send({ candidateIds: many, decision: "reject", notes: "x x x" })).status).toBe(400);
  });

  it("flags are saved as attributed evidence and exported with research-needed pins", async () => {
    expect((await request(app).post(`/api/admin/research/candidates/${uuid(11)}/flag`).set(auth).send({ note: "x" })).status).toBe(400);
    expect((await request(app).post(`/api/admin/research/candidates/${uuid(11)}/flag`).set(auth).send({ note: "Hades may be a completer pin" })).status).toBe(200);
    const flag = tables.catalogue_evidence.find(e => e.field === "flag")!;
    expect(flag).toMatchObject({ candidate_id: uuid(11), method: "human_direct_check", checked_by: "creator-1" });
    await request(app).post("/api/admin/research/catalogue/decisions").set(auth).send({ candidateIds: [uuid(10)], decision: "needs_more_research", notes: "second source" });
    const exp = await request(app).get(`/api/admin/research/catalogue/research-needed?runId=${RUN}`).set(auth);
    expect(exp.body.format).toBe("pinhunt-research-needed-v1");
    expect(exp.body.items.map((i: Row) => i.research_key).sort()).toEqual(["wdw/2019/mnsshp/logo", "wdw/2019/oe/stitch"]);
    expect((await request(app).get("/api/admin/research/catalogue?only=flagged").set(auth)).body.total).toBe(1);
  });
});
