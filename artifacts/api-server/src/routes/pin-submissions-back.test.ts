import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// #257: optional back photo on "Suggest a missing pin". All upstreams are
// mocked: no real Supabase or Pixian traffic.
const storage = vi.hoisted(() => ({
  uploads: [] as Array<{ path: string; bytes: number }>,
  removed: [] as string[][],
  moveFails: false,
  backUploadFails: false,
}));
const created = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        remove: async (paths: string[]) => { storage.removed.push(paths); return { data: null, error: null }; },
        upload: async (path: string, buf: Buffer) => {
          if (storage.backUploadFails && path.endsWith("/back.jpg")) return { data: null, error: { message: "nope" } };
          storage.uploads.push({ path, bytes: buf.length });
          return { data: {}, error: null };
        },
        move: async () => (storage.moveFails ? { data: null, error: { message: "gone" } } : { data: {}, error: null }),
      }),
    },
  }),
}));
vi.mock("@workspace/pin-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/pin-repository")>()),
  createSupabaseUserRepository: () => ({
    createPinSubmissionFromPaths: async (...args: unknown[]) => {
      created.calls.push(args);
      return { id: args[2], status: "submitted" };
    },
  }),
}));
vi.mock("../services/pixian", () => ({ pixianConfigured: () => false, normalizePinPhoto: async (b: Buffer) => b }));
vi.mock("../services/watermark", () => ({ watermarkPinPhoto: async (b: Buffer) => b }));

import app from "../app";

const submit = (body: Record<string, unknown>) =>
  request(app)
    .post("/api/pin-submissions")
    .set("Authorization", "Bearer test-token")
    .send({ proposedName: "Brush of Magic Mickey", brand: "Disney", frontDraftPath: "user-1/drafts/1.jpg", ...body });

describe("POST /api/pin-submissions with a back photo (#257)", () => {
  beforeEach(() => {
    // The route needs a service key to build its repository; the repository itself is mocked.
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    storage.uploads = [];
    storage.removed = [];
    storage.moveFails = false;
    storage.backUploadFails = false;
    created.calls = [];
  });

  it("without a back photo works exactly as before", async () => {
    const res = await submit({});
    expect(res.status).toBe(200);
    expect(storage.uploads).toEqual([]);
    expect(created.calls[0][4]).toBeNull();
  });

  it("stores the back as taken, next to the front, and records its path", async () => {
    const back = Buffer.from("back-bytes").toString("base64");
    const res = await submit({ backImageBase64: back });
    expect(res.status).toBe(200);
    const id = created.calls[0][2] as string;
    expect(storage.uploads).toEqual([{ path: `user-1/${id}/back.jpg`, bytes: "back-bytes".length }]);
    expect(created.calls[0][3]).toBe(`user-1/${id}/front.jpg`);
    expect(created.calls[0][4]).toBe(`user-1/${id}/back.jpg`);
  });

  it("refuses a back photo that is too large", async () => {
    const res = await submit({ backImageBase64: "A".repeat(8_000_001) });
    expect(res.status).toBe(413);
    expect(created.calls).toEqual([]);
  });

  it("refuses a back photo that isn't a string", async () => {
    const res = await submit({ backImageBase64: { evil: true } });
    expect(res.status).toBe(400);
    expect(storage.uploads).toEqual([]);
  });

  it("fails cleanly when the back can't be stored", async () => {
    storage.backUploadFails = true;
    const res = await submit({ backImageBase64: "AAAA" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/back photo/);
    expect(created.calls).toEqual([]);
  });

  it("removes the stored back if the front then fails", async () => {
    storage.moveFails = true;
    const res = await submit({ backImageBase64: "AAAA" });
    expect(res.status).toBe(410);
    expect(storage.removed).toEqual([[expect.stringMatching(/^user-1\/.+\/back\.jpg$/)]]);
    expect(created.calls).toEqual([]);
  });

  it("removes the stored back if the preview isn't the caller's", async () => {
    const res = await submit({ backImageBase64: "AAAA", frontDraftPath: "someone-else/drafts/1.jpg" });
    expect(res.status).toBe(400);
    expect(storage.removed).toHaveLength(1);
  });
});
