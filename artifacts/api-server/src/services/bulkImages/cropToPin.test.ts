import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { CataloguePin, PinRepository } from "@workspace/pin-repository";
import { focusBox, matchPhoto, FOCUS_MAX_AREA } from "./match";

// A pin photographed small on a table: matching uses the pin cut out of the
// full-size photo, not the whole frame (mostly background).

const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#a65" } }).jpeg().toBuffer();
const pin = (id: string) => ({ id, title: `Pin ${id}`, brand: "Disney", collection: "Brush of Magic Mystery Series 3", characters: ["Mr. Toad"], categories: [] } as unknown as CataloguePin);

function fakeOpenAI(responses: string[]) {
  const calls: Array<{ messages: Array<{ content: unknown }> }> = [];
  return {
    calls,
    client: { chat: { completions: { create: vi.fn(async (body: { messages: Array<{ content: unknown }> }) => {
      calls.push(body);
      return { choices: [{ message: { content: responses.shift() ?? "" } }] };
    }) } } } as never,
  };
}

const imageIn = async (call: { messages: Array<{ content: unknown }> }) => {
  const parts = call.messages[1].content as Array<{ type: string; image_url?: { url: string } }>;
  const url = parts.find((p) => p.image_url)!.image_url!.url;
  return sharp(Buffer.from(url.split(",")[1], "base64")).metadata();
};

describe("focusBox", () => {
  it("cuts out a pin that fills under half the frame, not a close-up", () => {
    expect(focusBox({ x: 0.3, y: 0.3, w: 0.3, h: 0.3 })).toEqual({ x: 0.3, y: 0.3, w: 0.3, h: 0.3 });
    expect(focusBox({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })).toBeNull();
    expect(FOCUS_MAX_AREA).toBe(0.5);
    expect(focusBox(undefined)).toBeNull();
    expect(focusBox({ x: 0.5, y: 0.5, w: 0.01, h: 0.3 })).toBeNull(); // implausible box
  });
});

describe("matchPhoto on a small pin", () => {
  const repo = { searchPins: vi.fn(async () => [pin("PHUK-10126137")]) } as unknown as PinRepository;

  it("ranks and searches by picture on the pin cut from the full-size photo", async () => {
    const original = await img(3000, 3000);
    const photo = await img(1280, 1280);
    const ai = fakeOpenAI([
      JSON.stringify({ characters: ["Mr. Toad"], keywords: ["paint brush"], text: "", box: [0.4, 0.35, 0.6, 0.6] }),
      JSON.stringify([{ pinId: "PHUK-10126137", confidence: 70, reasoning: "Mr. Toad painting" }]),
    ]);
    const searched: number[] = [];
    const pictureSearch = vi.fn(async (b: Buffer) => { searched.push((await sharp(b).metadata()).width!); return []; });
    const result = await matchPhoto(photo, { openai: ai.client, model: "m", repository: repo, original, pictureSearch });
    // Describe saw the whole photo; ranking and the picture search saw the pin:
    // 0.2 × 3000 = 600 px wide plus 10% margin each side ≈ 720 px, from the original.
    expect((await imageIn(ai.calls[0])).width).toBe(1280);
    const ranked = (await imageIn(ai.calls[1])).width!;
    expect(ranked).toBeGreaterThan(700);
    expect(ranked).toBeLessThan(740);
    expect(searched[0]).toBe(ranked);
    expect(result.description).toMatchObject({ matchedOnCrop: true, box: [0.4, 0.35, 0.6, 0.6] });
    expect(result.candidates[0].pinhuntId).toBe("PHUK-10126137");
  });

  it("matches a close-up as it is", async () => {
    const photo = await img(1280, 1280);
    const ai = fakeOpenAI([
      JSON.stringify({ characters: ["Mr. Toad"], keywords: [], text: "", box: [0.05, 0.05, 0.95, 0.95] }),
      JSON.stringify([{ pinId: "PHUK-10126137", confidence: 70, reasoning: "x" }]),
    ]);
    const result = await matchPhoto(photo, { openai: ai.client, model: "m", repository: repo, original: await img(3000, 3000) });
    expect((await imageIn(ai.calls[1])).width).toBe(1280);
    expect(result.description.matchedOnCrop).toBeUndefined();
  });
});
