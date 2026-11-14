import request from "supertest";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Photo contribution: checks that run before the paid Pixian clean-up (#472).
// All upstreams are mocked: no real Supabase, Pixian or storage traffic.

const state = vi.hoisted(() => ({
  pins: new Set<string>(["PHUK-00000001"]),
  pending: false,
  capOk: true,
  /** Cleaned drafts (pin-contributed-images), by path. */
  drafts: new Map<string, Buffer>(),
  /** Raw originals (pin-contributed-raw, admin-only), by path. */
  raw: new Map<string, Buffer>(),
  pixianCalls: 0,
  pixianError: null as Error | null,
  createError: null as Error | null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: false }, error: null }) }) }),
    }),
    storage: {
      from: (bucket: string) => {
        const files = bucket === "pin-contributed-raw" ? state.raw : state.drafts;
        return {
        list: async (dir: string) => ({
          data: [...files.keys()].filter((p) => p.startsWith(`${dir}/`)).map((p) => ({ name: p.slice(dir.length + 1) })),
          error: null,
        }),
        remove: async (paths: string[]) => { paths.forEach((p) => files.delete(p)); return { data: [], error: null }; },
        download: async (path: string) => {
          const bytes = files.get(path);
          return bytes ? { data: new Blob([new Uint8Array(bytes)]), error: null } : { data: null, error: { message: "not found" } };
        },
        upload: async (path: string, buf: Buffer) => { files.set(path, Buffer.from(buf)); return { data: {}, error: null }; },
        move: async () => ({ data: {}, error: null }),
        };
      },
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
    createContributedImage: async () => {
      if (state.createError) throw state.createError;
      return { id: "img-1", status: "pending" };
    },
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
import { sniffPhotoFormat } from "./contribute-pin-image";

// Real JPEGs: the raw original is re-encoded, so it must decode. PHOTO
// carries EXIF with a GPS position, like a phone photo would.
let PHOTO = "";
let OTHER_PHOTO = "";
beforeAll(async () => {
  const make = (bg: string) => sharp({ create: { width: 40, height: 30, channels: 3, background: bg } }).jpeg();
  PHOTO = (await make("#88aacc")
    .withExif({ IFD0: { Make: "TestCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" } })
    .toBuffer()).toString("base64");
  OTHER_PHOTO = (await make("#cc8844").toBuffer()).toString("base64");
});

const preview = (body: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/pin-images/contribute/preview")
    .set("Authorization", "Bearer test-token")
    .send({ pinId: "PHUK-00000001", imageBase64: PHOTO, consentGranted: true, keepOriginalNoticeShown: true, ...body });

describe("POST /api/pin-images/contribute/preview", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    state.pending = false;
    state.capOk = true;
    state.drafts = new Map();
    state.raw = new Map();
    state.pixianCalls = 0;
    state.pixianError = null;
    state.createError = null;
  });

  it("cleans the photo and returns a draft named after its hash", async () => {
    const res = await preview();
    expect(res.status).toBe(200);
    expect(res.body.draftPath).toMatch(/^user-1\/drafts\/PHUK-00000001__[0-9a-f]{64}\.jpg$/);
    expect(state.pixianCalls).toBe(1);
  });

  it("keeps the photo as taken in the admin-only raw bucket, and never returns it", async () => {
    const res = await preview();
    expect(res.status).toBe(200);
    const raw = state.raw.get(res.body.draftPath)!;
    const meta = await sharp(raw).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 40, 30]);
    expect(state.drafts.get(res.body.draftPath)).toEqual(Buffer.from([9, 9, 9]));
    expect(Object.keys(res.body).sort()).toEqual(["draftPath", "previewBase64"]);
    expect(JSON.stringify(res.body)).not.toContain("pin-contributed-raw");
  });

  it("keeps no raw original for app builds that didn't tell the collector (no keepOriginalNoticeShown)", async () => {
    const res = await preview({ keepOriginalNoticeShown: undefined });
    expect(res.status).toBe(200);
    expect(state.drafts.size).toBe(1);
    expect(state.raw.size).toBe(0);
  });

  it("keeps a PNG photo's raw original (re-encoded as JPEG)", async () => {
    const png = (await sharp({ create: { width: 20, height: 20, channels: 3, background: "#123456" } }).png().toBuffer()).toString("base64");
    const res = await preview({ imageBase64: png });
    expect(res.status).toBe(200);
    expect((await sharp(state.raw.get(res.body.draftPath)!).metadata()).format).toBe("jpeg");
  });

  it("doesn't keep a raw original that isn't a photo format (SVG), but the preview still works", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>').toString("base64");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await preview({ imageBase64: svg });
    expect(res.status).toBe(200);
    expect(state.raw.size).toBe(0);
    expect(spy.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("not a photo signature");
    spy.mockRestore();
  });

  it("strips EXIF (GPS location, device) from the raw original before storing it", async () => {
    expect((await sharp(Buffer.from(PHOTO, "base64")).metadata()).exif).toBeDefined();
    const res = await preview();
    const meta = await sharp(state.raw.get(res.body.draftPath)!).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
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
    await preview({ imageBase64: OTHER_PHOTO });
    expect(state.pixianCalls).toBe(2);
    expect(state.drafts.size).toBe(1);
    expect(state.raw.size).toBe(1);
  });

  it("says so when Pixian times out, and stores nothing", async () => {
    state.pixianError = new PixianTimeoutError();
    const res = await preview();
    expect(res.status).toBe(504);
    expect(state.drafts.size).toBe(0);
    expect(state.raw.size).toBe(0);
  });

  it("still refuses a second photo while one is waiting for review", async () => {
    state.pending = true;
    const res = await preview();
    expect(res.status).toBe(409);
    expect(state.pixianCalls).toBe(0);
  });
});

