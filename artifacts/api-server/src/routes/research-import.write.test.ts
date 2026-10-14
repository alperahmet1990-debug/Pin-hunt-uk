import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Supabase fake with real inserts, updates and deletes, so the import's effects
// (and its compensation on failure) can be asserted on table contents.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let isCreator = true;
let seq = 0;
let failOn: string | null = null; // e.g. "pins.insert", "catalogue_candidates.update#2"
let updateCalls = 0;
let onCandidateUpdate: ((call: number) => void) | null = null;

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | Row[] | null = null;
  const match = (r: Row) => filters.every(f => f(r));
  const run = () => {
    if (table === "profiles") return { data: { is_app_creator: isCreator }, error: null };
    const t = (tables[table] ??= []);
    if (op === "insert") {
      if (failOn === `${table}.insert`) return { data: null, error: new Error(`${table} insert failed`) };
      const rows = (Array.isArray(payload) ? payload : [payload!]).map(r => ({ id: `${table}-${t.length + 1}-${Math.random().toString(36).slice(2, 6)}`, ...r }));
      t.push(...rows);
      return { data: rows, error: null };
    }
    if (op === "update") {
      if (table === "catalogue_candidates") { updateCalls++; onCandidateUpdate?.(updateCalls); }
      if (failOn === `${table}.update#${updateCalls}`) return { data: null, error: new Error("update failed") };
      const hit = t.filter(match);
      hit.forEach(r => Object.assign(r, payload));
      return { data: hit, error: null };
    }
    if (op === "delete") {
      const keep = t.filter(r => !match(r));
      const gone = t.length - keep.length;
      tables[table] = keep;
      return { data: Array(gone).fill({}), error: null };
    }
    return { data: t.filter(match), error: null };
  };
  const b: Row = {
    select: () => b, limit: () => b, order: () => b,
    eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return b; },
    in: (k: string, v: unknown[]) => { filters.push(r => v.includes(r[k])); return b; },
    insert: (p: Row | Row[]) => { op = "insert"; payload = p; return b; },
    update: (p: Row) => { op = "update"; payload = p; return b; },
    delete: () => { op = "delete"; return b; },
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
    rpc: async (fn: string) => {
      if (fn !== "next_pinhunt_id") return { data: null, error: new Error("unexpected rpc") };
      if (failOn === "rpc") return { data: null, error: new Error("mint failed") };
      seq += 1;
      return { data: `PHUK-${String(900000 + seq).padStart(8, "0")}`, error: null };
    },
  }),
}));
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
const { default: app } = await import("../app");

const URL_ = "/api/admin/research/import";
const auth = { Authorization: "Bearer good" };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const proposed = (extra: Row = {}) => ({
  "Pin name": "Ducks of Disney – Stitch", Brand: "Disney Store", "Main character": "Stitch", Characters: "Stitch",
  "Release year": 2025, "Edition type": "limited release", "Collection name": "Ducks of Disney Mystery Pin Pouch",
  Series: "Ducks of Disney Mystery Pin Pouch", Currency: "GBP", ...extra,
});
const cand = (n: number, extra: Row = {}): Row => ({
  id: id(n), entity_type: "pin", status: "approved", proposed: proposed({ "Pin name": `Ducks of Disney – Pin ${n}` }),
  review_reasons: [], warnings: [], duplicate_status: "NEW", duplicate_pin_id: null,
  direct_verified_by: "rev-1", decided_by: "rev-1", imported_pin_id: null, import_batch_id: null, ...extra,
});
const existingPin = { id: "pin-live-1", pinhunt_id: "PHUK-00000001", title: "Existing", collection: "X", verification_status: "verified" };

