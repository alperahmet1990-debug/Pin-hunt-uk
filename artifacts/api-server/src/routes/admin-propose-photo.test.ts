import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// "Use this photo" after merging a submission into a pin with no photo
// (#395). All upstreams are mocked: no real Supabase traffic.

// ── POST /admin/submissions/:id/propose-photo ────────────────────────────────
const state = vi.hoisted(() => ({
  isAdmin: true,
  submission: null as Record<string, unknown> | null,
  uploads: [] as string[],
  created: [] as unknown[][],
  pinExists: true,
  pending: false,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "admin-1" } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: state.isAdmin }, error: null }) }) }),
    }),
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }),
        upload: async (path: string) => { state.uploads.push(path); return { data: {}, error: null }; },
      }),
    },
  }),
}));
vi.mock("@workspace/pin-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/pin-repository")>()),
  createSupabasePinRepository: () => ({
      getPinByPinhuntId: async (id: string) => (state.pinExists ? { id, pinhuntId: id } : null),
  }),
  createSupabaseUserRepository: () => ({
      getPinSubmission: async () => state.submission,
      hasPendingContributedImage: async () => state.pending,
      createContributedImage: async (...a: unknown[]) => { state.created.push(a); return { id: "img-1", status: "pending" }; },
  }),
}));

import app from "../app";

const propose = (body: Record<string, unknown> = { pinhuntId: "PHUK-00000001" }) =>
  request(app)
    .post("/api/admin/submissions/sub-1/propose-photo")
    .set("Authorization", "Bearer test-token")
    .send(body);

describe("POST /api/admin/submissions/:id/propose-photo (#395)", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    state.isAdmin = true;
    state.uploads = [];
    state.created = [];
    state.pinExists = true;
    state.pending = false;
    state.submission = {
      id: "sub-1", submittedBy: "user-1", frontImagePath: "user-1/sub-1/front.jpg",
      rightsConfirmedAt: "2026-10-18T10:00:00Z",
    };
  });

  it("copies the photo as a pending proposal credited to the submitter", async () => {
    const res = await propose();
    expect(res.status).toBe(200);
    expect(state.uploads[0]).toMatch(/^user-1\/PHUK-00000001\/\d+\.jpg$/);
    expect(state.created[0]).toEqual(["user-1", "PHUK-00000001", expect.objectContaining({ consentGranted: true, proposalReason: "missing" })]);
  });

  it("refuses when the submitter never confirmed the photo rights", async () => {
    state.submission = { ...state.submission, rightsConfirmedAt: undefined };
    const res = await propose();
    expect(res.status).toBe(409);
    expect(state.created).toHaveLength(0);
  });

  it("refuses an unknown pin before copying anything", async () => {
    state.pinExists = false;
    const res = await propose();
    expect(res.status).toBe(404);
    expect(state.uploads).toHaveLength(0);
  });

  it("refuses when the submitter already has a photo of this pin waiting", async () => {
    state.pending = true;
    const res = await propose();
    expect(res.status).toBe(409);
    expect(state.uploads).toHaveLength(0);
  });

  it("needs a pin to propose it for", async () => {
    expect((await propose({})).status).toBe(400);
  });

  it("is admin only", async () => {
    state.isAdmin = false;
    expect((await propose()).status).toBe(403);
  });
});
