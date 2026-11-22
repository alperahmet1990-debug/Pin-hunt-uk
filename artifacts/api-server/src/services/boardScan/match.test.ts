import { describe, expect, it, vi } from "vitest";
import type { CataloguePin, PinRepository } from "@workspace/pin-repository";

vi.mock("../scanReasoning", () => ({ withScanReasoning: (fn: (extra: object) => unknown) => fn({}) }));
// Reference pictures are downloaded by the server; here, any URL containing "broken" fails.
const fetched = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("./references", () => ({
  fetchReferenceImage: async (url: string) => {
    fetched.urls.push(url);
    return url.includes("broken") ? null : `data:image/jpeg;base64,${Buffer.from(url).toString("base64")}`;
  },
}));

import { matchCrop } from "./match";
import { emptyUsage } from "./detect";

// The reference comparison: every ranked candidate's picture is shown, and a
// candidate only counts as checked when its own picture was compared.

const ids = ["PHUK-1", "PHUK-2", "PHUK-3", "PHUK-4", "PHUK-5"];
const pins = ids.map((id) => ({ id, title: `Pin ${id}`, brand: "Disney", collection: "Toy Story", characters: [] }) as unknown as CataloguePin);
const repository = { searchPins: async () => pins } as unknown as PinRepository;
const ranking = JSON.stringify(ids.map((pinId, i) => ({ pinId, confidence: 90 - i * 10, reasoning: "ranked" })));
const reply = (content: string) => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });

function fakeOpenAI(verifyAnswer: string) {
  const create = vi.fn(async (req: { messages: Array<{ content: unknown }> }) =>
    String(req.messages[0].content).startsWith("You verify") ? reply(verifyAnswer) : reply(ranking));
  return { create, openai: { chat: { completions: { create } } } as never };
}
const imagesIn = (req: { messages: Array<{ content: unknown }> }) =>
  (req.messages[1].content as Array<{ type: string }>).filter((c) => c.type === "image_url").length;

