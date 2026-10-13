import request from "supertest";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake Supabase: no network. Tables are in memory; writes are recorded.
type Row = Record<string, unknown>;
let existingPins: Row[] = [];
let batches: Row[] = [];
let pinUpserts: Row[] = [];
let failPinsRead = false;

function builder(table: string) {
  const filters: Array<[string, unknown]> = [];
  let inIds: unknown[] | null = null;
  let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  let payload: Row | Row[] | null = null;
  const run = () => {
    if (table === "profiles") return { data: { is_app_creator: true }, error: null };
    if (table === "pins") {
      if (op === "upsert") {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        pinUpserts.push(...list);
        return { data: list.map((r, i) => ({ id: `pin-${i}`, pinhunt_id: r.pinhunt_id })), error: null };
      }
      if (failPinsRead) return { data: null, error: { message: "read failed" } };
      return { data: existingPins.filter(p => (!inIds || inIds.includes(p.pinhunt_id)) && filters.every(([k, v]) => p[k] === v)), error: null };
    }
    if (table === "import_batches") {
      if (op === "insert") { const b = { id: "batch-1", ...(payload as Row) }; batches.push(b); return { data: b, error: null }; }
      if (op === "update") { batches.filter(b => filters.every(([k, v]) => b[k] === v)).forEach(b => Object.assign(b, payload)); return { data: null, error: null }; }
      const found = batches.filter(b => filters.every(([k, v]) => b[k] === v && k !== "status") && !filters.some(([k]) => k === "file_hash"));
      return { data: found[0] ?? null, error: null };
    }
    return { data: [], error: null };
  };
  const b: Row = {
    select: () => b, order: () => b, limit: () => b,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return b; },
    in: (_k: string, ids: unknown[]) => { inIds = ids; return b; },
    insert: (p: Row) => { op = "insert"; payload = p; return b; },
    update: (p: Row) => { op = "update"; payload = p; return b; },
    upsert: (p: Row | Row[]) => { op = "upsert"; payload = p; return b; },
    delete: () => { op = "delete"; return b; },
    single: async () => { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
    maybeSingle: async () => { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return b;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "creator-1" } }, error: null }) },
    from: (t: string) => builder(t),
  }),
}));

// The route builds a service-role client; give it a dummy key (the client itself is faked above).
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
const { default: app } = await import("../app");

function workbook(rows: Array<Record<string, unknown>>): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Master Catalogue");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })).toString("base64");
}

const importRows = (rows: Array<Record<string, unknown>>, dryRun: boolean) =>
  request(app).post("/api/admin/catalogue-import").set("Authorization", "Bearer t")
    .send({ fileBase64: workbook(rows), dryRun, force: true });

const ALICE = { pinhunt_id: "PHUK-00000331", "Pin name": "Alice", Series: "Animated Cuties Mystery Collection", Characters: "Alice", Brand: "Disney Parks" };

beforeEach(() => {
  failPinsRead = false;
  batches = [];
  pinUpserts = [];
  existingPins = [
    { id: "u-331", pinhunt_id: "PHUK-00000331", title: "Mickey Mouse – Animated Cutie", collection: "Animated Cuties Mystery Collection 2026",
      main_character: "Mickey Mouse", all_characters: "Mickey Mouse", pin_characters: [{ characters: { name: "Mickey Mouse" } }] },
    { id: "u-69", pinhunt_id: "PHUK-00000069", title: "January 2026 – Windows of Attraction", collection: "2026 Windows of Attraction Pin Series",
      main_character: null, all_characters: "Unknown", pin_characters: [] },
    { id: "u-500", pinhunt_id: "PHUK-00000500", title: "Cinderela Castle", collection: "Castles", main_character: null, all_characters: null, pin_characters: [] },
  ];
});

