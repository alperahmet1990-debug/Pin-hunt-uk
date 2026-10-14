import { readFileSync } from "node:fs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory fake of the Supabase tables these routes touch. No network.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let isCreator = true;
let beforeUpdate: ((table: string) => void) | null = null;
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
    if (op === "update") { beforeUpdate?.(table); const hit = rows().filter(match); hit.forEach(r => Object.assign(r, payload)); return { data: hit.map(r => ({ id: r.id })), error: null }; }
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

const payload = JSON.parse(readFileSync(new URL("../lib/__fixtures__/research-run.sample.json", import.meta.url), "utf8"));
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
    ["post", "/api/admin/research/sets/00000000-0000-4000-8000-000000000001/brush-of-magic%2Flimited-edition/direct-check"],
    ["post", "/api/admin/research/sets/00000000-0000-4000-8000-000000000001/brush-of-magic%2Flimited-edition/decision"],
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
    expect(res.body.counts.pins).toBe(4);
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
    expect(tables.catalogue_candidates).toHaveLength(7);
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

  it("refuses oversized runs before doing any work", async () => {
    const big = { run: { ...payload, padding: "x".repeat(5 * 1024 * 1024 + 10) } };
    const res = await request(app).post("/api/admin/research/runs").set(auth).send(big);
    expect(res.status).toBe(413);
    expect(tables.catalogue_research_runs ?? []).toHaveLength(0);
  });

  it("labels only real Disney domains as official", async () => {
    const { isOfficialHost } = await import("./research-review");
    expect(isOfficialHost("www.disneystore.co.uk")).toBe(true);
    expect(isOfficialHost("disneyworld.disney.go.com")).toBe(true);
    expect(isOfficialHost("disneystore.example.net")).toBe(false);
    expect(isOfficialHost("notdisneystore.com")).toBe(false);
  });

  it("refuses a decision if the candidate changed meanwhile (409)", async () => {
    await request(app).post("/api/admin/research/runs").set(auth).send({ run: payload });
    const zazu = tables.catalogue_candidates.find(c => c.research_key === "brush-of-magic/mystery-series-3/zazu")!;
    // Another reviewer's decision lands between this request's read and its guarded write.
    beforeUpdate = (table) => { if (table === "catalogue_candidates") zazu.status = "rejected"; };
    const res = await request(app).post(`/api/admin/research/candidates/${zazu.id}/decision`).set(auth)
      .send({ decision: "needs_more_research", notes: "single source" });
    beforeUpdate = null;
    expect(res.status).toBe(409);
    expect(zazu.status).toBe("rejected");
  });

  it("does not overwrite a decision made during a direct check", async () => {
    await request(app).post("/api/admin/research/runs").set(auth).send({ run: payload });
    const zazu = tables.catalogue_candidates.find(c => c.research_key === "brush-of-magic/mystery-series-3/zazu")!;
    beforeUpdate = (table) => { if (table === "catalogue_candidates") zazu.status = "rejected"; };
    const res = await request(app).post(`/api/admin/research/candidates/${zazu.id}/direct-check`).set(auth)
      .send({ fields: ["characters"], sourceUrl: "https://www.disneystore.co.uk/x" });
    beforeUpdate = null;
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("needs_direct_verification");
    expect(zazu.status).toBe("rejected");
  });

  it("validates ids and filters", async () => {
    expect((await request(app).get("/api/admin/research/candidates/not-a-uuid").set(auth)).status).toBe(400);
    expect((await request(app).get("/api/admin/research/candidates?status=bogus").set(auth)).status).toBe(400);
  });
});

