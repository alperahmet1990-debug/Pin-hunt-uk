import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCAN_BUDGET_MS, VERIFY_MIN_MS } from "../services/scanBudget";

// One time budget per scan, so it answers before the app stops waiting.
// All upstreams are mocked: no real Supabase, OpenAI or Vision traffic.
const create = vi.fn();
const clock = vi.hoisted(() => ({ left: 30_000 }));

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
const PINS = [
  { id: "PHUK-1", title: "Woody and Rex", brand: "Disney", collection: "Toy Story", characters: ["Woody"], imageUrl: "https://img.test/1.jpg" },
  { id: "PHUK-2", title: "Slinky", brand: "Disney", collection: "Toy Story", characters: ["Slinky"], imageUrl: "https://img.test/2.jpg" },
];
vi.mock("../services/scanCandidates", () => ({ findCandidates: async () => PINS }));
vi.mock("../services/usage-caps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/usage-caps")>()),
  cachedResult: async () => null,
  withinDailyCap: async () => true,
  recordUsage: async () => {},
}));
// The route's budget reads a clock the test moves forward.
vi.mock("../services/scanBudget", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/scanBudget")>();
  return { ...real, createScanBudget: () => real.createScanBudget(clock.left, () => 30_000 - clock.left) };
});

import app from "../app";

class APIConnectionTimeoutError extends Error {
  constructor() { super("Request timed out."); this.name = "APIConnectionTimeoutError"; }
}

const reply = (content: string) => ({ choices: [{ message: { content } }] });
const describeOk = reply('{"characters":["Woody"],"keywords":["toy story"]}');
const rankOk = reply('[{"pinId":"PHUK-1","confidence":70,"reasoning":"Woody"},{"pinId":"PHUK-2","confidence":40,"reasoning":"Slinky"}]');
const verifyOk = reply('[{"pinId":"PHUK-2","confidence":90,"reasoning":"Photo matches"},{"pinId":"PHUK-1","confidence":20,"reasoning":"No"}]');

/** Each AI call "takes" ms off the budget before answering. */
function step(ms: number, result: unknown) {
  return async () => {
    clock.left -= ms;
    if (result instanceof Error) throw result;
    return result;
  };
}

const scan = () =>
  request(app).post("/api/scan/identify").set("Authorization", "Bearer test-token").send({ imageBase64: "AAAA" });

const timingsLine = (log: ReturnType<typeof vi.spyOn>) =>
  JSON.parse(String(log.mock.calls.find((c: unknown[]) => c[0] === "[scan] timings:")![1]));

beforeEach(() => {
  create.mockReset();
  clock.left = 30_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + Math.floor(Math.random() * 1e9) + 1e6);
});

describe("scan budget", () => {
  it("fits inside the app's 35 s wait", () => {
    expect(SCAN_BUDGET_MS).toBeLessThanOrEqual(30_000);
  });

  it("hands out what's left, minus a reserve, capped per step", async () => {
    const { createScanBudget } = await vi.importActual<typeof import("../services/scanBudget")>("../services/scanBudget");
    let t = 0;
    const b = createScanBudget(30_000, () => t);
    expect(b.timeoutFor(12_000, 8_000)).toBe(12_000);
    t = 25_000;
    expect(b.remaining()).toBe(5_000);
    expect(b.timeoutFor(99_999)).toBe(4_000);
    t = 40_000;
    expect(b.timeoutFor(99_999)).toBe(0);
  });
});

