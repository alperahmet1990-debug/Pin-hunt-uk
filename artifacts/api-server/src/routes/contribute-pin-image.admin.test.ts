import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Confirming a contribution: admins publish straight away, everyone else
// goes to the review queue (#459). All upstreams are mocked.

const state = vi.hoisted(() => ({
  isAdmin: false,
  updatedPins: [] as string[],
  reviewed: [] as string[],
  uploadError: null as { message: string } | null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: state.isAdmin }, error: null }) }) }),
    }),
    storage: {
      from: () => ({
        move: async () => ({ data: {}, error: null }),
        download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }),
        upload: async () => ({ data: {}, error: state.uploadError }),
        getPublicUrl: () => ({ data: { publicUrl: "https://cdn.test.invalid/public.jpg" } }),
      }),
    },
  }),
}));

vi.mock("@workspace/pin-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/pin-repository")>()),
  createSupabasePinRepository: () => ({
    getPinByPinhuntId: async (id: string) => ({ id, pinhuntId: id }),
    updatePin: async (id: string) => { state.updatedPins.push(id); },
  }),
  createSupabaseUserRepository: () => ({
    hasPendingContributedImage: async () => false,
    createContributedImage: async () => ({
      id: "img-1", pinId: "pin-uuid", pinhuntId: "PHUK-00000001", storagePath: "user-1/PHUK-00000001/1.jpg", status: "pending",
    }),
    markContributedImageReviewed: async (id: string) => {
      state.reviewed.push(id);
      return { id, status: "approved" };
    },
  }),
}));

vi.mock("../services/watermark", () => ({ watermarkPinPhoto: async (b: Buffer) => b }));

import app from "../app";

const confirm = () =>
  request(app)
    .post("/api/pin-images/contribute")
    .set("Authorization", "Bearer test-token")
    .send({ pinId: "PHUK-00000001", draftPath: "user-1/drafts/PHUK-00000001__abc.jpg", consentGranted: true });

describe("POST /api/pin-images/contribute", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://db.test.invalid");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    state.isAdmin = false;
    state.updatedPins = [];
    state.reviewed = [];
    state.uploadError = null;
  });

  it("publishes an admin contribution immediately", async () => {
    state.isAdmin = true;
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(res.body.autoApproved).toBe(true);
    expect(state.updatedPins).toEqual(["PHUK-00000001"]);
    expect(state.reviewed).toEqual(["img-1"]);
  });

  it("sends a non-admin contribution to the review queue", async () => {
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(res.body.autoApproved).toBe(false);
    expect(state.updatedPins).toEqual([]);
  });

  it("logs the pin and image IDs and leaves the row pending when auto-publish fails", async () => {
    state.isAdmin = true;
    state.uploadError = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(res.body.autoApproved).toBe(false);
    expect(state.reviewed).toEqual([]);
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("PHUK-00000001");
    expect(logged).toContain("img-1");
    spy.mockRestore();
  });
});
