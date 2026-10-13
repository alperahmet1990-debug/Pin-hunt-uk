import request from "supertest";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake Supabase: no network. Existing pins are served from `existingPins`.
let existingPins: Array<Record<string, unknown>> = [];

function builder(table: string) {
  const state: { inIds?: string[] } = {};
  const result = () => {
    if (table === "profiles") return { data: { is_app_creator: true }, error: null };
    if (table === "import_batches") return { data: null, error: null };
    if (table === "pins") {
      const rows = existingPins.filter(p => !state.inIds || state.inIds.includes(p.pinhunt_id as string));
      return { data: rows, error: null };
    }
    return { data: [], error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b, eq: () => b, order: () => b, limit: () => b,
    in: (_col: string, ids: string[]) => { state.inIds = ids; return b; },
    single: async () => result(), maybeSingle: async () => result(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
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

const dryRun = (rows: Array<Record<string, unknown>>) =>
  request(app).post("/api/admin/catalogue-import").set("Authorization", "Bearer t")
    .send({ fileBase64: workbook(rows), dryRun: true });

describe("admin catalogue import — pinhunt_id identity guard (dry run)", () => {
  beforeEach(() => {
    existingPins = [
      { id: "u-331", pinhunt_id: "PHUK-00000331", title: "Mickey Mouse – Animated Cutie", collection: "Animated Cuties Mystery Collection 2026",
        main_character: "Mickey Mouse", all_characters: "Mickey Mouse", pin_characters: [{ characters: { name: "Mickey Mouse" } }] },
      { id: "u-69", pinhunt_id: "PHUK-00000069", title: "January 2026 – Windows of Attraction", collection: "2026 Windows of Attraction Pin Series",
        main_character: null, all_characters: "Unknown", pin_characters: [] },
    ];
  });

  it("refuses a row that would turn an existing id into a different pin", async () => {
    const res = await dryRun([
      { pinhunt_id: "PHUK-00000331", "Pin name": "Alice", Series: "Animated Cuties Mystery Collection", Characters: "Alice", Brand: "Disney Parks" },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.summary.updatedRows).toBe(0);
    expect(res.body.summary.insertedRows).toBe(0);
    const refusal = res.body.errorReport.find((e: { pinhuntId: string }) => e.pinhuntId === "PHUK-00000331");
    expect(refusal.result).toBe("error");
    expect(refusal.rowNum).toBe(2);
    expect(refusal.message).toMatch(/already belongs to a different pin/);
  });

  it("still allows refinements, placeholder resolution and new pins", async () => {
    const res = await dryRun([
      { pinhunt_id: "PHUK-00000331", "Pin name": "Mickey Mouse – Animated Cutie (big eyes)", Series: "Animated Cuties Mystery Collection 2026", Characters: "Mickey Mouse", Brand: "Disney Parks" },
      { pinhunt_id: "PHUK-00000069", "Pin name": "Haunted Mansion – Windows of Attraction", Series: "Windows of Attraction Series", Characters: "Hatbox Ghost", Brand: "Disney Parks" },
      { pinhunt_id: "PHUK-00099999", "Pin name": "Brand new pin", Series: "New Set", Characters: "Stitch", Brand: "Disney Store" },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.summary.updatedRows).toBe(2);
    expect(res.body.summary.insertedRows).toBe(1);
    expect(res.body.errorReport.filter((e: { result: string }) => e.result === "error")).toHaveLength(0);
  });

  it("still requires a token", async () => {
    const res = await request(app).post("/api/admin/catalogue-import").send({});
    expect(res.status).toBe(401);
  });
});
