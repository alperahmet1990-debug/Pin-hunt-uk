import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Early Contributor Programme (migration 047): photo-only submissions,
// rights confirmation, AI hints, caps and preview reuse. All upstreams
// are mocked: no real Supabase or Pixian traffic.
const state = vi.hoisted(() => ({
  created: [] as unknown[][],
  drafts: [] as Array<{ name: string }>,
  uploads: [] as string[],
  downloads: [] as string[],
  pixianCalls: 0,
  caps: { scan: true, photo_cleanup: true, submission: true } as Record<string, boolean>,
  usage: [] as Array<{ kind: string; sha: string | null }>,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    storage: {
      from: () => ({
        list: async () => ({ data: state.drafts, error: null }),
        remove: async () => ({ data: null, error: null }),
        upload: async (path: string) => { state.uploads.push(path); return { data: {}, error: null }; },
        move: async () => ({ data: {}, error: null }),
        download: async (path: string) => {
          state.downloads.push(path);
          return { data: new Blob([new Uint8Array([1, 2, 3])]), error: null };
        },
      }),
    },
  }),
}));
vi.mock("@workspace/pin-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/pin-repository")>()),
  createSupabaseUserRepository: () => ({
    createPinSubmissionFromPaths: async (...args: unknown[]) => {
      state.created.push(args);
      return { id: args[2], status: "submitted" };
    },
  }),
}));
vi.mock("../services/pixian", () => ({
  pixianConfigured: () => true,
  normalizePinPhoto: async (b: Buffer) => { state.pixianCalls++; return b; },
}));
vi.mock("../services/watermark", () => ({ watermarkPinPhoto: async (b: Buffer) => b }));
vi.mock("../services/usage-caps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/usage-caps")>()),
  withinDailyCap: async (_u: string, kind: string) => state.caps[kind],
  recordUsage: async (_u: string, kind: string, sha: string | null) => { state.usage.push({ kind, sha }); },
}));

import app from "../app";
import { imageHash } from "../services/usage-caps";
import { sanitizeAiIdentification } from "./pin-submissions";

const submit = (body: Record<string, unknown>) =>
  request(app)
    .post("/api/pin-submissions")
    .set("Authorization", "Bearer test-token")
    .send({ frontDraftPath: "user-1/drafts/1.jpg", ...body });

const preview = (frontImageBase64 = "AAAA") =>
  request(app)
    .post("/api/pin-submissions/preview")
    .set("Authorization", "Bearer test-token")
    .send({ frontImageBase64 });

const metadata = () => state.created[0][1] as Record<string, unknown>;

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  state.created = [];
  state.drafts = [];
  state.uploads = [];
  state.downloads = [];
  state.pixianCalls = 0;
  state.caps = { scan: true, photo_cleanup: true, submission: true };
  state.usage = [];
});

describe("POST /api/pin-submissions photo-only", () => {
  it("accepts just a photo with the rights confirmed", async () => {
    const res = await submit({ rightsConfirmed: true });
    expect(res.status).toBe(200);
    expect(metadata()).toMatchObject({ proposedName: undefined, brand: undefined, rightsConfirmed: true });
  });

  it("treats blank name and brand as not given", async () => {
    const res = await submit({ proposedName: "   ", brand: "", rightsConfirmed: true });
    expect(res.status).toBe(200);
    expect(metadata()).toMatchObject({ proposedName: undefined, brand: undefined });
  });

  it("requires the rights confirmation for a photo-only submission", async () => {
    const res = await submit({});
    expect(res.status).toBe(400);
    expect(state.created).toHaveLength(0);
  });

  it("refuses rightsConfirmed: false", async () => {
    const res = await submit({ proposedName: "Mickey", rightsConfirmed: false });
    expect(res.status).toBe(400);
  });

  it("still accepts older app builds that send a name and no rights field", async () => {
    const res = await submit({ proposedName: "Brush of Magic Mickey", brand: "Disney" });
    expect(res.status).toBe(200);
    expect(metadata()).toMatchObject({ proposedName: "Brush of Magic Mickey", brand: "Disney", rightsConfirmed: false });
  });

  it("refuses a non-string name", async () => {
    const res = await submit({ proposedName: { evil: true }, rightsConfirmed: true });
    expect(res.status).toBe(400);
  });

  it("stores AI hints, sanitized", async () => {
    const res = await submit({
      rightsConfirmed: true,
      aiIdentification: {
        matches: [{ pinId: "PHUK-00000001", confidence: 140 }, { confidence: 5 }, "junk"],
        suggested: { name: "  Stitch  ", characters: ["Stitch", 7], extra: "dropped" },
        evil: "dropped",
      },
    });
    expect(res.status).toBe(200);
    expect(metadata().aiIdentification).toEqual({
      matches: [{ pinId: "PHUK-00000001", confidence: 100 }],
      suggested: { name: "Stitch", characters: ["Stitch"] },
    });
  });

  it("returns 429 when today's submission cap is used up", async () => {
    state.caps.submission = false;
    const res = await submit({ rightsConfirmed: true });
    expect(res.status).toBe(429);
    expect(res.body.capReached).toBe(true);
    expect(state.created).toHaveLength(0);
  });
});

describe("sanitizeAiIdentification", () => {
  it("drops anything that isn't an object, and empty results", () => {
    expect(sanitizeAiIdentification(null)).toBeUndefined();
    expect(sanitizeAiIdentification([1, 2])).toBeUndefined();
    expect(sanitizeAiIdentification({ matches: [] })).toBeUndefined();
  });

  it("keeps at most 5 matches and 10 characters", () => {
    const out = sanitizeAiIdentification({
      matches: Array.from({ length: 9 }, (_, i) => ({ pinId: `P${i}`, confidence: 50 })),
      suggested: { characters: Array.from({ length: 20 }, (_, i) => `C${i}`) },
    });
    expect(out?.matches).toHaveLength(5);
    expect(out?.suggested?.characters).toHaveLength(10);
  });
});

describe("POST /api/pin-submissions/preview cost controls", () => {
  it("cleans a new photo once and names the draft after its hash", async () => {
    const res = await preview("AAAA");
    expect(res.status).toBe(200);
    expect(state.pixianCalls).toBe(1);
    expect(res.body.draftPath).toBe(`user-1/drafts/${imageHash("AAAA")}-clean.jpg`);
    expect(state.usage).toEqual([{ kind: "photo_cleanup", sha: imageHash("AAAA") }]);
  });

  it("reuses the cleaned draft for the same photo without calling Pixian", async () => {
    state.drafts = [{ name: `${imageHash("AAAA")}-clean.jpg` }];
    const res = await preview("AAAA");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cleaned: true, reused: true });
    expect(state.pixianCalls).toBe(0);
    expect(state.uploads).toHaveLength(0);
  });

  it("keeps the raw photo when the clean-up cap is used up", async () => {
    state.caps.photo_cleanup = false;
    const res = await preview("BBBB");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cleaned: false, cleanupSkipped: "limit" });
    expect(state.pixianCalls).toBe(0);
  });
});
