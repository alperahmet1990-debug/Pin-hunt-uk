import request from "supertest";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Upload gating for board scans: admin only, a permission record before
// anything is processed, and the same photo never processed twice. All
// upstreams are mocked; nothing is detected or sent to Pixian here.

const state = vi.hoisted(() => ({
  isAdmin: true,
  isAppCreator: false,
  refLookups: [] as string[][],
  learned: [] as Array<[string, string]>,
  existing: null as null | { id: string },
  inserted: [] as Array<Record<string, unknown>>,
  uploads: [] as string[],
  enqueued: [] as string[],
  todayCount: 0,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "admin-1" } }, error: null }) },
  }),
}));
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  isAiConfigured: () => true,
  getOpenAIClient: () => ({}),
}));
vi.mock("../services/boardScan/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/boardScan/store")>()),
  boardDb: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: state.isAdmin, is_app_creator: state.isAppCreator }, error: null }) }) }) }),
  }),
  countScansSince: async () => state.todayCount,
  findScanByHash: async () => state.existing,
  insertScan: async (row: Record<string, unknown>) => {
    state.inserted.push(row);
    return { id: "scan-1", ...row };
  },
  updateScan: async () => {},
  uploadObject: async (_b: string, path: string) => { state.uploads.push(path); },
  getScan: async (id: string) => ({ id, status: "ready", created_by: "admin-1", image_path: `${id}/board.jpg`, stats: {}, updated_at: new Date().toISOString() }),
  getItem: async (_scan: string, id: string) => ({ id, cleanup_status: "done", cleaned_path: "x.jpg", image_review: "none", decision: "undecided", suggested_pin_id: "PHUK-10122801", decided_pin_id: null }),
  updateItem: async (_id: string, patch: Record<string, unknown>) => ({ id: "i1", cleanup_status: "done", image_review: "none", suggested_pin_id: "PHUK-10122801", ...patch }),
  listItems: async () => [{ id: "i1", position: 1, suggested_pin_id: "PHUK-1", decided_pin_id: null, decision: "undecided", candidates: [{ pinId: "PHUK-2" }], crop_path: null, cleaned_path: null }],
  signedUrls: async () => ({}),
  pinImageState: async () => ({}),
  pinAndPopReferences: async (ids: string[]) => {
    state.refLookups.push(ids);
    return { "PHUK-1": { imageUrl: "https://pinandpop.example/1.jpg", externalId: "77" } };
  },
}));
vi.mock("../services/boardScan/pipeline", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/boardScan/pipeline")>()),
  enqueue: (id: string) => { state.enqueued.push(id); },
  learnSet: async (_scan: unknown, collection: string, itemId: string) => { state.learned.push([collection, itemId]); return 3; },
  catalogueRepository: () => ({
    getPinByPinhuntId: async (id: string) => ({ id, title: "Meeko", collection: "Tails of Friendship", imageUrl: undefined }),
    searchPins: async () => [],
  }),
}));

import app from "../app";

let photo = "";
beforeAll(async () => {
  photo = (await sharp({ create: { width: 64, height: 48, channels: 3, background: "#346" } }).jpeg().toBuffer()).toString("base64");
});

const ownPhoto = { basis: "own_photo", processing: true, publicDisplay: true, notThirdPartyCatalogue: true };
const upload = (body: Record<string, unknown>) =>
  request(app).post("/api/admin/board-scans").set("Authorization", "Bearer t").send({ imageBase64: photo, ...body });

