import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Pin & Pop pins have no public photo; the scan's photo comparison may use
// their admin reference image, which must never reach the app.
// All upstreams are mocked: no real Supabase, OpenAI or Vision traffic.
const create = vi.fn();
const lookups: string[][] = [];
const REF = "https://pinandpop.com/storage/ref-stitch.jpg";

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
vi.mock("../services/scanCandidates", () => ({
  findCandidates: async () => [
    { id: "PHUK-10000001", title: "Stitch Surfing", brand: "Disney", collection: "Lilo & Stitch", characters: [], imageUrl: null },
    { id: "PHUK-10000002", title: "Stitch Sleeping", brand: "Disney", collection: "Lilo & Stitch", characters: [], imageUrl: null },
    { id: "PHUK-00000003", title: "Stitch Classic", brand: "Disney", collection: "Lilo & Stitch", characters: [], imageUrl: "https://img.test/public.jpg" },
  ],
}));
vi.mock("../services/scanReferenceImages", () => ({
  pinAndPopReferenceImages: async (ids: string[]) => {
    lookups.push(ids);
    return new Map(ids.includes("PHUK-10000001") ? [["PHUK-10000001", REF]] : []);
  },
}));
vi.mock("../services/usage-caps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/usage-caps")>()),
  cachedResult: async () => null,
  withinDailyCap: async () => true,
  recordUsage: async () => {},
}));

import app from "../app";

const reply = (content: string) => ({ choices: [{ message: { content } }] });
const scan = () =>
  request(app).post("/api/scan/identify").set("Authorization", "Bearer test-token").send({ imageBase64: "AAAA" });

beforeEach(() => {
  create.mockReset();
  lookups.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + Math.floor(Math.random() * 1e9) + 1e6);
});

describe("scan photo comparison with Pin & Pop reference images", () => {
  it("compares against the reference image but never returns it", async () => {
    create
      .mockResolvedValueOnce(reply('{"characters":["Stitch"],"keywords":["stitch"]}'))
      .mockResolvedValueOnce(reply('[{"pinId":"PHUK-10000001","confidence":60,"reasoning":"Surf"},{"pinId":"PHUK-10000002","confidence":55,"reasoning":"Sleep"},{"pinId":"PHUK-00000003","confidence":50,"reasoning":"Classic"}]'))
      .mockResolvedValueOnce(reply('[{"pinId":"PHUK-10000001","confidence":92,"reasoning":"Matches the reference"}]'));
    const res = await scan();
    expect(res.status).toBe(200);
    expect(res.body.matches[0].pinId).toBe("PHUK-10000001");

    // Only pins without a public photo are looked up.
    expect(lookups).toEqual([["PHUK-10000001", "PHUK-10000002"]]);

    // The comparison prompt shows the reference image and the public photo.
    const verify = create.mock.calls[2][0];
    const urls = (verify.messages[1].content as Array<{ type: string; image_url?: { url: string; detail: string } }>)
      .filter((c) => c.image_url?.detail === "low").map((c) => c.image_url!.url);
    expect(urls).toEqual([REF, "https://img.test/public.jpg"]);
    expect(verify.messages[0].content).toContain('PHUK-10000002 | "Stitch Sleeping" | Lilo & Stitch | reference image: no image shown');

    // The app never sees the reference URL.
    expect(JSON.stringify(res.body)).not.toContain("pinandpop.com");
  });
});
