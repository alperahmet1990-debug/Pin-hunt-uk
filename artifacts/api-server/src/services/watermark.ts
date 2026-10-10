/**
 * "PinHunt" watermark for published catalogue photos.
 *
 * A staggered, diagonal "PinHunt" pattern tiled across the WHOLE image —
 * including over the pin itself — so it can't be cropped out the way a
 * corner mark can. Each word is drawn twice, a faint dark copy and a faint
 * light copy offset by a pixel or two (an emboss), so it reads on both the
 * white Pixian background and on dark or busy pin artwork while staying
 * subtle.
 *
 * Burned into the published file itself (not an in-app overlay), so a
 * scraped URL or a screenshot carries it. The clean original stays in the
 * private pin-contributed-images bucket, so photos can be re-published if
 * the design changes.
 *
 * Text is rendered from a bundled font (assets/fonts) — servers can't be
 * assumed to have fonts installed.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { type OverlayOptions } from "sharp";

// The server runs from the bundled dist/index.mjs (see build.mjs); the
// second candidate covers running this file from src/services (scripts/tsx).
const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_FILE = [
  path.resolve(here, "../assets/fonts/Inter_700Bold.ttf"),
  path.resolve(here, "../../assets/fonts/Inter_700Bold.ttf"),
].find((p) => existsSync(p));
if (!FONT_FILE) {
  throw new Error("Watermark font missing — expected artifacts/api-server/assets/fonts/Inter_700Bold.ttf");
}

const WORD = "PinHunt";
const DARK_ALPHA = "11%";
const LIGHT_ALPHA = "16%";
const ANGLE = -30;

async function renderWord(colour: string, alpha: string, fontPx: number): Promise<Buffer> {
  return sharp({
    text: {
      text: `<span foreground="${colour}" fgalpha="${alpha}">${WORD}</span>`,
      font: `Inter Bold ${fontPx}px`,
      fontfile: FONT_FILE,
      rgba: true,
    },
  })
    .png()
    .toBuffer();
}

/**
 * Build a transparent overlay the size of the image: words laid out in a
 * brick pattern on a canvas big enough to cover the image after rotation,
 * then rotated and centre-cropped — so no word is clipped at a seam.
 */
async function buildOverlay(width: number, height: number): Promise<Buffer> {
  const fontPx = Math.max(14, Math.round(Math.min(width, height) * 0.04));
  const offset = Math.max(1, Math.round(fontPx / 28));

  const [dark, light] = await Promise.all([
    renderWord("#000000", DARK_ALPHA, fontPx),
    renderWord("#FFFFFF", LIGHT_ALPHA, fontPx),
  ]);
  const { width: wordW = 0, height: wordH = 0 } = await sharp(dark).metadata();

  const side = Math.ceil(Math.hypot(width, height)) + wordW * 2;
  const stepX = Math.round(wordW * 2);
  const stepY = Math.round(wordH * 3.4);

  const layers: OverlayOptions[] = [];
  for (let row = 0, top = 0; top < side - wordH; row++, top += stepY) {
    // Alternate rows shift half a step for a brick pattern.
    for (let left = row % 2 ? Math.round(stepX / 2) : 0; left < side - wordW; left += stepX) {
      layers.push({ input: dark, left, top }, { input: light, left: left + offset, top: top + offset });
    }
  }

  const rotated = await sharp({
    create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png()
    .toBuffer()
    .then((flat) =>
      sharp(flat).rotate(ANGLE, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer({ resolveWithObject: true }),
    );

  const { width: rw, height: rh } = rotated.info;
  return sharp(rotated.data, { raw: { width: rw, height: rh, channels: 4 } })
    .extract({
      left: Math.floor((rw - width) / 2),
      top: Math.floor((rh - height) / 2),
      width,
      height,
    })
    .png()
    .toBuffer();
}

// Published photos are all Pixian's fixed 1200x1200, so this rarely grows
// past one entry — and it saves re-rendering text on every publish.
const overlayCache = new Map<string, Promise<Buffer>>();

/** Return a JPEG copy of `image` with the PinHunt watermark burned in. */
export async function watermarkPinPhoto(image: Buffer): Promise<Buffer> {
  const { width = 1200, height = 1200 } = await sharp(image).metadata();
  const key = `${width}x${height}`;
  let overlay = overlayCache.get(key);
  if (!overlay) {
    overlay = buildOverlay(width, height);
    overlayCache.set(key, overlay);
    overlay.catch(() => overlayCache.delete(key));
  }
  return sharp(image)
    .composite([{ input: await overlay, blend: "over" }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
