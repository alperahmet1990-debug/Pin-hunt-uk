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
  rescans: [] as Array<[string, string | null]>,
  deleted: [] as string[],
  published: false,
  existing: null as null | { id: string },
  inserted: [] as Array<Record<string, unknown>>,
  uploads: [] as string[],
  enqueued: [] as string[],
  todayCount: 0,
  scanUpdates: [] as Array<[string, Record<string, unknown>]>,
  pageQueries: [] as Array<Record<string, unknown>>,
  lookalikeCalls: 0,
  indexRuns: [] as Array<Record<string, unknown>>,
  indexRunning: false,
  indexStopped: 0,
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
  updateScan: async (id: string, patch: Record<string, unknown>) => { state.scanUpdates.push([id, patch]); },
  uploadObject: async (_b: string, path: string) => { state.uploads.push(path); },
  getScan: async (id: string) => ({ id, status: "ready", created_by: "admin-1", image_path: `${id}/board.jpg`, stats: {}, updated_at: new Date().toISOString() }),
  downloadObject: async () => Buffer.from("crop"),
  getItem: async (_scan: string, id: string) => ({ id, crop_path: "scan-1/crops/001.jpg", candidates: [{ pinId: "PHUK-2", collection: "Rescue Rangers" }, { pinId: "PHUK-3", collection: "tails of friendship" }], cleanup_status: "done", cleaned_path: "x.jpg", image_review: "none", decision: "undecided", suggested_pin_id: "PHUK-10122801", decided_pin_id: null }),
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
  rescanBoard: async (scan: { id: string }, setHint?: string | null) => { state.rescans.push([scan.id, setHint ?? null]); },
  deleteBoard: async (scan: { id: string }) => {
    if (state.published) throw new (await import("../services/boardScan/pipeline")).ReviewError("1 photo from this board is published", 409, "board_has_published");
    state.deleted.push(scan.id);
  },
  catalogueRepository: () => ({
    getPinByPinhuntId: async (id: string) => ({ id, title: "Meeko", collection: "Tails of Friendship", imageUrl: undefined }),
    searchPins: async () => [],
    searchPinsPage: async (q: string, f: { collection?: string; offset?: number; limit?: number }) => {
      state.pageQueries.push({ q, ...f });
      const all = Array.from({ length: 45 }, (_, i) => ({ id: `PHUK-${i + 1}`, title: `Pin ${i + 1}`, collection: f.collection ?? "", imageUrl: undefined }));
      return { pins: all.slice(f.offset ?? 0, (f.offset ?? 0) + (f.limit ?? 30)), total: all.length };
    },
    getPinsByIds: async (ids: string[]) => ids.filter((id) => id !== "PHUK-GONE").map((id) => ({ id, title: `Look ${id}`, collection: "Tails of Friendship", imageUrl: undefined })),
  }),
}));
vi.mock("../services/pictureIndex/search", () => ({
  lookalikePins: async () => { state.lookalikeCalls++; return ["PHUK-9", "PHUK-GONE", "PHUK-1"]; },
}));

vi.mock("../services/pictureIndex/indexer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/pictureIndex/indexer")>()),
  runIndexer: async (opts: Record<string, unknown>) => { state.indexRuns.push(opts); state.indexRunning = true; return true; },
  stopIndexer: () => { state.indexStopped++; },
  indexerState: () => ({ running: state.indexRunning, startedAt: null, finishedAt: null, done: 0, failed: 0, lastError: null, stopReason: null }),
}));
vi.mock("../services/pictureIndex/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/pictureIndex/store")>()),
  indexStatus: async () => ({ referencesTotal: 116503, indexed: 1200, failed: 3 }),
}));

import app from "../app";

