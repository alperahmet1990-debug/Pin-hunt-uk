/**
 * Board scanning — straighten a cleaned pin photo.
 *
 * Pins on a board are rarely perfectly square to the camera. Pixian returns
 * the pin on white (services/pixian.ts), so the pin's outline is the
 * non-white area. For pins with straight sides (rectangles, badges, cards),
 * the tilt is the rotation that makes the outline's bounding box smallest;
 * rotating by it lines the sides up with the photo's edges.
 *
 * Round, star and other irregular shapes have no "straight" — their convex
 * hull fills much less of its best bounding box — so they are left alone
 * rather than turned to an arbitrary angle. Only the outline matters, so white
 * enamel inside the pin (clouds, faces) doesn't confuse it.
 */
import sharp from "sharp";

const ANALYSE_SIDE = 400;
const WHITE = 238; // channel value above which a pixel counts as background
const MAX_TILT = 25;
const MIN_TILT = 1;
/** Hull area / best bounding-box area at or above which a shape counts as straight-sided. */
const MIN_RECT_FILL = 0.85;

type Point = [number, number];

function cross(o: Point, a: Point, b: Point) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Monotone-chain convex hull. */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function polygonArea(poly: Point[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function boxAreaAt(hull: Point[], degrees: number) {
  const t = (degrees * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of hull) {
    const rx = x * c - y * s;
    const ry = x * s + y * c;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  return (maxX - minX) * (maxY - minY);
}

export interface TiltEstimate {
  /** Degrees to rotate the photo clockwise to straighten it (0 when it's straight or not straight-sided). */
  degrees: number;
  rectFill: number;
  reason: "straightened" | "already_straight" | "not_straight_sided" | "no_outline";
}

/** The tilt of the pin on a white-background photo. */
export async function estimateTilt(image: Buffer): Promise<TiltEstimate> {
  const { data, info } = await sharp(image)
    .resize(ANALYSE_SIDE, ANALYSE_SIDE, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  // Leftmost and rightmost non-white pixel of every row: enough for the hull.
  const points: Point[] = [];
  let rows = 0;
  for (let y = 0; y < height; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (Math.min(data[i], data[i + 1], data[i + 2]) < WHITE) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first >= 0) {
      points.push([first, y], [last, y]);
      rows++;
    }
  }
  if (rows < 10) return { degrees: 0, rectFill: 0, reason: "no_outline" };
  const hull = convexHull(points);
  const hullArea = polygonArea(hull);
  // Something covering nearly the whole photo (e.g. a test-mode watermark) isn't a pin outline.
  if (hullArea > 0.95 * width * height) return { degrees: 0, rectFill: 0, reason: "no_outline" };

  let best = 0;
  let bestArea = boxAreaAt(hull, 0);
  for (let d = -MAX_TILT; d <= MAX_TILT; d += 0.25) {
    const a = boxAreaAt(hull, d);
    if (a < bestArea - 1e-6) { bestArea = a; best = d; }
  }
  const rectFill = hullArea / bestArea;
  if (rectFill < MIN_RECT_FILL) return { degrees: 0, rectFill, reason: "not_straight_sided" };
  if (Math.abs(best) < MIN_TILT) return { degrees: 0, rectFill, reason: "already_straight" };
  return { degrees: best, rectFill, reason: "straightened" };
}

/**
 * Rotate a white-background pin photo by `degrees` (clockwise) and frame it
 * again the way Pixian does: trimmed to the pin, 12% margin, square, on white.
 */
export async function rotatePinPhoto(image: Buffer, degrees: number): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  const side = Math.max(meta.width ?? 1200, meta.height ?? 1200);
  const rotated = await sharp(image)
    .rotate(degrees, { background: { r: 255, g: 255, b: 255 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toBuffer();
  const trimmed = await sharp(rotated)
    .trim({ background: { r: 255, g: 255, b: 255 }, threshold: 255 - WHITE })
    .toBuffer();
  const inner = Math.round(side * (1 - 2 * 0.12));
  return sharp(trimmed)
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .extend({
      top: Math.floor((side - inner) / 2), bottom: Math.ceil((side - inner) / 2),
      left: Math.floor((side - inner) / 2), right: Math.ceil((side - inner) / 2),
      background: { r: 255, g: 255, b: 255 },
    })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Straighten when the pin is straight-sided and visibly tilted; otherwise return it unchanged. */
export async function straightenPinPhoto(image: Buffer): Promise<{ image: Buffer; tilt: TiltEstimate }> {
  const tilt = await estimateTilt(image);
  if (tilt.reason !== "straightened") return { image, tilt };
  return { image: await rotatePinPhoto(image, tilt.degrees), tilt };
}
