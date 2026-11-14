import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Confirming a contribution: everyone's photo goes to the review queue,
// admins' included; only an admin's explicit publishNow skips it. The raw
// original moves into the admin-only bucket alongside it. All upstreams are
// mocked.

const state = vi.hoisted(() => ({
  isAdmin: false,
  pinImageUrl: undefined as string | undefined,
  updatedPins: [] as string[],
  reviewed: [] as string[],
  uploadError: null as { message: string } | null,
  rawMoveError: null as { message: string } | null,
  moves: [] as Array<{ bucket: string; from: string; to: string }>,
  created: [] as Array<Record<string, unknown>>,
  profileReads: 0,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            state.profileReads += 1;
            return { data: { is_admin: state.isAdmin }, error: null };
          },
        }),
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        move: async (from: string, to: string) => {
          state.moves.push({ bucket, from, to });
          return { data: {}, error: bucket === "pin-contributed-raw" ? state.rawMoveError : null };
        },
        download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }),
        upload: async () => ({ data: {}, error: state.uploadError }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test.invalid/storage/v1/object/public/pin-catalogue/${path}` } }),
      }),
    },
  }),
}));

vi.mock("@workspace/pin-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/pin-repository")>()),
  createSupabasePinRepository: () => ({
    getPinByPinhuntId: async (id: string) => ({ id, pinhuntId: id, imageUrl: state.pinImageUrl }),
    updatePin: async (id: string) => { state.updatedPins.push(id); },
  }),
  createSupabaseUserRepository: () => ({
    hasPendingContributedImage: async () => false,
    createContributedImage: async (_userId: string, _pinId: string, input: Record<string, unknown>) => {
      state.created.push(input);
      return {
        id: "img-1", pinId: "pin-uuid", pinhuntId: "PHUK-00000001", storagePath: input.storagePath, status: "pending",
      };
    },
    markContributedImageReviewed: async (id: string) => {
      state.reviewed.push(id);
      return { id, status: "approved" };
    },
  }),
}));

vi.mock("../services/watermark", () => ({ watermarkPinPhoto: async (b: Buffer) => b }));

import app from "../app";

const confirm = (extra: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/pin-images/contribute")
    .set("Authorization", "Bearer test-token")
    .send({
      pinId: "PHUK-00000001", draftPath: "user-1/drafts/PHUK-00000001__abc.jpg", consentGranted: true, keepOriginalConsent: true, ...extra,
    });

describe("POST /api/pin-images/contribute", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://db.test.invalid");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    state.isAdmin = false;
    state.pinImageUrl = undefined;
    state.updatedPins = [];
    state.reviewed = [];
    state.uploadError = null;
    state.rawMoveError = null;
    state.moves = [];
    state.created = [];
    state.profileReads = 0;
  });

  it("sends an admin's own contribution to the review queue by default", async () => {
    state.isAdmin = true;
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(res.body.autoApproved).toBe(false);
    expect(state.updatedPins).toEqual([]);
    expect(state.reviewed).toEqual([]);
  });

  it("publishes an admin contribution immediately only when they ask to publish now", async () => {
    state.isAdmin = true;
    const res = await confirm({ publishNow: true });
    expect(res.status).toBe(200);
    expect(res.body.autoApproved).toBe(true);
    expect(state.updatedPins).toEqual(["PHUK-00000001"]);
    expect(state.reviewed).toEqual(["img-1"]);
  });

  it("ignores publishNow from a non-admin", async () => {
    const res = await confirm({ publishNow: true });
    expect(res.status).toBe(200);
    expect(res.body.autoApproved).toBe(false);
    expect(state.updatedPins).toEqual([]);
  });

  it("sends a non-admin contribution to the review queue without checking the profile", async () => {
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(res.body.autoApproved).toBe(false);
    expect(state.updatedPins).toEqual([]);
    expect(state.profileReads).toBe(0);
  });

  it("moves the raw original into the admin-only bucket and records its path", async () => {
    const res = await confirm();
    expect(res.status).toBe(200);
    const raw = state.moves.find((m) => m.bucket === "pin-contributed-raw");
    expect(raw?.from).toBe("user-1/drafts/PHUK-00000001__abc.jpg");
    expect(raw?.to).toMatch(/^user-1\/PHUK-00000001\/\d+\.jpg$/);
    expect(state.created[0].rawStoragePath).toBe(raw?.to);
  });

  it("doesn't keep a raw original for app builds that didn't tell the collector", async () => {
    const res = await confirm({ keepOriginalConsent: undefined });
    expect(res.status).toBe(200);
    expect(state.moves.some((m) => m.bucket === "pin-contributed-raw")).toBe(false);
    expect(state.created[0].rawStoragePath).toBeUndefined();
  });

  it("still queues the photo when the raw original can't be kept (079 not applied)", async () => {
    state.rawMoveError = { message: "Bucket not found" };
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(state.created[0].rawStoragePath).toBeUndefined();
    spy.mockRestore();
  });

  it("leaves an admin's publish-now pending when the pin has gained another photo", async () => {
    state.isAdmin = true;
    state.pinImageUrl = "https://cdn.test.invalid/storage/v1/object/public/pin-catalogue/pin-uuid/bulk-9.jpg";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await confirm({ publishNow: true });
    expect(res.status).toBe(200);
    expect(res.body.autoApproved).toBe(false);
    expect(state.updatedPins).toEqual([]);
    spy.mockRestore();
  });

  it("logs the pin and image IDs and leaves the row pending when publish-now fails", async () => {
    state.isAdmin = true;
    state.uploadError = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await confirm({ publishNow: true });
    expect(res.status).toBe(200);
    expect(res.body.autoApproved).toBe(false);
    expect(state.reviewed).toEqual([]);
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("PHUK-00000001");
    expect(logged).toContain("img-1");
    spy.mockRestore();
  });
});
