import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// App-scan PR 3: the picture index's look-alikes join the collector scan.
// All upstreams are mocked: no real Supabase, OpenAI, Vision or Vertex traffic.
const create = vi.fn();
const state = vi.hoisted(() => ({ indexOn: true, lookalikeIds: ["PHUK-10000009"] as string[], delayMs: 0, searched: 0 }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) } }),
}));
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  isAiConfigured: () => true,
  getOpenAIClient: () => ({ chat: { completions: { create } } }),
}));
const pin = (id: string, title: string) => ({ id, title, brand: "Disney", collection: "Lilo & Stitch", characters: ["Stitch"], imageUrl: null });
vi.mock("@workspace/pin-repository", () => ({
  createSupabasePinRepository: () => ({
    searchPins: async () => [],
    getPinsByIds: async (ids: string[]) => ids.map((id) => pin(id, id === "PHUK-10000009" ? "Stitch Hula (look-alike)" : id)),
  }),
}));
vi.mock("../services/scanCandidates", () => ({
  findCandidates: async () => [pin("PHUK-10000001", "Stitch Surfing"), pin("PHUK-10000002", "Stitch Sleeping")],
}));
vi.mock("../services/pictureIndex/vertex", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/pictureIndex/vertex")>()),
  pictureIndexConfigured: () => state.indexOn,
}));
vi.mock("../services/pictureIndex/search", () => ({
  lookalikePins: async () => {
    state.searched++;
    if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
    return state.lookalikeIds;
  },
}));
vi.mock("../services/boardScan/references", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/boardScan/references")>()),
  fetchReferenceImage: async (url: string) => `data:image/jpeg;base64,${Buffer.from(url).toString("base64")}`,
}));
vi.mock("../services/scanReferenceImages", () => ({
  pinAndPopReferenceImages: async (ids: string[]) => new Map(ids.map((id) => [id, `https://pinandpop.com/ref/${id}.jpg`])),
}));
vi.mock("../services/google-vision", () => ({ getVisionSignals: async () => null, visionSearchTerms: () => [] }));
vi.mock("../services/usage-caps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/usage-caps")>()),
  cachedResult: async () => null,
  withinDailyCap: async () => true,
  recordUsage: async () => {},
}));

import app from "../app";
import { withTimeout } from "./scan";

const reply = (content: string) => ({ choices: [{ message: { content } }] });
const scan = () => request(app).post("/api/scan/identify").set("Authorization", "Bearer test-token").send({ imageBase64: "AAAA" });

beforeEach(() => {
  create.mockReset();
  Object.assign(state, { indexOn: true, lookalikeIds: ["PHUK-10000009"], delayMs: 0, searched: 0 });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + Math.floor(Math.random() * 1e9) + 1e6);
});

describe("look-alikes in the collector scan", () => {
  it("adds the picture index's look-alikes to the search and the picture check, and they can win", async () => {
    create
      .mockResolvedValueOnce(reply('{"characters":["Stitch"],"keywords":["hula"],"text":""}'))
      .mockResolvedValueOnce(reply('[{"pinId":"PHUK-10000001","confidence":60,"reasoning":"Surf"},{"pinId":"PHUK-10000002","confidence":55,"reasoning":"Sleep"}]'))
      .mockResolvedValueOnce(reply('[{"pinId":"PHUK-10000009","confidence":91,"reasoning":"Same hula pose","format_match":true},{"pinId":"PHUK-10000001","confidence":20,"reasoning":"No"}]'));
    const res = await scan();
    expect(res.status).toBe(200);
    expect(state.searched).toBe(1);
    // The ranking saw the look-alike in its catalogue list.
    expect(String(create.mock.calls[1][0].messages[0].content)).toContain("PHUK-10000009");
    // The picture check was shown its reference.
    expect(String(create.mock.calls[2][0].messages[0].content)).toContain("PHUK-10000009");
    expect(res.body.matches[0]).toMatchObject({ pinId: "PHUK-10000009", verified: true });
    expect(res.body.status).toBe("suggested");
    // Pin & Pop links still never reach the app.
    expect(JSON.stringify(res.body)).not.toContain("pinandpop.com");
  });

  it("does nothing different when the picture index is off", async () => {
    state.indexOn = false;
    create
      .mockResolvedValueOnce(reply('{"characters":["Stitch"],"keywords":[],"text":""}'))
      .mockResolvedValueOnce(reply('[{"pinId":"PHUK-10000001","confidence":60,"reasoning":"Surf"}]'))
      .mockResolvedValueOnce(reply('[{"pinId":"PHUK-10000001","confidence":80,"reasoning":"ok"}]'));
    const res = await scan();
    expect(res.status).toBe(200);
    expect(state.searched).toBe(0);
    expect(String(create.mock.calls[1][0].messages[0].content)).not.toContain("PHUK-10000009");
  });
});

describe("withTimeout", () => {
  it("returns the value in time, or null when it's too slow", async () => {
    vi.useRealTimers();
    expect(await withTimeout(Promise.resolve(7), 50)).toBe(7);
    expect(await withTimeout(new Promise((r) => setTimeout(() => r(7), 200)), 20)).toBeNull();
  });
});
