import { describe, expect, it, vi } from "vitest";
import type { CataloguePin, PinRepository } from "@workspace/pin-repository";

vi.mock("../scanReasoning", () => ({ withScanReasoning: (fn: (extra: object) => unknown) => fn({}) }));

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
});
