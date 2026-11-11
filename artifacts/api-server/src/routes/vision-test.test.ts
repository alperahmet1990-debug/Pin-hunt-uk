import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/vision-test: the Vision call has a deadline, and running out of
// it is a friendly 504 (#67). Supabase and Vision are mocked.

const vision = vi.hoisted(() => ({
  batchAnnotateImages: vi.fn(),
}));

vi.mock("@google-cloud/vision", () => ({
  ImageAnnotatorClient: class {
    batchAnnotateImages = vision.batchAnnotateImages;
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { is_app_creator: true }, error: null }) }) }),
    }),
  }),
}));

import visionTestRouter, { VISION_TEST_TIMEOUT_MS } from "./vision-test";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use("/api", visionTestRouter);

const post = () =>
  request(app)
    .post("/api/vision-test")
    .set("Authorization", "Bearer test-token")
    .send({ imageBase64: "AAAA" });

describe("POST /api/vision-test", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", JSON.stringify({
      project_id: "p", client_email: "e@example.com", private_key: "k",
    }));
    vision.batchAnnotateImages.mockReset();
  });

  it("still rejects a request without a token", async () => {
    const res = await request(app).post("/api/vision-test").send({ imageBase64: "AAAA" });
    expect(res.status).toBe(401);
    expect(vision.batchAnnotateImages).not.toHaveBeenCalled();
  });

  it("sets a deadline on the Vision call", async () => {
    vision.batchAnnotateImages.mockResolvedValue([{ responses: [{}] }]);
    const res = await post();
    expect(res.status).toBe(200);
    expect(vision.batchAnnotateImages).toHaveBeenCalledWith(expect.anything(), { timeout: VISION_TEST_TIMEOUT_MS });
  });

  it("answers 504 with a friendly message when Vision hangs past the deadline", async () => {
    // The client cancels a call at its deadline with gRPC DEADLINE_EXCEEDED (4).
    vision.batchAnnotateImages.mockImplementation((_req: unknown, opts: { timeout: number }) =>
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(Object.assign(new Error("4 DEADLINE_EXCEEDED: internal detail"), { code: 4 })),
          Math.min(opts.timeout, 10))));
    const res = await post();
    expect(res.status).toBe(504);
    expect(res.body.error).toMatch(/took too long/);
    expect(JSON.stringify(res.body)).not.toMatch(/internal detail/);
  });
});