describe("POST /api/scan/identify within the budget", () => {
  it("every AI call gets a timeout from the budget and no retries", async () => {
    create
      .mockImplementationOnce(step(4_000, describeOk))
      .mockImplementationOnce(step(6_000, rankOk))
      .mockImplementationOnce(step(5_000, verifyOk));
    const res = await scan();
    expect(res.status).toBe(200);
    expect(res.body.matches[0].pinId).toBe("PHUK-2"); // the photo comparison re-ranked
    const opts = create.mock.calls.map((c) => c[1]);
    expect(opts).toHaveLength(3);
    for (const o of opts) {
      expect(o.maxRetries).toBe(0);
      expect(o.timeout).toBeGreaterThan(0);
      expect(o.timeout).toBeLessThan(30_000);
    }
    // Each call asks the model to think briefly (scanReasoning.ts).
    for (const c of create.mock.calls) expect(c[0].reasoning_effort).toBe("low");
    // Describing leaves time for ranking.
    expect(opts[0].timeout).toBeLessThanOrEqual(12_000);
    // Later steps only get what's left.
    expect(opts[2].timeout).toBeLessThanOrEqual(30_000 - 4_000 - 6_000);
  });

  it("skips the photo comparison when there isn't time, and still answers", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    create
      .mockImplementationOnce(step(11_000, describeOk))
      .mockImplementationOnce(step(30_000 - 11_000 - (VERIFY_MIN_MS - 1_000), rankOk));
    const res = await scan();
    expect(res.status).toBe(200);
    expect(res.body.matches.map((m: { pinId: string }) => m.pinId)).toEqual(["PHUK-1", "PHUK-2"]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(timingsLine(log)).toMatchObject({ outcome: "ok", skipped: ["verify"] });
    log.mockRestore();
  });

  it("a timed-out description doesn't end the scan", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    create
      .mockImplementationOnce(step(12_000, new APIConnectionTimeoutError()))
      .mockImplementationOnce(step(5_000, rankOk))
      .mockImplementationOnce(step(4_000, verifyOk));
    const res = await scan();
    expect(res.status).toBe(200);
    expect(res.body.matches[0].pinId).toBe("PHUK-2");
    expect(timingsLine(log)).toMatchObject({ outcome: "ok", skipped: ["describe"] });
    log.mockRestore();
  });

  it("a timed-out photo comparison keeps the ranking", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    create
      .mockImplementationOnce(step(3_000, describeOk))
      .mockImplementationOnce(step(5_000, rankOk))
      .mockImplementationOnce(step(20_000, new APIConnectionTimeoutError()));
    const res = await scan();
    expect(res.status).toBe(200);
    expect(res.body.matches[0].pinId).toBe("PHUK-1");
    expect(timingsLine(log)).toMatchObject({ outcome: "ok", skipped: ["verify"] });
    log.mockRestore();
  });

  it("a timed-out ranking is still a friendly 504", async () => {
    create
      .mockImplementationOnce(step(4_000, describeOk))
      .mockImplementationOnce(step(25_000, new APIConnectionTimeoutError()));
    const res = await scan();
    expect(res.status).toBe(504);
    expect(res.body.error).toMatch(/took too long/i);
  });

  it("skips the photo comparison when the ranking is already clear", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    create
      .mockImplementationOnce(step(3_000, describeOk))
      .mockImplementationOnce(step(4_000, reply('[{"pinId":"PHUK-1","confidence":94,"reasoning":"Clear"},{"pinId":"PHUK-2","confidence":30,"reasoning":"No"}]')));
    const res = await scan();
    expect(res.status).toBe(200);
    expect(res.body.matches[0].pinId).toBe("PHUK-1");
    expect(create).toHaveBeenCalledTimes(2);
    expect(timingsLine(log)).toMatchObject({ outcome: "ok", skipped: ["verify:confident"] });
    log.mockRestore();
  });

  it("skips the photo comparison when nothing is plausible", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    create
      .mockImplementationOnce(step(3_000, describeOk))
      .mockImplementationOnce(step(4_000, reply('[{"pinId":"PHUK-1","confidence":18,"reasoning":"Weak"},{"pinId":"PHUK-2","confidence":10,"reasoning":"Weak"}]')));
    const res = await scan();
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
    expect(timingsLine(log)).toMatchObject({ outcome: "ok", skipped: ["verify:implausible"] });
    log.mockRestore();
  });

  it("shows at most 3 catalogue photos when comparing", async () => {
    create
      .mockImplementationOnce(step(3_000, describeOk))
      .mockImplementationOnce(step(4_000, rankOk))
      .mockImplementationOnce(step(4_000, verifyOk));
    await scan();
    const verifyBody = create.mock.calls[2][0];
    const content = verifyBody.messages[1].content as Array<{ type: string; image_url?: { detail: string } }>;
    const references = content.filter((c) => c.type === "image_url" && c.image_url?.detail === "low");
    expect(references.length).toBeLessThanOrEqual(3);
  });
});

