import request from "supertest";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Upload gating for board scans: admin only, a permission record before
// anything is processed, and the same photo never processed twice. All
// upstreams are mocked; nothing is detected or sent to Pixian here.

const state = vi.hoisted(() => ({
  isAdmin: true,
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
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: state.isAdmin }, error: null }) }) }) }),
  }),
  countScansSince: async () => state.todayCount,
  findScanByHash: async () => state.existing,
  insertScan: async (row: Record<string, unknown>) => {
    state.inserted.push(row);
    return { id: "scan-1", ...row };
  },
  updateScan: async () => {},
  uploadObject: async (_b: string, path: string) => { state.uploads.push(path); },
}));
vi.mock("../services/boardScan/pipeline", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/boardScan/pipeline")>()),
  enqueue: (id: string) => { state.enqueued.push(id); },
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
    Object.assign(state, { isAdmin: true, existing: null, inserted: [], uploads: [], enqueued: [], todayCount: 0 });
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