describe("research import (#241)", () => {
  beforeEach(() => {
    isCreator = true; seq = 0; failOn = null; updateCalls = 0; onCandidateUpdate = null;
    for (const k of Object.keys(tables)) delete tables[k];
    tables.pins = [{ ...existingPin }];
    tables.import_batches = [];
    tables.catalogue_candidates = [
      cand(1), cand(2), cand(3),
      cand(4, { status: "direct_verified" }),
      cand(5, { review_reasons: ["conflict: hold: possible duplicate of x"] }),
      cand(6, { proposed: proposed({ Brand: "" }) }),
    ];
  });

  it("401 without a token or with a bad one, 403 for non-creators, and writes nothing", async () => {
    expect((await request(app).post(URL_).send({ candidateIds: [id(1)] })).status).toBe(401);
    expect((await request(app).post(URL_).set({ Authorization: "Bearer bad" }).send({ candidateIds: [id(1)] })).status).toBe(401);
    isCreator = false;
    expect((await request(app).post(URL_).set(auth).send({ candidateIds: [id(1)] })).status).toBe(403);
    expect(tables.pins).toEqual([existingPin]);
    expect(tables.import_batches).toEqual([]);
  });

  it("validates the request", async () => {
    for (const body of [{}, { candidateIds: [] }, { candidateIds: ["nope"] }, { candidateIds: [id(1), id(1)] },
      { candidateIds: Array.from({ length: 51 }, (_, i) => id(i + 1)) }]) {
      expect((await request(app).post(URL_).set(auth).send(body)).status).toBe(400);
    }
  });

  it("imports eligible candidates as NEW, non-public pins and links each candidate", async () => {
    const res = await request(app).post(URL_).set(auth).send({ candidateIds: [id(1), id(2), id(3)] });
    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(3);
    const newPins = tables.pins.filter(p => p.id !== existingPin.id);
    expect(newPins).toHaveLength(3);
    for (const p of newPins) {
      expect(p.verification_status).toBe("needs_source_verification");
      expect(p.is_seed_record).toBe(true);
      expect(p.needs_review).toBe(true);
      expect(p.import_batch_id).toBe(res.body.batchId);
      expect(String(p.pinhunt_id)).toMatch(/^PHUK-\d{8}$/);
      expect(p.catalogue_source).toBeNull();
    }
    expect(tables.pins.find(p => p.id === existingPin.id)).toEqual(existingPin); // never touched
    for (const n of [1, 2, 3]) {
      const c = tables.catalogue_candidates.find(r => r.id === id(n))!;
      expect(c.status).toBe("imported");
      expect(newPins.map(p => p.id)).toContain(c.imported_pin_id);
      expect(c.import_batch_id).toBe(res.body.batchId);
    }
    expect(tables.import_batches[0]).toMatchObject({ status: "completed", inserted_rows: 3, total_rows: 3, imported_by: "creator-1" });
  });

  it("refuses the whole batch when any candidate is ineligible, and writes nothing", async () => {
    for (const bad of [4, 5, 6, 99]) {
      const res = await request(app).post(URL_).set(auth).send({ candidateIds: [id(1), id(bad)] });
      expect(res.status).toBe(409);
      expect(res.body.refused.map((r: { candidateId: string }) => r.candidateId)).toEqual([id(bad)]);
    }
    const reasons = async (n: number) => (await request(app).post(URL_).set(auth).send({ candidateIds: [id(n)] })).body.refused[0].reason;
    expect(await reasons(4)).toBe("not_approved");
    expect(await reasons(5)).toBe("flagged_duplicate"); // "possible duplicate" hold text is caught first
    expect(await reasons(6)).toBe("missing_required_fields");
    expect(tables.pins).toEqual([existingPin]);
    expect(tables.import_batches).toEqual([]);
    expect(tables.catalogue_candidates.every(c => c.status !== "imported")).toBe(true);
  });

  it("stores only full release dates (the column is a DATE); month-only dates become null", async () => {
    tables.catalogue_candidates.push(cand(9, { proposed: proposed({ "Pin name": "Month only", "Release date": "2024-04" }) }));
    tables.catalogue_candidates.push(cand(10, { proposed: proposed({ "Pin name": "Full day", "Release date": "2024-04-12" }) }));
    const res = await request(app).post(URL_).set(auth).send({ candidateIds: [id(9), id(10)] });
    expect(res.status).toBe(200);
    expect(tables.pins.find(p => p.title === "Month only")!.release_date).toBeNull();
    expect(tables.pins.find(p => p.title === "Full day")!.release_date).toBe("2024-04-12");
  });

  it("refuses a candidate with an unresolved conflict that is not a duplicate", async () => {
    tables.catalogue_candidates.push(cand(7, { review_reasons: ["conflict: edition_type"] }));
    const res = await request(app).post(URL_).set(auth).send({ candidateIds: [id(7)] });
    expect(res.status).toBe(409);
    expect(res.body.refused[0].reason).toBe("unresolved_conflict");
  });

  it("refuses a candidate whose title and collection already exist in the live catalogue", async () => {
    tables.catalogue_candidates.push(cand(8, { proposed: proposed({ "Pin name": "Existing", "Collection name": "X" }) }));
    const res = await request(app).post(URL_).set(auth).send({ candidateIds: [id(8)] });
    expect(res.status).toBe(409);
    expect(res.body.refused[0].reason).toBe("catalogue_duplicate");
  });

  it.each([
    ["the pin insert fails", "pins.insert"],
    ["minting an id fails", "rpc"],
    ["a candidate update fails part-way", "catalogue_candidates.update#2"],
  ])("leaves no new pins and no imported candidates when %s", async (_label, where) => {
    failOn = where;
    const res = await request(app).post(URL_).set(auth).send({ candidateIds: [id(1), id(2), id(3)] });
    expect(res.status).toBe(500);
    expect(tables.pins).toEqual([existingPin]);
    expect(tables.catalogue_candidates.filter(c => c.status === "imported")).toEqual([]);
    expect(tables.catalogue_candidates.filter(c => c.imported_pin_id)).toEqual([]);
    expect(tables.import_batches[0]?.status).toBe("failed");
  });

  it("fails the batch, without overwriting, when a candidate changes during the import", async () => {
    // A concurrent decision rejects candidate 2 just before the import updates it.
    onCandidateUpdate = call => { if (call === 2) tables.catalogue_candidates.find(r => r.id === id(2))!.status = "rejected"; };
    const res = await request(app).post(URL_).set(auth).send({ candidateIds: [id(1), id(2)] });
    expect(res.status).toBe(500);
    expect(tables.pins).toEqual([existingPin]);
    expect(tables.catalogue_candidates.find(c => c.id === id(1))!.status).toBe("approved");
    expect(tables.catalogue_candidates.find(c => c.id === id(2))!.status).toBe("rejected");
    expect(tables.import_batches[0].status).toBe("failed");
  });
});
