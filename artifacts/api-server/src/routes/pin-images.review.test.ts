import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Admin photo review: the raw original is only reachable through the
// admin-gated queue and is deleted once the photo is approved or rejected;
// approving follows the replace rule and is safe to re-run. All upstreams
// are mocked.

const PUBLIC_BASE = "https://cdn.test.invalid/storage/v1/object/public/pin-catalogue/";

const state = vi.hoisted(() => ({
  isAdmin: true,
  pinImageUrl: undefined as string | undefined,
  image: null as Record<string, unknown> | null,
  pending: [] as Array<Record<string, unknown>>,
  rawUrlCalls: [] as string[],
  updatedPins: [] as Array<{ id: string; imageUrl: string }>,
  reviewed: [] as string[],
  rawRemoved: [] as Array<{ bucket: string; paths: string[] }>,
  rawCleared: [] as string[],
  rawRemoveError: null as { message: string } | null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "admin-1" } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: state.isAdmin }, error: null }) }) }),
      update: (values: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          if (values.raw_storage_path === null) state.rawCleared.push(id);
          return { error: null };
        },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          if (!state.rawRemoveError) state.rawRemoved.push({ bucket, paths });
          return { data: [], error: state.rawRemoveError };
        },
        download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }),
        upload: async () => ({ data: {}, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test.invalid/storage/v1/object/public/pin-catalogue/${path}` } }),
      }),
    },
  }),
}));

vi.mock("@workspace/pin-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/pin-repository")>()),
  createSupabasePinRepository: () => ({
    getPinByPinhuntId: async (id: string) => ({ id, pinhuntId: id, imageUrl: state.pinImageUrl }),
    updatePin: async (id: string, input: { imageUrl: string }) => {
      state.updatedPins.push({ id, imageUrl: input.imageUrl });
      state.pinImageUrl = input.imageUrl;
    },
  }),
  createSupabaseUserRepository: () => ({
    getPendingContributedImages: async () => state.pending,
    getPinAndPopReferences: async () => ({ "pin-uuid": { externalId: "123", imageUrl: "https://pinandpop.test.invalid/123.jpg" } }),
    getContributedImageUrl: async (path: string) => `https://signed.test.invalid/cleaned/${path}`,
    getContributedRawImageUrl: async (path: string) => {
      state.rawUrlCalls.push(path);
      return `https://signed.test.invalid/raw/${path}`;
    },
    getContributedImage: async () => state.image,
    markContributedImageReviewed: async (id: string, _by: string, input: { action: string }) => {
      state.reviewed.push(id);
      return { ...state.image, status: input.action === "approve" ? "approved" : "rejected" };
    },
  }),
}));

vi.mock("../services/watermark", () => ({ watermarkPinPhoto: async (b: Buffer) => b }));

import app from "../app";

const pendingImage = (extra: Record<string, unknown> = {}) => ({
  id: "img-1",
  pinId: "pin-uuid",
  pinhuntId: "PHUK-00000001",
  uploadedBy: "user-1",
  storagePath: "user-1/PHUK-00000001/1.jpg",
  status: "pending",
  ...extra,
});

const approve = (body: Record<string, unknown> = {}) =>
  request(app).post("/api/admin/pin-images/img-1/approve").set("Authorization", "Bearer t").send(body);