describe("POST /api/admin/board-scans", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://db.test.invalid");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("BOARD_SCAN_ENABLED", "true");
    Object.assign(state, { isAdmin: true, isAppCreator: false, refLookups: [], existing: null, inserted: [], uploads: [], enqueued: [], todayCount: 0 });
  });

  it("is off (404) unless explicitly enabled, before any auth or upload", async () => {
    for (const value of [undefined, "", "false", "1", "TRUE"]) {
      vi.stubEnv("BOARD_SCAN_ENABLED", value as string);
      const res = await upload({ permission: ownPhoto });
      expect(res.status).toBe(404);
      expect((await request(app).get("/api/admin/board-scans")).status).toBe(404);
      expect((await request(app).get("/api/admin/board-scans/scan-1")).status).toBe(404);
      expect((await request(app).post("/api/admin/board-scans/scan-1/approve-ready").set("Authorization", "Bearer t")).status).toBe(404);
    }
    expect(state.inserted).toHaveLength(0);
    expect(state.uploads).toHaveLength(0);
    expect(state.enqueued).toHaveLength(0);
  });

  it("is admin only", async () => {
    state.isAdmin = false;
    expect((await upload({ permission: ownPhoto })).status).toBe(403);
  });

  it("requires permission to process and a not-from-a-catalogue declaration", async () => {
    expect((await upload({ permission: { ...ownPhoto, processing: false } })).status).toBe(400);
    const res = await upload({ permission: { ...ownPhoto, notThirdPartyCatalogue: false } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pin & Pop/);
    expect(state.inserted).toHaveLength(0);
  });

  it("requires who gave permission and where the evidence is for a collector's photo", async () => {
    const permission = { ...ownPhoto, basis: "contributor_permission", contributorName: "A Collector" };
    expect((await upload({ permission })).status).toBe(400);
    const ok = await upload({ permission: { ...permission, evidence: "Facebook message, 11 Nov 2026" } });
    expect(ok.status).toBe(202);
    expect(state.inserted[0]).toMatchObject({
      permission_basis: "contributor_permission", contributor_name: "A Collector",
      permission_evidence: "Facebook message, 11 Nov 2026", permission_public_display: true,
    });
  });

  it("keeps the set typed at upload for matching", async () => {
    const res = await upload({ permission: ownPhoto, setHint: "  Tails of  Friendship " });
    expect(res.status).toBe(202);
    expect(state.inserted[0]).toMatchObject({ stats: { setHints: ["Tails of Friendship"] } });
  });

  it("stores the photo and starts processing", async () => {
    const res = await upload({ permission: ownPhoto, title: "Toy Story board" });
    expect(res.status).toBe(202);
    expect(state.uploads).toEqual(["scan-1/board.jpg"]);
    expect(state.enqueued).toEqual(["scan-1"]);
    expect(state.inserted[0]).toMatchObject({ image_width: 64, image_height: 48, mode: "catalogue_capture" });
  });

  it("returns the existing board for the same photo instead of processing it again", async () => {
    state.existing = { id: "scan-old" };
    const res = await upload({ permission: ownPhoto });
    expect(res.body).toMatchObject({ duplicate: true, scan: { id: "scan-old" } });
    expect(state.enqueued).toEqual([]);
  });

  it("enforces the daily board limit", async () => {
    state.todayCount = 40;
    expect((await upload({ permission: ownPhoto })).status).toBe(429);
  });
});

describe("board review extras", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://db.test.invalid");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("BOARD_SCAN_ENABLED", "true");
    Object.assign(state, { isAdmin: true, isAppCreator: false, refLookups: [], learned: [] });
  });
  const getBoard = () => request(app).get("/api/admin/board-scans/scan-1").set("Authorization", "Bearer t");

  it("sends Pin & Pop reference images to the App Creator only", async () => {
    const admin = await getBoard();
    expect(admin.status).toBe(200);
    expect(admin.body.pinAndPop).toEqual({});
    expect(state.refLookups).toEqual([]);

    state.isAppCreator = true;
    const creator = await getBoard();
    expect(creator.body.pinAndPop).toEqual({ "PHUK-1": { imageUrl: "https://pinandpop.example/1.jpg", externalId: "77" } });
    expect(state.refLookups[0]).toEqual(expect.arrayContaining(["PHUK-1", "PHUK-2"]));
  });

  it("adds the Pin & Pop picture to correction search results for the App Creator only", async () => {
    const search = () => request(app).get("/api/admin/board-scans-pin-search?q=PHUK-1").set("Authorization", "Bearer t");
    const admin = await search();
    expect(admin.status).toBe(200);
    expect(admin.body.pins[0]).toMatchObject({ pinId: "PHUK-1", referenceUrl: null });
    expect(state.refLookups).toEqual([]);
    state.isAppCreator = true;
    const creator = await search();
    expect(creator.body.pins[0]).toMatchObject({ pinId: "PHUK-1", referenceUrl: "https://pinandpop.example/1.jpg" });
  });

  it("confirming a pin learns its set and says how many pins are being re-matched", async () => {
    const res = await request(app).patch("/api/admin/board-scans/scan-1/items/i1").set("Authorization", "Bearer t").send({ action: "confirm" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rematching: 3, set: "Tails of Friendship", item: { decision: "confirmed", decided_pin_id: "PHUK-10122801" } });
    expect(state.learned).toEqual([["Tails of Friendship", "i1"]]);
  });

  it("excluding a pin doesn't learn a set", async () => {
    const res = await request(app).patch("/api/admin/board-scans/scan-1/items/i1").set("Authorization", "Bearer t").send({ action: "exclude", reason: "not_a_pin" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rematching: 0, set: null });
    expect(state.learned).toEqual([]);
  });

  it("turns a photo only by \"auto\" or up to 45 degrees", async () => {
    const rotate = (degrees: unknown) =>
      request(app).post("/api/admin/board-scans/scan-1/items/i1/rotate").set("Authorization", "Bearer t").send({ degrees });
    for (const bad of [0, 90, -46, "left", null]) expect((await rotate(bad)).status).toBe(400);
  });
});
