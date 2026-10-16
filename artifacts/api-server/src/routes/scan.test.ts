import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// All upstreams are mocked: no real Supabase, OpenAI or Vision traffic.
const create = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
  }),
}));
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  isAiConfigured: () => true,
  getOpenAIClient: () => ({ chat: { completions: { create } } }),
}));
vi.mock("@workspace/pin-repository", () => ({
  createSupabasePinRepository: () => ({ searchPins: async () => [] }),
}));
vi.mock("../services/google-vision", () => ({
  getVisionSignals: async () => null,
  visionSearchTerms: () => [],
}));

import app from "../app";

class APIConnectionTimeoutError extends Error {
  constructor() {
    super("Request timed out.");
    this.name = "APIConnectionTimeoutError";
  }
}

const scan = () =>
  request(app)
    .post("/api/scan/identify")
    .set("Authorization", "Bearer test-token")
    .send({ imageBase64: "AAAA" });

describe("POST /api/scan/identify upstream timeouts", () => {
  beforeEach(() => {
    create.mockReset();
    // The route keeps a per-user cooldown; make each test a fresh "second".
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + Math.floor(Math.random() * 1e9) + 1e6);
  });

  it("returns a friendly 504 when the OpenAI call times out", async () => {
    create.mockRejectedValue(new APIConnectionTimeoutError());
    const res = await scan();
    expect(res.status).toBe(504);
    expect(res.body.error).toMatch(/took too long/i);
  });

  it("keeps the generic 500 for other upstream failures", async () => {
    create.mockRejectedValue(new Error("boom"));
    const res = await scan();
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Vision analysis failed/);
  });
});

describe("POST /api/scan/identify timings (#349)", () => {
  beforeEach(() => {
    create.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + Math.floor(Math.random() * 1e9) + 1e6);
  });

  it("logs one line of per-stage durations, with no photo or user data", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    create.mockRejectedValue(new APIConnectionTimeoutError());
    await scan();
    const line = log.mock.calls.find((c) => c[0] === "[scan] timings:");
    expect(line).toBeTruthy();
    const timings = JSON.parse(String(line![1]));
    expect(timings).toMatchObject({ outcome: "timeout" });
    expect(typeof timings.auth).toBe("number");
    expect(typeof timings.total).toBe("number");
    expect(String(line![1])).not.toMatch(/AAAA|user-1/);
    log.mockRestore();
  });
});

