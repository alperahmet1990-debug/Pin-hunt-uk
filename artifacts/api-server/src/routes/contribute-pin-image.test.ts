import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Photo contribution: checks that run before the paid Pixian clean-up (#472).
// All upstreams are mocked: no real Supabase, Pixian or storage traffic.

const state = vi.hoisted(() => ({
  pins: new Set<string>(["PHUK-00000001"]),
  pending: false,
  capOk: true,
  drafts: new Map<string, Buffer>(),
  pixianCalls: 0,
  pixianError: null as Error | null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: false }, error: null }) }) }),
    }),
    storage: {
      from: () => ({
        list: async (dir: string) => ({
          data: [...state.drafts.keys()].filter((p) => p.startsWith(`${dir}/`)).map((p) => ({ name: p.slice(dir.length + 1) })),
          error: null,
        }),
        remove: async (paths: string[]) => { paths.forEach((p) => state.drafts.delete(p)); return { data: [], error: null }; },
        download: async (path: string) => {
          const bytes = state.drafts.get(path);
          return bytes ? { data: new Blob([new Uint8Array(bytes)]), error: null } : { data: null, error: { message: "not found" } };
        },
        upload: async (path: string, buf: Buffer) => { state.drafts.set(path, Buffer.from(buf)); return { data: {}, error: null }; },
        move: async () => ({ data: {}, error: null }),
      }),
    },
  }),
}));

vi.mock("@workspace/pin-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/pin-repository")>()),
  createSupabasePinRepository: () => ({
    getPinByPinhuntId: async (id: string) => (state.pins.has(id) ? { id, pinhuntId: id } : null),
  }),
  createSupabaseUserRepository: () => ({
    hasPendingContributedImage: async () => state.pending,
    createContributedImage: async () => ({ id: "img-1", status: "pending" }),
  }),
}));

vi.mock("../services/pixian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/pixian")>()),
  pixianConfigured: () => true,
  normalizePinPhoto: async () => {
    state.pixianCalls++;
    if (state.pixianError) throw state.pixianError;
    return Buffer.from([9, 9, 9]);
  },
}));

vi.mock("../services/usage-caps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/usage-caps")>()),
  withinDailyCap: async () => state.capOk,
  recordUsage: async () => {},
}));

vi.mock("../services/watermark", () => ({ watermarkPinPhoto: async (b: Buffer) => b }));

import app from "../app";
import { PixianTimeoutError } from "../services/pixian";

const preview = (body: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/pin-images/contribute/preview")
    .set("Authorization", "Bearer test-token")
    .send({ pinId: "PHUK-00000001", imageBase64: "AAAA", consentGranted: true, ...body });

describe("POST /api/pin-images/contribute/preview", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    state.pending = false;
    state.capOk = true;
    state.drafts = new Map();
    state.pixianCalls = 0;
    state.pixianError = null;
  });

  it("cleans the photo and returns a draft named after its hash", async () => {
    const res = await preview();
    expect(res.status).toBe(200);
    expect(res.body.draftPath).toMatch(/^user-1\/drafts\/PHUK-00000001__[0-9a-f]{64}\.jpg$/);
    expect(state.pixianCalls).toBe(1);
  });

  it("refuses an unknown pin without calling Pixian", async () => {
    const res = await preview({ pinId: "PHUK-99999999" });
    expect(res.status).toBe(404);
    expect(state.pixianCalls).toBe(0);
  });

  it("refuses once the daily clean-up limit is used, without calling Pixian", async () => {
    state.capOk = false;
    const res = await preview();
    expect(res.status).toBe(429);
    expect(state.pixianCalls).toBe(0);
  });

  it("reuses the cleaned draft when the same photo is previewed again", async () => {
    const first = await preview();
    const second = await preview();
    expect(second.status).toBe(200);
    expect(second.body.draftPath).toBe(first.body.draftPath);
    expect(state.pixianCalls).toBe(1);
  });

  it("keeps only the latest draft when a different photo is previewed", async () => {
    await preview();
    await preview({ imageBase64: "BBBB" });
    expect(state.pixianCalls).toBe(2);
    expect(state.drafts.size).toBe(1);
  });

  it("says so when Pixian times out, and stores nothing", async () => {
    state.pixianError = new PixianTimeoutError();
    const res = await preview();
    expect(res.status).toBe(504);
    expect(state.drafts.size).toBe(0);
  });

  it("still refuses a second photo while one is waiting for review", async () => {
    state.pending = true;
    const res = await preview();
    expect(res.status).toBe(409);
    expect(state.pixianCalls).toBe(0);
  });
});
