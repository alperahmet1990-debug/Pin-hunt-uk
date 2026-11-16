import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { estimateTilt, rotatePinPhoto, straightenPinPhoto } from "./straighten";

// Synthetic "cleaned" photos: a pin shape on white, as Pixian returns them.
async function photo(shape: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#fff"/>${shape}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}
// A card-shaped pin with a white middle (like white enamel), tilted by `deg` (SVG: positive = clockwise).
const card = (deg: number) =>
  photo(`<g transform="rotate(${deg} 300 300)"><rect x="190" y="130" width="220" height="340" rx="10" fill="#c9a227"/><rect x="215" y="160" width="170" height="250" fill="#fff"/></g>`);

describe("straighten", () => {
  it("measures the tilt of a straight-sided pin, whichever way it leans", async () => {
    for (const deg of [-12, -4, 7, 18]) {
      const t = await estimateTilt(await card(deg));
      expect(t.reason).toBe("straightened");
      // Rotating by t.degrees undoes the lean.
      expect(t.degrees).toBeCloseTo(-deg, 0);
    }
  });

  it("leaves a straight pin alone", async () => {
    expect((await estimateTilt(await card(0))).reason).toBe("already_straight");
  });

  it("leaves round and star-shaped pins alone", async () => {
    const circle = await photo(`<circle cx="300" cy="300" r="180" fill="#c33"/>`);
    const star = await photo(`<polygon points="300,90 350,240 510,240 380,330 430,490 300,390 170,490 220,330 90,240 250,240" fill="#e8a33c"/>`);
    for (const img of [circle, star]) {
      const t = await estimateTilt(img);
      expect(t.reason).toBe("not_straight_sided");
      expect((await straightenPinPhoto(img)).image).toBe(img);
    }
  });

  it("returns a straightened, square photo of the same size", async () => {
    const out = await straightenPinPhoto(await card(10));
    expect(out.tilt.reason).toBe("straightened");
    const meta = await sharp(out.image).metadata();
    expect([meta.width, meta.height]).toEqual([600, 600]);
    expect((await estimateTilt(out.image)).reason).toBe("already_straight");
  });

  it("can turn a photo by hand", async () => {
    const turned = await rotatePinPhoto(await card(0), 8);
    expect((await estimateTilt(turned)).degrees).toBeCloseTo(-8, 0);
  });
});