describe("admin photo review", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://db.test.invalid");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    state.isAdmin = true;
    state.pinImageUrl = undefined;
    state.image = pendingImage();
    state.pending = [
      pendingImage({ rawStoragePath: "user-1/PHUK-00000001/1.jpg" }),
      pendingImage({ id: "img-2" }),
    ];
    state.rawUrlCalls = [];
    state.updatedPins = [];
    state.reviewed = [];
    state.rawRemoved = [];
    state.rawCleared = [];
    state.rawRemoveError = null;
  });

  describe("GET /api/admin/pending-pin-images", () => {
    it("refuses a signed-in collector, without signing any raw URL", async () => {
      state.isAdmin = false;
      const res = await request(app).get("/api/admin/pending-pin-images").set("Authorization", "Bearer t");
      expect(res.status).toBe(403);
      expect(state.rawUrlCalls).toEqual([]);
    });

    it("refuses an anonymous caller", async () => {
      const res = await request(app).get("/api/admin/pending-pin-images");
      expect(res.status).toBe(401);
      expect(state.rawUrlCalls).toEqual([]);
    });

    it("gives an admin raw, cleaned and Pin & Pop images side by side", async () => {
      const res = await request(app).get("/api/admin/pending-pin-images").set("Authorization", "Bearer t");
      expect(res.status).toBe(200);
      const [withRaw, withoutRaw] = res.body.images;
      expect(withRaw.rawSignedUrl).toBe("https://signed.test.invalid/raw/user-1/PHUK-00000001/1.jpg");
      expect(withRaw.signedUrl).toBe("https://signed.test.invalid/cleaned/user-1/PHUK-00000001/1.jpg");
      expect(withRaw.pinAndPop.imageUrl).toBe("https://pinandpop.test.invalid/123.jpg");
      // Rows from before migration 080 have no raw original.
      expect(withoutRaw.rawSignedUrl).toBeNull();
    });
  });

  describe("POST /api/admin/pin-images/:id/approve", () => {
    it("refuses a non-admin", async () => {
      state.isAdmin = false;
      const res = await approve();
      expect(res.status).toBe(403);
      expect(state.updatedPins).toEqual([]);
    });

    it("publishes the cleaned photo to a pin with no photo", async () => {
      const res = await approve();
      expect(res.status).toBe(200);
      expect(state.updatedPins).toEqual([{ id: "PHUK-00000001", imageUrl: `${PUBLIC_BASE}pin-uuid/contributed-img-1.jpg` }]);
      expect(state.reviewed).toEqual(["img-1"]);
    });

    it("stops with 409 when a missing-photo pin has gained another photo since", async () => {
      state.pinImageUrl = `${PUBLIC_BASE}pin-uuid/bulk-9.jpg`;
      const res = await approve();
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("has_image");
      expect(res.body.existingImageUrl).toBe(`${PUBLIC_BASE}pin-uuid/bulk-9.jpg`);
      expect(state.updatedPins).toEqual([]);
      expect(state.reviewed).toEqual([]);
    });

    it("replaces that photo once the admin confirms", async () => {
      state.pinImageUrl = `${PUBLIC_BASE}pin-uuid/bulk-9.jpg`;
      const res = await approve({ replaceExisting: true });
      expect(res.status).toBe(200);
      expect(res.body.image.replacedImageUrl).toBe(`${PUBLIC_BASE}pin-uuid/bulk-9.jpg`);
      expect(state.updatedPins).toHaveLength(1);
    });

    it("keeps the old behaviour for admin builds that don't send seenImageUrl", async () => {
      state.image = pendingImage({ proposalReason: "poor_quality" });
      state.pinImageUrl = `${PUBLIC_BASE}pin-uuid/old.jpg`;
      const res = await approve();
      expect(res.status).toBe(200);
      expect(state.updatedPins).toHaveLength(1);
    });

    it.each(["rejected", "approved"])("refuses to approve a row that is already %s", async (status) => {
      state.image = pendingImage({ status });
      const res = await approve({ replaceExisting: true });
      expect(res.status).toBe(400);
      expect(state.updatedPins).toEqual([]);
      expect(state.reviewed).toEqual([]);
    });

    it("replaces the photo the reviewer saw for a replacement proposal", async () => {
      state.image = pendingImage({ proposalReason: "poor_quality" });
      state.pinImageUrl = `${PUBLIC_BASE}pin-uuid/old.jpg`;
      const res = await approve({ seenImageUrl: `${PUBLIC_BASE}pin-uuid/old.jpg` });
      expect(res.status).toBe(200);
      expect(res.body.image.replacedImageUrl).toBe(`${PUBLIC_BASE}pin-uuid/old.jpg`);
    });

    it("stops with 409 when a replacement proposal's pin changed photo after the reviewer loaded the card", async () => {
      state.image = pendingImage({ proposalReason: "wrong_pin" });
      state.pinImageUrl = `${PUBLIC_BASE}pin-uuid/newer.jpg`;
      const res = await approve({ seenImageUrl: `${PUBLIC_BASE}pin-uuid/old.jpg` });
      expect(res.status).toBe(409);
      expect(res.body.existingImageUrl).toBe(`${PUBLIC_BASE}pin-uuid/newer.jpg`);
      expect(state.updatedPins).toEqual([]);
      expect(state.reviewed).toEqual([]);
    });

    it("stops with 409 when the reviewer saw no photo but the pin has one now", async () => {
      state.image = pendingImage({ proposalReason: "other" });
      state.pinImageUrl = `${PUBLIC_BASE}pin-uuid/newer.jpg`;
      const res = await approve({ seenImageUrl: null });
      expect(res.status).toBe(409);
      expect(state.updatedPins).toEqual([]);
    });

    it("replaces whatever is there once the admin confirms (Replace and approve)", async () => {
      state.image = pendingImage({ proposalReason: "wrong_pin" });
      state.pinImageUrl = `${PUBLIC_BASE}pin-uuid/newer.jpg`;
      const res = await approve({ seenImageUrl: `${PUBLIC_BASE}pin-uuid/old.jpg`, replaceExisting: true });
      expect(res.status).toBe(200);
      expect(res.body.image.replacedImageUrl).toBe(`${PUBLIC_BASE}pin-uuid/newer.jpg`);
    });

    it("is safe to re-run after a partial failure that already set the pin's photo", async () => {
      state.pinImageUrl = `${PUBLIC_BASE}pin-uuid/contributed-img-1.jpg`;
      const res = await approve();
      expect(res.status).toBe(200);
      expect(res.body.image.replacedImageUrl).toBeNull();
      expect(state.reviewed).toEqual(["img-1"]);
    });
  });

  describe("raw original retention (deleted once reviewed)", () => {
    const RAW = "user-1/PHUK-00000001/1.jpg";
    const reject = () =>
      request(app).post("/api/admin/pin-images/img-1/reject").set("Authorization", "Bearer t").send({});

    it("deletes the raw original and clears its path when the photo is approved", async () => {
      state.image = pendingImage({ rawStoragePath: RAW });
      const res = await approve();
      expect(res.status).toBe(200);
      expect(state.rawRemoved).toEqual([{ bucket: "pin-contributed-raw", paths: [RAW] }]);
      expect(state.rawCleared).toEqual(["img-1"]);
    });

    it("deletes the raw original and clears its path when the photo is rejected", async () => {
      state.image = pendingImage({ rawStoragePath: RAW });
      const res = await reject();
      expect(res.status).toBe(200);
      expect(state.reviewed).toEqual(["img-1"]);
      expect(state.rawRemoved).toEqual([{ bucket: "pin-contributed-raw", paths: [RAW] }]);
      expect(state.rawCleared).toEqual(["img-1"]);
    });

    it("keeps the raw original when the publish is blocked, so the admin can still compare", async () => {
      state.image = pendingImage({ rawStoragePath: RAW });
      state.pinImageUrl = `${PUBLIC_BASE}pin-uuid/bulk-9.jpg`;
      const res = await approve();
      expect(res.status).toBe(409);
      expect(state.rawRemoved).toEqual([]);
      expect(state.rawCleared).toEqual([]);
    });

    it("still approves and rejects when deleting the raw original fails", async () => {
      state.rawRemoveError = { message: "storage down" };
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      state.image = pendingImage({ rawStoragePath: RAW });
      expect((await approve()).status).toBe(200);
      state.image = pendingImage({ rawStoragePath: RAW });
      expect((await reject()).status).toBe(200);
      expect(state.reviewed).toEqual(["img-1", "img-1"]);
      expect(state.rawCleared).toEqual([]);
      expect(spy.mock.calls.map((c) => String(c[0])).join("\n")).toContain("img-1");
      spy.mockRestore();
    });

    it("never signs or deletes a raw path outside the uploader's own folder", async () => {
      const foreign = "user-2/PHUK-00000009/1.jpg";
      state.pending = [pendingImage({ rawStoragePath: foreign }), pendingImage({ id: "img-2", rawStoragePath: "user-1/../user-2/x.jpg" })];
      const list = await request(app).get("/api/admin/pending-pin-images").set("Authorization", "Bearer t");
      expect(list.body.images.map((i: { rawSignedUrl: string | null }) => i.rawSignedUrl)).toEqual([null, null]);
      expect(state.rawUrlCalls).toEqual([]);

      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      state.image = pendingImage({ rawStoragePath: foreign });
      expect((await reject()).status).toBe(200);
      expect(state.rawRemoved).toEqual([]);
      expect(state.rawCleared).toEqual([]);
      spy.mockRestore();
    });

    it("does nothing for a row without a raw original", async () => {
      expect((await approve()).status).toBe(200);
      expect(state.rawRemoved).toEqual([]);
      expect(state.rawCleared).toEqual([]);
    });
  });
});