let photo = "";
beforeAll(async () => {
  // A small "board": two pins on a background (not one flat colour, which is refused as blank).
  const board = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><rect width="64" height="48" fill="#346"/><circle cx="18" cy="24" r="10" fill="#e8a33c"/><rect x="36" y="12" width="18" height="24" fill="#c33"/></svg>`;
  photo = (await sharp(Buffer.from(board)).jpeg().toBuffer()).toString("base64");
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
    Object.assign(state, { isAdmin: true, isAppCreator: false, refLookups: [], existing: null, inserted: [], uploads: [], enqueued: [], todayCount: 0, scanUpdates: [] });
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

  it("refuses a blank (all one colour) photo before storing or processing it", async () => {
    const blank = (await sharp({ create: { width: 64, height: 48, channels: 3, background: "#000" } }).jpeg().toBuffer()).toString("base64");
    const res = await request(app).post("/api/admin/board-scans").set("Authorization", "Bearer t").send({ imageBase64: blank, permission: ownPhoto });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/blank/);
    expect(state.inserted).toHaveLength(0);
    expect(state.uploads).toHaveLength(0);
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

  it("keeps a big photo at full size too, for cropping, alongside the working copy", async () => {
    const big = (await sharp({ create: { width: 5200, height: 3900, channels: 3, background: "#346" } })
      .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><circle cx="200" cy="150" r="90" fill="#e8a33c"/></svg>'), left: 1000, top: 1000 }])
      .jpeg().toBuffer()).toString("base64");
    const res = await request(app).post("/api/admin/board-scans").set("Authorization", "Bearer t").send({ imageBase64: big, permission: ownPhoto });
    expect(res.status).toBe(202);
    expect(state.inserted[0]).toMatchObject({ image_width: 4096, image_height: 3072 });
    expect(state.uploads).toEqual(["scan-1/board.jpg", "scan-1/original.jpg"]);
    expect(state.scanUpdates.at(-1)).toEqual(["scan-1", { image_path: "scan-1/board.jpg", stats: { original: { path: "scan-1/original.jpg", width: 5200, height: 3900 } } }]);
  });

  it("doesn't keep a second copy of a photo that's already small enough", async () => {
    await upload({ permission: ownPhoto });
    expect(state.uploads).toEqual(["scan-1/board.jpg"]);
  });

  it("returns the existing board for the same photo instead of processing it again", async () => {
    state.existing = { id: "scan-old" };
    const res = await upload({ permission: ownPhoto });
    expect(res.body).toMatchObject({ duplicate: true, scan: { id: "scan-old" } });
    expect(state.enqueued).toEqual([]);
  });

  it("keeps a set typed when the same photo is uploaded again, ready for Scan again", async () => {
    state.existing = { id: "scan-old" };
    await upload({ permission: ownPhoto, setHint: "Tails of Friendship" });
    expect(state.scanUpdates).toEqual([["scan-old", { stats: { setHints: ["Tails of Friendship"] } }]]);
    expect(state.enqueued).toEqual([]);
  });

  it("explains an iPhone HEIC photo instead of a generic error", async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(64)]).toString("base64");
    const res = await request(app).post("/api/admin/board-scans").set("Authorization", "Bearer t").send({ imageBase64: heic, permission: ownPhoto });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/HEIC.*JPEG/);
    expect(state.inserted).toEqual([]);
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
    Object.assign(state, { isAdmin: true, isAppCreator: false, refLookups: [], learned: [], rescans: [], deleted: [], published: false });
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

  it("browses a set page by page, with or without words", async () => {
    state.pageQueries = [];
    const first = await request(app).get("/api/admin/board-scans-pin-search?set=Tails%20of%20Friendship").set("Authorization", "Bearer t");
    expect(first.body).toMatchObject({ total: 45, more: true });
    expect(first.body.pins).toHaveLength(30);
    const second = await request(app).get("/api/admin/board-scans-pin-search?set=Tails%20of%20Friendship&q=meeko&offset=30").set("Authorization", "Bearer t");
    expect(second.body).toMatchObject({ more: false });
    expect(second.body.pins).toHaveLength(15);
    expect(state.pageQueries).toEqual([
      expect.objectContaining({ q: "", collection: "Tails of Friendship", offset: 0, limit: 30 }),
      expect.objectContaining({ q: "meeko", collection: "Tails of Friendship", offset: 30 }),
    ]);
    // Words alone still need two letters.
    expect((await request(app).get("/api/admin/board-scans-pin-search?q=a").set("Authorization", "Bearer t")).body.pins).toEqual([]);
  });

  it("offers the board's sets and, with the picture index on, look-alikes in order", async () => {
    const picks = () => request(app).get("/api/admin/board-scans/scan-1/items/i1/picks").set("Authorization", "Bearer t");
    const off = await picks();
    expect(off.body).toEqual({ sets: ["Rescue Rangers", "tails of friendship"], lookalikes: [] });
    expect(state.lookalikeCalls).toBe(0);

    vi.stubEnv("PICTURE_INDEX_ENABLED", "true");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", JSON.stringify({ project_id: "p", client_email: "a@p.iam.gserviceaccount.com", private_key: "k" }));
    state.isAppCreator = true;
    const on = await picks();
    expect(on.body.lookalikes.map((p: { pinId: string }) => p.pinId)).toEqual(["PHUK-9", "PHUK-1"]);
    expect(on.body.lookalikes[1]).toMatchObject({ referenceUrl: "https://pinandpop.example/1.jpg" });
    vi.unstubAllEnvs();
  });

  it("confirming a pin learns its set and says how many pins are being re-matched", async () => {
    const res = await request(app).patch("/api/admin/board-scans/scan-1/items/i1").set("Authorization", "Bearer t").send({ action: "confirm" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rematching: 3, set: "Tails of Friendship", item: { decision: "confirmed", decided_pin_id: "PHUK-10122801" } });
    expect(state.learned).toEqual([["Tails of Friendship", "i1"]]);
  });

  it("rejecting a photo drops it and lets the reviewer clean again", async () => {
    const res = await request(app).patch("/api/admin/board-scans/scan-1/items/i1").set("Authorization", "Bearer t").send({ action: "reject_image" });
    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ image_review: "rejected", cleanup_status: "skipped", cleaned_path: null });
    expect(res.body.item.cleanup_note).toMatch(/Clean photo/);
  });

  it("excluding a pin doesn't learn a set", async () => {
    const res = await request(app).patch("/api/admin/board-scans/scan-1/items/i1").set("Authorization", "Bearer t").send({ action: "exclude", reason: "not_a_pin" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rematching: 0, set: null });
    expect(state.learned).toEqual([]);
  });

  it("scans a board again with an optional set, and deletes a board", async () => {
    const again = await request(app).post("/api/admin/board-scans/scan-1/rescan").set("Authorization", "Bearer t").send({ setHint: "Tails of Friendship" });
    expect(again.status).toBe(202);
    expect(state.rescans).toEqual([["scan-1", "Tails of Friendship"]]);
    const del = await request(app).delete("/api/admin/board-scans/scan-1").set("Authorization", "Bearer t");
    expect(del.status).toBe(200);
    expect(state.deleted).toEqual(["scan-1"]);
  });

  it("explains why a board with published photos can't be deleted", async () => {
    state.published = true;
    const del = await request(app).delete("/api/admin/board-scans/scan-1").set("Authorization", "Bearer t");
    expect(del.status).toBe(409);
    expect(del.body).toMatchObject({ code: "board_has_published" });
  });

  it("only admins can scan again or delete", async () => {
    state.isAdmin = false;
    expect((await request(app).delete("/api/admin/board-scans/scan-1").set("Authorization", "Bearer t")).status).toBe(403);
    expect((await request(app).post("/api/admin/board-scans/scan-1/rescan").set("Authorization", "Bearer t")).status).toBe(403);
    expect(state.deleted).toEqual([]);
  });

  it("turns a photo only by \"auto\" or up to 45 degrees", async () => {
    const rotate = (degrees: unknown) =>
      request(app).post("/api/admin/board-scans/scan-1/items/i1/rotate").set("Authorization", "Bearer t").send({ degrees });
    for (const bad of [0, 90, -46, "left", null]) expect((await rotate(bad)).status).toBe(400);
  });

  describe("picture index", () => {
    const creds = JSON.stringify({ project_id: "p", client_email: "a@p.iam.gserviceaccount.com", private_key: "k" });
    beforeEach(() => { Object.assign(state, { indexRuns: [], indexRunning: false, indexStopped: 0 }); });

    it("says when it's switched off, and won't build", async () => {
      const res = await request(app).get("/api/admin/board-scans-picture-index").set("Authorization", "Bearer t");
      expect(res.body).toMatchObject({ configured: false, status: null });
      expect((await request(app).post("/api/admin/board-scans-picture-index/run").set("Authorization", "Bearer t")).status).toBe(400);
      expect(state.indexRuns).toEqual([]);
    });

    it("shows progress, starts a build in the background once, and stops it", async () => {
      vi.stubEnv("PICTURE_INDEX_ENABLED", "true");
      vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", creds);
      const res = await request(app).get("/api/admin/board-scans-picture-index").set("Authorization", "Bearer t");
      expect(res.body).toMatchObject({ configured: true, location: "europe-west2", status: { referencesTotal: 116503, indexed: 1200, failed: 3 } });
      expect((await request(app).post("/api/admin/board-scans-picture-index/run").set("Authorization", "Bearer t").send({ retryFailed: true })).status).toBe(202);
      expect(state.indexRuns).toEqual([{ retryFailed: true }]);
      expect((await request(app).post("/api/admin/board-scans-picture-index/run").set("Authorization", "Bearer t")).status).toBe(409);
      await request(app).post("/api/admin/board-scans-picture-index/stop").set("Authorization", "Bearer t");
      expect(state.indexStopped).toBe(1);
    });

    it("is for admins only", async () => {
      state.isAdmin = false;
      expect((await request(app).get("/api/admin/board-scans-picture-index").set("Authorization", "Bearer t")).status).toBe(403);
      expect((await request(app).post("/api/admin/board-scans-picture-index/run").set("Authorization", "Bearer t")).status).toBe(403);
    });
  });
});
