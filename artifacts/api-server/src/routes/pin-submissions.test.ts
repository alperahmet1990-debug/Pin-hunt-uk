import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// All upstreams are mocked: no real Supabase or Pixian traffic.
const pixian = { configured: true, fail: false };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ data: null, error: null }),
        upload: async () => ({ data: {}, error: null }),
      }),
    },
  }),
}));
vi.mock("../services/pixian", () => ({
  pixianConfigured: () => pixian.configured,
  normalizePinPhoto: async (buf: Buffer) => {
    if (pixian.fail) throw new Error("upstream");
    return buf;
  },
}));
vi.mock("../services/watermark", () => ({ watermarkPinPhoto: async (buf: Buffer) => buf }));

import app from "../app";

const preview = () =>
  request(app)
    .post("/api/pin-submissions/preview")
    .set("Authorization", "Bearer test-token")
    .send({ frontImageBase64: "AAAA" });

// #300: the app says why a photo wasn't cleaned up.
describe("POST /api/pin-submissions/preview clean-up result", () => {
  beforeEach(() => {
    pixian.configured = true;
    pixian.fail = false;
  });

  it("cleaned: no reason given", async () => {
    const res = await preview();
    expect(res.status).toBe(200);
    expect(res.body.cleaned).toBe(true);
    expect(res.body.cleanupSkipped).toBeUndefined();
  });

  it('clean-up not set up on this server: "off"', async () => {
    pixian.configured = false;
    const res = await preview();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cleaned: false, cleanupSkipped: "off" });
  });

  it('clean-up tried and failed: "failed", photo still kept', async () => {
    pixian.fail = true;
    const res = await preview();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cleaned: false, cleanupSkipped: "failed" });
    expect(res.body.draftPath).toMatch(/^user-1\/drafts\//);
  });
});
