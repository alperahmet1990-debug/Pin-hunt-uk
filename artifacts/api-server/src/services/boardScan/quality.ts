/**
 * Board scanning — cropping and image-quality checks (no AI, no network).
 *
 * A pin can be identified from a crop that is far too poor to publish as a
 * catalogue photo, so every crop gets a suitability verdict before anything
 * is sent to Pixian: resolution, blur, glare, and whether the whole pin is
 * visible (cut off at the photo edge, or overlapped by another pin as
 * reported by detection). Nothing here tries to repair a crop — obscured
 * parts of a pin are never reconstructed.
 *
 * Thresholds are starting values to calibrate against real board photos
 * (scripts/BOARD-SCANNING.md); each can be overridden by env var.
 */
import { createHash } from "node:crypto";
import sharp from "sharp";

/** A box as fractions (0–1) of the board photo's width/height. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface QualityReport {
  /** Crop size in pixels of the stored board photo. */
  widthPx: number;
  heightPx: number;
  /** Variance of the Laplacian at a fixed 400px scale — higher is sharper. */
  sharpness: number;
  /** Fraction (0–1) of near-white, blown-out pixels in the crop's centre. */
  glare: number;
  /** Box touches the edge of the board photo, so the pin may be cut off. */
  touchesEdge: boolean;
  /** Detection said another pin (or object) covers part of this one. */
  occluded: boolean;
  /** Detection said part of the pin is outside the photo or hidden. */
  partial: boolean;
  /** 0–100, used to pick the best of several crops of the same pin. */
  score: number;
  /** Suitable to clean up and offer as a catalogue photo. */
  suitable: boolean;
  /** Why it isn't suitable (empty when suitable). */
  reasons: QualityReason[];
}

export type QualityReason = "low_resolution" | "blurry" | "glare" | "cut_off" | "occluded";

function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** Current thresholds (read per call so tests and calibration can change them). */
export function qualityThresholds() {
  return {
    /** Shorter crop side below this is too small for a 1200px catalogue photo. */
    minSidePx: envNumber("BOARD_MIN_CROP_SIDE_PX", 280),
    /** Laplacian variance below this reads as blurred. */
    minSharpness: envNumber("BOARD_MIN_SHARPNESS", 40),
    /** More than this fraction of blown-out pixels reads as glare. */
    maxGlare: envNumber("BOARD_MAX_GLARE", 0.08),
  };
}

/** Normalise, clamp and pad a box; returns pixel bounds within the image. */
export function boxToPixels(box: Box, width: number, height: number, padFrac = 0) {
  const padX = box.w * padFrac;
  const padY = box.h * padFrac;
  const x0 = Math.max(0, Math.floor((box.x - padX) * width));
  const y0 = Math.max(0, Math.floor((box.y - padY) * height));
  const x1 = Math.min(width, Math.ceil((box.x + box.w + padX) * width));
  const y1 = Math.min(height, Math.ceil((box.y + box.h + padY) * height));
  return { left: x0, top: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

/** True when the (unpadded) box is within ~0.5% of any edge of the photo. */
export function touchesEdge(box: Box, margin = 0.005): boolean {
  return box.x <= margin || box.y <= margin || box.x + box.w >= 1 - margin || box.y + box.h >= 1 - margin;
}

/** Cut one pin out of the (already auto-oriented) board photo as a JPEG. */
export async function cropBox(board: Buffer, width: number, height: number, box: Box, padFrac = 0.06): Promise<Buffer> {
  const region = boxToPixels(box, width, height, padFrac);
  return sharp(board).extract(region).jpeg({ quality: 92 }).toBuffer();
}

/** Variance of a 4-neighbour Laplacian over a greyscale image. */
export function laplacianVariance(grey: Uint8Array | Buffer, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = grey[i - 1] + grey[i + 1] + grey[i - width] + grey[i + width] - 4 * grey[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Fraction of blown-out pixels (≥ 250) in the central 70% of the image. */
export function glareFraction(grey: Uint8Array | Buffer, width: number, height: number): number {
  const x0 = Math.floor(width * 0.15);
  const x1 = Math.ceil(width * 0.85);
  const y0 = Math.floor(height * 0.15);
  const y1 = Math.ceil(height * 0.85);
  let bright = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (grey[y * width + x] >= 250) bright++;
      n++;
    }
  }
  return n ? bright / n : 0;
}

/** 64-bit difference hash, as 16 hex chars — near-identical crops share most bits. */
export async function differenceHash(image: Buffer): Promise<string> {
  const { data } = await sharp(image).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (data[y * 9 + x] > data[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

/** Number of differing bits between two difference hashes. */
export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let d = 0;
  while (x) {
    d += Number(x & 1n);
    x >>= 1n;
  }
  return d;
}

export function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Assess one crop. `box` is the unpadded detection box; `flags` are what
 * detection reported about overlap/visibility.
 */
export async function assessCrop(
  crop: Buffer,
  box: Box,
  boardWidth: number,
  boardHeight: number,
  flags: { occluded?: boolean; partial?: boolean } = {},
): Promise<QualityReport> {
  const t = qualityThresholds();
  const px = boxToPixels(box, boardWidth, boardHeight);
  const { data, info } = await sharp(crop)
    .greyscale()
    .resize(400, 400, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sharpness = Math.round(laplacianVariance(data, info.width, info.height));
  const glare = Math.round(glareFraction(data, info.width, info.height) * 1000) / 1000;
  const edge = touchesEdge(box);

  const reasons: QualityReason[] = [];
  if (Math.min(px.width, px.height) < t.minSidePx) reasons.push("low_resolution");
  if (sharpness < t.minSharpness) reasons.push("blurry");
  if (glare > t.maxGlare) reasons.push("glare");
  if (edge || flags.partial) reasons.push("cut_off");
  if (flags.occluded) reasons.push("occluded");

  // Score for choosing between crops of the same pin: size and sharpness
  // help, every problem costs a lot.
  const sizeScore = Math.min(1, Math.min(px.width, px.height) / (t.minSidePx * 2.5));
  const sharpScore = Math.min(1, sharpness / (t.minSharpness * 5));
  const score = Math.max(0, Math.round(45 * sizeScore + 35 * sharpScore + 20 * (1 - Math.min(1, glare / t.maxGlare)) - 25 * reasons.length));

  return {
    widthPx: px.width,
    heightPx: px.height,
    sharpness,
    glare,
    touchesEdge: edge,
    occluded: !!flags.occluded,
    partial: !!flags.partial,
    score,
    suitable: reasons.length === 0,
    reasons,
  };
}

/**
 * Prepare an uploaded board photo: apply EXIF orientation (so box
 * coordinates match what people see), cap the size, and re-encode — which
 * also strips EXIF metadata such as GPS location from what we store.
 */
export async function normaliseBoardPhoto(input: Buffer, maxSide = 4096): Promise<{ image: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer({ resolveWithObject: true });
  return { image: data, width: info.width, height: info.height };
}