describe("research review routes — set level", () => {
  const KEY = encodeURIComponent("brush-of-magic/limited-edition");
  const OFFICIAL = "https://www.disneystore.com/brush-of-magic-limited-edition-set";
  let runId: string;
  const pin = (k: string) => tables.catalogue_candidates.find(c => c.research_key === k)!;
  const setUrl = (kind: "direct-check" | "decision", run = runId, key = KEY) => `/api/admin/research/sets/${run}/${key}/${kind}`;
  const bambi = () => pin("brush-of-magic/limited-edition/bambi");
  const marie = () => pin("brush-of-magic/limited-edition/marie");

  beforeEach(async () => {
    isCreator = true; beforeUpdate = null;
    for (const k of Object.keys(tables)) delete tables[k];
    tables.pins = [{ id: "pin-uuid-625", pinhunt_id: "PHUK-00000625" }];
    runId = (await request(app).post("/api/admin/research/runs").set(auth).send({ run: payload })).body.runId;
  });

  const humanChecks = (id: unknown) => tables.catalogue_evidence.filter(e => e.candidate_id === id && e.method === "human_direct_check");

  it("records one direct check per ticked pin and none for unticked pins", async () => {
    const res = await request(app).post(setUrl("direct-check")).set(auth).send({
      source_url: OFFICIAL, note: "set page lists both",
      confirmed: [{ candidateId: bambi().id, fields: ["characters", "pin_name"] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([{ candidateId: bambi().id, status: "direct_verified", recorded: 2 }]);
    expect(humanChecks(bambi().id)).toHaveLength(2);
    expect(humanChecks(bambi().id)[0]).toMatchObject({ source_url: OFFICIAL, checked_by: "creator-1", source_class: "official" });
    expect(humanChecks(marie().id)).toHaveLength(0);
    expect(marie().status).toBe("needs_direct_verification");
  });

  it("accepts a non-official page only when it is already cited for the set", async () => {
    const cited = "https://disneypinsblog.com/blogs/news/bambi-darkwing-duck-brush-of-magic-pins-at-disney-store";
    const body = (u: string) => ({ source_url: u, confirmed: [{ candidateId: bambi().id, fields: ["characters"] }] });
    expect((await request(app).post(setUrl("direct-check")).set(auth).send(body("https://example.org/other"))).status).toBe(400);
    expect(humanChecks(bambi().id)).toHaveLength(0);
    const ok = await request(app).post(setUrl("direct-check")).set(auth).send(body(cited));
    expect(ok.status).toBe(200);
    expect(humanChecks(bambi().id)[0]).toMatchObject({ source_class: "unclassified" });
  });

  it("refuses excluded sources, a candidate from another set or run, and bad batches (400)", async () => {
    const one = (id: unknown) => [{ candidateId: id, fields: ["characters"] }];
    const send = (body: Record<string, unknown>, url = setUrl("direct-check")) => request(app).post(url).set(auth).send(body);
    expect((await send({ source_url: "https://pinandpop.com/x", confirmed: one(bambi().id) })).status).toBe(400);
    expect((await send({ source_url: OFFICIAL, confirmed: one(pin("brush-of-magic/mystery-series-3/zazu").id) })).status).toBe(400);
    expect((await send({ source_url: OFFICIAL, confirmed: one(tables.catalogue_candidates.find(c => c.entity_type === "set")!.id) })).status).toBe(400);
    expect((await send({ source_url: OFFICIAL, confirmed: one(bambi().id) }, setUrl("direct-check", "00000000-0000-4000-8000-0000000000ff"))).status).toBe(400);
    expect((await send({ source_url: OFFICIAL, confirmed: [] })).status).toBe(400);
    expect((await send({ source_url: OFFICIAL, confirmed: [{ candidateId: bambi().id, fields: [] }] })).status).toBe(400);
    expect((await send({ source_url: OFFICIAL, confirmed: [...one(bambi().id), ...one(bambi().id)] })).status).toBe(400);
    const tooMany = Array.from({ length: 61 }, (_, i) => ({ candidateId: `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`, fields: ["characters"] }));
    expect((await send({ source_url: OFFICIAL, confirmed: tooMany })).status).toBe(400);
    expect(tables.catalogue_evidence.some(e => e.method === "human_direct_check")).toBe(false);
  });

  it("does not overwrite a status that changed during the set check", async () => {
    beforeUpdate = (table) => { if (table === "catalogue_candidates") bambi().status = "rejected"; };
    const res = await request(app).post(setUrl("direct-check")).set(auth)
      .send({ source_url: OFFICIAL, confirmed: [{ candidateId: bambi().id, fields: ["characters"] }] });
    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe("needs_direct_verification");
    expect(bambi().status).toBe("rejected");
  });

  it("approves only pins that pass the per-pin rules and reports the rest", async () => {
    // Bambi is checked; Marie (variants) is checked but no note is given; Zazu is in another set.
    await request(app).post(setUrl("direct-check")).set(auth).send({
      source_url: OFFICIAL,
      confirmed: [{ candidateId: bambi().id, fields: ["characters"] }, { candidateId: marie().id, fields: ["characters"] }],
    });
    const res = await request(app).post(setUrl("decision")).set(auth).send({ candidateIds: [bambi().id, marie().id] });
    expect(res.status).toBe(200);
    expect(res.body.approved).toEqual([bambi().id]);
    expect(res.body.skipped).toEqual([{ candidateId: marie().id, reason: expect.stringMatching(/variant values/) }]);
    expect(bambi()).toMatchObject({ status: "approved", decided_by: "creator-1" });
    expect(marie().status).toBe("direct_verified");
  });

  it("leaves unchecked pins, low identity, conflicts and duplicates pending", async () => {
    const res0 = await request(app).post(setUrl("decision")).set(auth).send({ candidateIds: [bambi().id] });
    expect(res0.body.approved).toEqual([]);
    expect(res0.body.skipped[0].reason).toMatch(/confirm the pin's identity/);

    await request(app).post(setUrl("direct-check")).set(auth)
      .send({ source_url: OFFICIAL, confirmed: [{ candidateId: bambi().id, fields: ["characters"] }, { candidateId: marie().id, fields: ["characters"] }] });
    bambi().duplicate_status = "PROBABLE DUPLICATE of PHUK-00000625";
    marie().review_reasons = ["conflict:release_date"];
    const res = await request(app).post(setUrl("decision")).set(auth).send({ candidateIds: [bambi().id, marie().id], notes: "confirmed on set page" });
    expect(res.body.approved).toEqual([]);
    expect(res.body.skipped.map((s: { reason: string }) => s.reason)).toEqual([expect.stringMatching(/Already in the catalogue/), expect.stringMatching(/conflicting/)]);
    marie().review_reasons = []; marie().record_confidence = "Low";
    const low = await request(app).post(setUrl("decision")).set(auth).send({ candidateIds: [marie().id], notes: "confirmed on set page" });
    expect(low.body.skipped[0].reason).toMatch(/confidence is too low/);
    expect(marie().status).toBe("direct_verified");
  });

  it("never approves variant or possible-duplicate pins in a batch, even with a note", async () => {
    await request(app).post(setUrl("direct-check")).set(auth).send({
      source_url: OFFICIAL,
      confirmed: [{ candidateId: bambi().id, fields: ["characters"] }, { candidateId: marie().id, fields: ["characters"] }],
    });
    expect((marie().warnings as unknown[]).length).toBeGreaterThan(0);
    const variant = await request(app).post(setUrl("decision")).set(auth).send({ candidateIds: [bambi().id, marie().id], notes: "confirmed all values" });
    expect(variant.body.approved).toEqual([bambi().id]);
    expect(variant.body.skipped).toEqual([{ candidateId: marie().id, reason: expect.stringMatching(/Has variant values/) }]);
    expect(marie().status).toBe("direct_verified");

    bambi().status = "direct_verified";
    bambi().review_reasons = ["possible cross-set duplicate of Bambi (other set)"];
    const dup = await request(app).post(setUrl("decision")).set(auth).send({ candidateIds: [bambi().id], notes: "ok" });
    expect(dup.body.approved).toEqual([]);
    expect(dup.body.skipped).toEqual([{ candidateId: bambi().id, reason: expect.stringMatching(/possible duplicate/) }]);
    expect(bambi().status).toBe("direct_verified");
  });

  it("does not overwrite a pin that changed status meanwhile", async () => {
    await request(app).post(setUrl("direct-check")).set(auth).send({ source_url: OFFICIAL, confirmed: [{ candidateId: bambi().id, fields: ["characters"] }] });
    beforeUpdate = (table) => { if (table === "catalogue_candidates") bambi().status = "rejected"; };
    const res = await request(app).post(setUrl("decision")).set(auth).send({ candidateIds: [bambi().id] });
    beforeUpdate = null;
    expect(res.body.approved).toEqual([]);
    expect(res.body.skipped[0].reason).toMatch(/Changed while you were deciding/);
    expect(bambi().status).toBe("rejected");
  });

  it("validates ids, set keys and pins from other sets on the decision route", async () => {
    const zazu = pin("brush-of-magic/mystery-series-3/zazu").id;
    expect((await request(app).post(setUrl("decision")).set(auth).send({ candidateIds: [zazu] })).status).toBe(400);
    expect((await request(app).post(setUrl("decision")).set(auth).send({ candidateIds: ["nope"] })).status).toBe(400);
    expect((await request(app).post(setUrl("decision", "bad")).set(auth).send({ candidateIds: [bambi().id] })).status).toBe(400);
    expect((await request(app).post(setUrl("decision", runId, "Bad%20Key")).set(auth).send({ candidateIds: [bambi().id] })).status).toBe(400);
  });
});
