import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Repeat-photo reuse and the daily cap on /scan/identify (migration 047).
// All upstreams are mocked: no real Supabase, OpenAI or Vision traffic.
const create = vi.fn();
const usage = vi.hoisted(() => ({
  cached: null as unknown,
  allowed: true,
  recorded: [] as Array<{ kind: string; result?: unknown }>,
}));

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
vi.mock("../services/usage-caps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/usage-caps")>()),
  cachedResult: async () => usage.cached,
  withinDailyCap: async () => usage.allowed,
  recordUsage: async (_u: string, kind: string, _sha: string | null, result?: unknown) => {
    usage.recorded.push({ kind, result });
  },
}));

import app from "../app";

const scan = () =>
  request(app)
    .post("/api/scan/identify")
    .set("Authorization", "Bearer test-token")
    .send({ imageBase64: "AAAA" });

describe("POST /api/scan/identify usage controls", () => {
  beforeEach(() => {
    create.mockReset();
    usage.cached = null;
    usage.allowed = true;
    usage.recorded = [];
    // The route keeps a per-user cooldown; make each test a fresh "second".
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + Math.floor(Math.random() * 1e9) + 1e6);
  });

  it("answers an identical photo from the earlier result without AI calls", async () => {
    usage.cached = { matches: [{ pinId: "PHUK-00000001", confidence: 90 }], imageInsights: null };
    const res = await scan();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cached: true, matches: [{ pinId: "PHUK-00000001" }] });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses with a friendly 429 once the daily cap is used up", async () => {
    usage.allowed = false;
    const res = await scan();
    expect(res.status).toBe(429);
    expect(res.body.capReached).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it("counts a failed scan, since the upstream call was still made", async () => {
    create.mockRejectedValue(new Error("boom"));
    const res = await scan();
    expect(res.status).toBe(500);
    expect(usage.recorded).toEqual([{ kind: "scan", result: undefined }]);
  });
});
