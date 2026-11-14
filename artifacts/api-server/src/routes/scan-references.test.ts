import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Maintainer rule: Pin & Pop images are admin-only and must NEVER be sent to
// OpenAI or any other AI service. The scan's photo comparison uses only
// PinHunt's own photos (pins.image_url); Pin & Pop pins have none, so they are
// ranked on text alone.
// All upstreams are mocked: no real Supabase, OpenAI or Vision traffic.
const create = vi.fn();
const lookups: string[][] = [];
const REF = "https://pinandpop.com/storage/ref-stitch.jpg";
const SIBLING_REF = "https://pinandpop.com/storage/ref-stitch-sibling.jpg";

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
  // Same-collection siblings: one with a PinHunt photo, one without.
  createSupabasePinRepository: () => ({
    searchPins: async () => [
      { id: "PHUK-00000004", title: "Stitch Hula", brand: "Disney", collection: "Lilo & Stitch", characters: [], imageUrl: "https://img.test/sibling.jpg" },
      { id: "PHUK-10000005", title: "Stitch Ukulele", brand: "Disney", collection: "Lilo & Stitch", characters: [], imageUrl: undefined },
    ],
  }),
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
  // Hands back a Pin & Pop image for every pin asked about, so any code path
  // that still consults it would leak a URL into the OpenAI request.
  pinAndPopReferenceImages: async (ids: string[]) => {
    lookups.push(ids);
    return new Map(ids.map((id) => [id, id === "PHUK-10000001" ? REF : SIBLING_REF]));
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

describe("scan photo comparison never uses Pin & Pop images", () => {
  it("sends no Pin & Pop URL in any OpenAI request, comparing PinHunt photos only", async () => {
    create
      .mockResolvedValueOnce(reply('{"characters":["Stitch"],"keywords":["stitch"]}'))
      .mockResolvedValueOnce(reply('[{"pinId":"PHUK-10000001","confidence":60,"reasoning":"Surf"},{"pinId":"PHUK-10000002","confidence":55,"reasoning":"Sleep"},{"pinId":"PHUK-00000003","confidence":50,"reasoning":"Classic"}]'))
      .mockResolvedValueOnce(reply('[{"pinId":"PHUK-00000003","confidence":80,"reasoning":"Matches the photo"}]'));
    const res = await scan();
    expect(res.status).toBe(200);

    // The comparison step ran.
    expect(create).toHaveBeenCalledTimes(3);

    // No OpenAI request, in any stage, carries a Pin & Pop URL.
    for (const [body] of create.mock.calls) {
      const sent = JSON.stringify(body);
      expect(sent).not.toContain("pinandpop.com");
      expect(sent).not.toContain(REF);
      expect(sent).not.toContain(SIBLING_REF);
    }

    // Pin & Pop reference images are not even looked up.
    expect(lookups).toEqual([]);

    // Only PinHunt photos are shown: the candidate's and the sibling's.
    const verify = create.mock.calls[2][0];
    const urls = (verify.messages[1].content as Array<{ type: string; image_url?: { url: string; detail: string } }>)
      .filter((c) => c.image_url?.detail === "low").map((c) => c.image_url!.url);
    expect(urls.sort()).toEqual(["https://img.test/public.jpg", "https://img.test/sibling.jpg"]);
    // Pin & Pop pins stay candidates, ranked on text alone.
    expect(verify.messages[0].content).toContain('PHUK-10000001 | "Stitch Surfing" | Lilo & Stitch | reference image: no image shown');
    // A sibling without a PinHunt photo is not pulled in.
    expect(verify.messages[0].content).not.toContain("PHUK-10000005");

    // The app never sees a Pin & Pop URL either.
    expect(JSON.stringify(res.body)).not.toContain("pinandpop.com");
  });
});