describe("POST /api/pin-images/contribute (no preview, older builds)", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://db.test.invalid");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    state.pending = false;
    state.capOk = true;
    state.drafts = new Map();
    state.raw = new Map();
    state.pixianCalls = 0;
    state.pixianError = null;
    state.createError = null;
  });

  const confirmWithoutPreview = () =>
    request(app)
      .post("/api/pin-images/contribute")
      .set("Authorization", "Bearer test-token")
      .send({ pinId: "PHUK-00000001", imageBase64: PHOTO, consentGranted: true, keepOriginalNoticeShown: true });

  it("keeps the raw original when the contribution is recorded", async () => {
    const res = await confirmWithoutPreview();
    expect(res.status).toBe(200);
    expect(state.raw.size).toBe(1);
  });

  it("removes the raw original again if recording the contribution fails", async () => {
    state.createError = new Error('insert failed: relation "pin_images" column raw_storage_path');
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await confirmWithoutPreview();
    expect(res.status).toBe(500);
    expect(state.raw.size).toBe(0);
    // The app gets a plain message; the database text stays in the server log.
    expect(res.body.error).toBe("Something went wrong with your photo. Please try again.");
    expect(JSON.stringify(res.body)).not.toContain("pin_images");
    spy.mockRestore();
  });
});

describe("sniffPhotoFormat (signature bytes, before sharp)", () => {
  const bytes = (...b: number[]) => Buffer.from(b);
  const ascii = (str: string) => Buffer.from(str, "latin1");

  it("recognises JPEG, PNG, WebP and HEIF photos", async () => {
    expect(sniffPhotoFormat(Buffer.from(PHOTO, "base64"))).toBe("jpeg");
    expect(sniffPhotoFormat(await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).png().toBuffer())).toBe("png");
    expect(sniffPhotoFormat(await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).webp().toBuffer())).toBe("webp");
    expect(sniffPhotoFormat(Buffer.concat([bytes(0, 0, 0, 0x18), ascii("ftypheic"), Buffer.alloc(8)]))).toBe("heif");
    expect(sniffPhotoFormat(Buffer.concat([bytes(0, 0, 0, 0x18), ascii("ftypmif1"), Buffer.alloc(8)]))).toBe("heif");
  });

  it("refuses everything else", async () => {
    expect(sniffPhotoFormat(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffPhotoFormat(ascii("<?xml version=\"1.0\"?><svg/>"))).toBeNull();
    expect(sniffPhotoFormat(await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).tiff().toBuffer())).toBeNull();
    expect(sniffPhotoFormat(await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).gif().toBuffer())).toBeNull();
    expect(sniffPhotoFormat(ascii("%PDF-1.7"))).toBeNull();
    expect(sniffPhotoFormat(Buffer.concat([bytes(0, 0, 0, 0x18), ascii("ftypmp42"), Buffer.alloc(8)]))).toBeNull(); // MP4 video
    expect(sniffPhotoFormat(bytes(0xff, 0xd8))).toBeNull(); // too short
  });
});