describe("matchCrop reference comparison", () => {
  it("shows the pictures of all five ranked candidates, not just three", async () => {
    const { create, openai } = fakeOpenAI(ranking);
    const refs = Object.fromEntries(ids.map((id) => [id, `https://pinandpop.test/${id}.jpg`]));
    await matchCrop(Buffer.from("x"), { characters: ["Woody"], keywords: [], text: "" }, { openai, model: "m", repository, referenceImages: async () => refs }, emptyUsage());
    const verify = create.mock.calls.map(([r]) => r).find((r) => String(r.messages[0].content).startsWith("You verify"))!;
    // The user's photo plus five references.
    expect(imagesIn(verify)).toBe(6);
  });

  it("doesn't count a winner as checked when its own picture wasn't compared", async () => {
    // Only PHUK-1..3 have pictures; the comparison promotes unpictured PHUK-5.
    const promoted = JSON.stringify([{ pinId: "PHUK-5", confidence: 88, reasoning: "plausible, no picture" }, { pinId: "PHUK-1", confidence: 10, reasoning: "different" }]);
    const { openai } = fakeOpenAI(promoted);
    const refs = { "PHUK-1": "https://p/1.jpg", "PHUK-2": "https://p/2.jpg", "PHUK-3": "https://p/3.jpg" };
    const out = await matchCrop(Buffer.from("x"), { characters: ["Woody"], keywords: [], text: "" }, { openai, model: "m", repository, referenceImages: async () => refs }, emptyUsage());
    expect(out.candidates[0]).toMatchObject({ pinId: "PHUK-5", confidence: 60, verified: false });
    expect(out.candidates[1]).toMatchObject({ pinId: "PHUK-1", confidence: 10, verified: true });
  });

  it("counts a winner as checked when its picture confirmed it", async () => {
    const confirmed = JSON.stringify([{ pinId: "PHUK-2", confidence: 93, reasoning: "same design" }]);
    const { openai } = fakeOpenAI(confirmed);
    const refs = Object.fromEntries(ids.map((id) => [id, `https://p/${id}.jpg`]));
    const out = await matchCrop(Buffer.from("x"), { characters: ["Woody"], keywords: [], text: "" }, { openai, model: "m", repository, referenceImages: async () => refs }, emptyUsage());
    expect(out).toMatchObject({ status: "suggested" });
    expect(out.candidates[0]).toMatchObject({ pinId: "PHUK-2", confidence: 93, verified: true });
  });

  it("asks the comparison to check the pin's format before the artwork", async () => {
    const { create, openai } = fakeOpenAI(ranking);
    const refs = Object.fromEntries(ids.map((id) => [id, `https://p/${id}.jpg`]));
    await matchCrop(Buffer.from("x"), { characters: ["Rhino"], keywords: [], text: "" }, { openai, model: "m", repository, referenceImages: async () => refs }, emptyUsage());
    const verify = create.mock.calls.map(([r]) => r).find((r) => String(r.messages[0].content).startsWith("You verify"))!;
    expect(String(verify.messages[0].content)).toContain("FORMAT FIRST");
    expect(String(verify.messages[0].content)).toContain('"format_match"');
  });

  it("caps a same-art, different-format pin so it can't pass as a checked match", async () => {
    // The round Rhino booster (PHUK-1) has the same art but not the silver frame.
    const answer = JSON.stringify([
      { pinId: "PHUK-1", confidence: 98, reasoning: "same Rhino art", format_match: false },
      { pinId: "PHUK-2", confidence: 72, reasoning: "Rhino in a silver frame", format_match: true },
    ]);
    const { openai } = fakeOpenAI(answer);
    const refs = Object.fromEntries(ids.map((id) => [id, `https://p/${id}.jpg`]));
    const out = await matchCrop(Buffer.from("x"), { characters: ["Rhino"], keywords: [], text: "" }, { openai, model: "m", repository, referenceImages: async () => refs }, emptyUsage());
    expect(out.candidates[0]).toMatchObject({ pinId: "PHUK-2", confidence: 72, verified: true });
    expect(out.candidates[1]).toMatchObject({ pinId: "PHUK-1", confidence: 35 });
    expect(out.candidates[1].reasoning).toMatch(/^Different format from your pin\./);
  });

  it("shows not identified when every pictured candidate is a different format", async () => {
    const answer = JSON.stringify([{ pinId: "PHUK-1", confidence: 98, reasoning: "same art", format_match: false }]);
    const { openai } = fakeOpenAI(answer);
    const refs = { "PHUK-1": "https://p/1.jpg" };
    const out = await matchCrop(Buffer.from("x"), { characters: ["Rhino"], keywords: [], text: "" }, { openai, model: "m", repository, referenceImages: async () => refs }, emptyUsage());
    expect(out).toMatchObject({ status: "unmatched" });
    expect(out.candidates[0]).toMatchObject({ pinId: "PHUK-1", confidence: 35 });
  });

  it("downloads reference pictures itself and leaves out one that fails", async () => {
    const answer = JSON.stringify([{ pinId: "PHUK-2", confidence: 90, reasoning: "same", format_match: true }]);
    const { create, openai } = fakeOpenAI(answer);
    const refs = { "PHUK-1": "https://p/broken.jpg", "PHUK-2": "https://p/2.jpg" };
    const out = await matchCrop(Buffer.from("x"), { characters: ["Woody"], keywords: [], text: "" }, { openai, model: "m", repository, referenceImages: async () => refs }, emptyUsage());
    const verify = create.mock.calls.map(([r]) => r).find((r) => String(r.messages[0].content).startsWith("You verify"))!;
    const images = (verify.messages[1].content as Array<{ type: string; image_url?: { url: string; detail: string } }>).filter((c) => c.type === "image_url");
    expect(images).toHaveLength(2); // the photo plus the one reference that downloaded
    expect(images[1].image_url).toMatchObject({ detail: "high" });
    expect(images[1].image_url!.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(out.candidates.find((c) => c.pinId === "PHUK-2")).toMatchObject({ verified: true });
    expect(out.problem).toBeNull();
  });

  it("tells the reviewer why a match wasn't checked against a picture", async () => {
    const lookupFailed = await matchCrop(Buffer.from("x"), { characters: ["Woody"], keywords: [], text: "" },
      { openai: fakeOpenAI(ranking).openai, model: "m", repository, referenceImages: async () => { throw new Error("timeout"); } }, emptyUsage());
    expect(lookupFailed.problem).toMatch(/Couldn't look up reference pictures/);
    const noneDownloaded = await matchCrop(Buffer.from("x"), { characters: ["Woody"], keywords: [], text: "" },
      { openai: fakeOpenAI(ranking).openai, model: "m", repository, referenceImages: async () => ({ "PHUK-1": "https://p/broken.jpg" }) }, emptyUsage());
    expect(noneDownloaded.problem).toMatch(/couldn't be downloaded/);
    const noPictures = await matchCrop(Buffer.from("x"), { characters: ["Woody"], keywords: [], text: "" },
      { openai: fakeOpenAI(ranking).openai, model: "m", repository, referenceImages: async () => ({}) }, emptyUsage());
    expect(noPictures.problem).toMatch(/No reference pictures were found/);
  });

  it("orders suggestions after the caps, so a checked match beats a capped unchecked one", async () => {
    // The comparison scores unpictured PHUK-5 at 88 and pictured PHUK-1 at 80.
    const answer = JSON.stringify([{ pinId: "PHUK-5", confidence: 88, reasoning: "no picture" }, { pinId: "PHUK-1", confidence: 80, reasoning: "same design", format_match: true }]);
    const { openai } = fakeOpenAI(answer);
    const out = await matchCrop(Buffer.from("x"), { characters: ["Woody"], keywords: [], text: "" },
      { openai, model: "m", repository, referenceImages: async () => ({ "PHUK-1": "https://p/1.jpg" }) }, emptyUsage());
    expect(out.candidates[0]).toMatchObject({ pinId: "PHUK-1", confidence: 80, verified: true });
    expect(out.candidates[1]).toMatchObject({ pinId: "PHUK-5", confidence: 60, verified: false });
  });

  it("keeps up to five candidates for the reviewer", async () => {
    const { openai } = fakeOpenAI(ranking);
    const refs = Object.fromEntries(ids.map((id) => [id, `https://p/${id}.jpg`]));
    const out = await matchCrop(Buffer.from("x"), { characters: ["Woody"], keywords: [], text: "" }, { openai, model: "m", repository, referenceImages: async () => refs }, emptyUsage());
    expect(out.candidates).toHaveLength(5);
  });

  it("adds look-alikes from the picture index and always shows the closest to the picture check", async () => {
    // Text search can't single it out (titled like hundreds of others); the picture index can.
    const look = { id: "PHUK-LOOK", title: "Meeko", brand: "Disney", collection: "Tails of Friendship", characters: ["Meeko"] } as unknown as CataloguePin;
    const repo = { searchPins: async () => pins, getPinsByIds: async (want: string[]) => (want.includes("PHUK-LOOK") ? [look] : []) } as unknown as PinRepository;
    const verdict = JSON.stringify([{ pinId: "PHUK-LOOK", confidence: 95, reasoning: "same silver frame", format_match: true }, { pinId: "PHUK-1", confidence: 20, reasoning: "different" }]);
    const { create, openai } = fakeOpenAI(verdict);
    const refs = Object.fromEntries([...ids, "PHUK-LOOK"].map((id) => [id, `https://p/${id}.jpg`]));
    const out = await matchCrop(Buffer.from("x"), { characters: ["Meeko"], keywords: [], text: "" }, {
      openai, model: "m", repository: repo, referenceImages: async (want) => Object.fromEntries(want.map((id) => [id, refs[id]])),
      pictureSearch: async () => ["PHUK-LOOK", "PHUK-GONE"],
    }, emptyUsage());
    const [rank, verify] = create.mock.calls.map(([r]) => r);
    // Ranked first among the candidates, though the ranking (titles only) left it out.
    expect(String(rank.messages[0].content).indexOf("PHUK-LOOK")).toBeLessThan(String(rank.messages[0].content).indexOf("PHUK-1"));
    expect(String(verify.messages[0].content)).toMatch(/PHUK-LOOK \| "Meeko" .*YES \(shown below\)/);
    // The user's photo, the ranking's five and the look-alike: nothing dropped to make room.
    expect(imagesIn(verify)).toBe(7);
    expect(out.candidates[0]).toMatchObject({ pinId: "PHUK-LOOK", confidence: 95, verified: true, lookalike: true });
  });

  it("matches by text alone when the picture search fails", async () => {
    const { openai } = fakeOpenAI(ranking);
    const refs = Object.fromEntries(ids.map((id) => [id, `https://p/${id}.jpg`]));
    const out = await matchCrop(Buffer.from("x"), { characters: ["Woody"], keywords: [], text: "" }, {
      openai, model: "m", repository, referenceImages: async () => refs,
      pictureSearch: async () => { throw new Error("Vertex down"); },
    }, emptyUsage());
    expect(out.candidates[0]).toMatchObject({ pinId: "PHUK-1" });
    expect(out.candidates.some((c) => c.lookalike)).toBe(false);
  });

  it("shows the ranking's five and the three closest look-alikes: eight reference pictures by default, at most ten", async () => {
    const looks = ["PHUK-L1", "PHUK-L2", "PHUK-L3", "PHUK-L4"];
    const lookPins = looks.map((id) => ({ id, title: `Look ${id}`, brand: "Disney", collection: "Toy Story", characters: [] }) as unknown as CataloguePin);
    const repo = { searchPins: async () => pins, getPinsByIds: async () => lookPins } as unknown as PinRepository;
    const refs = Object.fromEntries([...ids, ...looks].map((id) => [id, `https://p/${id}.jpg`]));
    const verifyImages = async () => {
      const { create, openai } = fakeOpenAI(ranking);
      await matchCrop(Buffer.from("x"), { characters: ["Woody"], keywords: [], text: "" }, {
        openai, model: "m", repository: repo, referenceImages: async (want) => Object.fromEntries(want.map((id) => [id, refs[id]])),
        pictureSearch: async () => looks,
      }, emptyUsage());
      const verify = create.mock.calls.map(([r]) => r).find((r) => String(r.messages[0].content).startsWith("You verify"))!;
      return imagesIn(verify) - 1; // minus the user's photo
    };
    expect(await verifyImages()).toBe(8); // 5 ranked + 3 look-alikes (the 4th isn't compared)
    vi.stubEnv("BOARD_MAX_REFERENCES", "50");
    expect(await verifyImages()).toBe(8); // only 8 candidates to show; the cap (10) isn't the limit here
    vi.stubEnv("BOARD_MAX_REFERENCES", "3");
    expect(await verifyImages()).toBe(3);
    vi.unstubAllEnvs();
  });
});