describe("admin catalogue import — pinhunt_id identity guard (dry run)", () => {
  it("refuses a row that would turn an existing id into a different pin", async () => {
    const res = await importRows([ALICE], true);
    expect(res.status).toBe(200);
    expect(res.body.summary.updatedRows).toBe(0);
    expect(res.body.summary.insertedRows).toBe(0);
    const refusal = res.body.errorReport.find((e: { pinhuntId: string }) => e.pinhuntId === "PHUK-00000331");
    expect(refusal.result).toBe("error");
    expect(refusal.rowNum).toBe(2);
    expect(refusal.message).toMatch(/already belongs to a different pin/);
    expect(refusal.message).not.toMatch(/blank/i);
  });

  it("still allows refinements, typo fixes, placeholder resolution and new pins", async () => {
    const res = await importRows([
      { pinhunt_id: "PHUK-00000331", "Pin name": "Mickey Mouse – Animated Cutie (big eyes)", Series: "Animated Cuties Mystery Collection 2026", Characters: "Mickey Mouse", Brand: "Disney Parks" },
      { pinhunt_id: "PHUK-00000069", "Pin name": "Haunted Mansion – Windows of Attraction", Series: "Windows of Attraction Series", Characters: "Hatbox Ghost", Brand: "Disney Parks" },
      { pinhunt_id: "PHUK-00000500", "Pin name": "Cinderella Castle", Series: "Castles", Brand: "Disney Parks" },
      { pinhunt_id: "PHUK-00099999", "Pin name": "Brand new pin", Series: "New Set", Characters: "Stitch", Brand: "Disney Store" },
    ], true);
    expect(res.status).toBe(200);
    expect(res.body.summary.updatedRows).toBe(3);
    expect(res.body.summary.insertedRows).toBe(1);
    expect(res.body.errorReport.filter((e: { result: string }) => e.result === "error")).toHaveLength(0);
  });

  it("reports each refused row with its own row number when an id repeats", async () => {
    const res = await importRows([ALICE, { ...ALICE, "Pin name": "Pinocchio", Characters: "Pinocchio" }], true);
    const rows = res.body.errorReport.filter((e: { result: string }) => e.result === "error").map((e: { rowNum: number }) => e.rowNum);
    expect(rows.sort()).toEqual([2, 3]);
  });

  it("still requires a token", async () => {
    const res = await request(app).post("/api/admin/catalogue-import").send({});
    expect(res.status).toBe(401);
  });
});

describe("admin catalogue import — identity guard on the real import", () => {
  const waitForBatch = async () => {
    for (let i = 0; i < 100 && batches[0]?.status === "running"; i++) await new Promise(r => setTimeout(r, 10));
    return batches[0];
  };

  it("writes only identity-safe rows and records the refusal in the batch", async () => {
    const res = await importRows([
      ALICE,
      { pinhunt_id: "PHUK-00099999", "Pin name": "Brand new pin", Series: "New Set", Characters: "Stitch", Brand: "Disney Store" },
    ], false);
    expect(res.status).toBe(200);
    const batch = await waitForBatch();
    expect(batch.status).toBe("completed");
    expect(pinUpserts.map(p => p.pinhunt_id)).toEqual(["PHUK-00099999"]);
    const report = batch.error_report as Array<{ pinhuntId: string; rowNum: number; result: string }>;
    expect(report.find(e => e.pinhuntId === "PHUK-00000331")).toMatchObject({ rowNum: 2, result: "error" });
  });

  it("imports nothing when existing pins can't be read", async () => {
    failPinsRead = true;
    const res = await importRows([ALICE], false);
    expect(res.status).toBe(500);
    expect(pinUpserts).toHaveLength(0);
    expect(batches[0]?.status).toBe("failed");
  });
});

describe("admin catalogue import — reprocess-row", () => {
  it("refuses an edited row that would repurpose the id (409)", async () => {
    batches = [{ id: "batch-1", status: "completed", error_report: [], inserted_rows: 0, updated_rows: 0 }];
    const res = await request(app).post("/api/admin/catalogue-import/batches/batch-1/reprocess-row")
      .set("Authorization", "Bearer t")
      .send({ rowNum: 2, fields: { pinhunt_id: "PHUK-00000331", title: "Alice", collection: "Animated Cuties", characters: "Alice", brand: "Disney Parks" } });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already belongs to a different pin/);
    expect(pinUpserts).toHaveLength(0);
  });

  it("lets a correction of the same pin through", async () => {
    batches = [{ id: "batch-1", status: "completed", error_report: [], inserted_rows: 0, updated_rows: 0 }];
    const res = await request(app).post("/api/admin/catalogue-import/batches/batch-1/reprocess-row")
      .set("Authorization", "Bearer t")
      .send({ rowNum: 2, fields: { pinhunt_id: "PHUK-00000500", title: "Cinderella Castle", collection: "Castles", brand: "Disney Parks" } });
    expect(res.status).toBe(200);
    expect(pinUpserts.map(p => p.pinhunt_id)).toEqual(["PHUK-00000500"]);
  });
});
