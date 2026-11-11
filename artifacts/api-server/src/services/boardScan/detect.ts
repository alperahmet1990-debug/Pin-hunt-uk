/**
 * Board scanning — step 1: find the individual pins on a board photo.
 *
 * Uses the same OpenAI vision model as the single-pin scan. The model
 * returns a box per pin plus a short description (characters, keywords,
 * visible text) that the matching step uses to search the catalogue — so
 * matching needs no separate "describe" call per pin.
 *
 * Kept separate from matching (match.ts) and clean-up (cleanup.ts) so each
 * step can be improved, or swapped for a specialised detector, on its own.
 *
 * BOARD_DETECT_TILES=2 additionally runs detection on four overlapping
 * quarters of the photo and merges the results — more calls, but each pin
 * is seen at higher resolution. Off by default until the benchmark shows it
 * helps (scripts/BOARD-SCANNING.md).
 */
import sharp from "sharp";
import type { getOpenAIClient } from "@workspace/integrations-openai-ai-server";
import { withScanReasoning } from "../scanReasoning";
import type { Box } from "./quality";

export type OpenAIClient = ReturnType<typeof getOpenAIClient>;

export interface DetectedPin {
  box: Box;
  characters: string[];
  keywords: string[];
  /** Text visible on the pin, if any. */
  text: string;
  occluded: boolean;
  partial: boolean;
}

export interface DetectionResult {
  pins: DetectedPin[];
  /** The model reported more pins than the per-board limit. */
  truncated: boolean;
  /** How many pins the model found before de-duplication and the limit. */
  rawCount: number;
  usage: TokenUsage;
}

export interface TokenUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export function emptyUsage(): TokenUsage {
  return { calls: 0, inputTokens: 0, outputTokens: 0 };
}

export function addUsage(into: TokenUsage, resp: { usage?: { prompt_tokens?: number; completion_tokens?: number } | null } | null) {
  into.calls += 1;
  into.inputTokens += resp?.usage?.prompt_tokens ?? 0;
  into.outputTokens += resp?.usage?.completion_tokens ?? 0;
}

export function boardMaxPins(): number {
  const raw = Number(process.env.BOARD_MAX_PINS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
}

const DETECT_SYSTEM_PROMPT = `You find individual Disney enamel pins in a photo of a pin trading board (pins on cork, fabric, a lanyard or a binder page).

Return ONLY valid JSON (no markdown):
{ "pins": [ { "box": [x0, y0, x1, y1], "characters": ["..."], "keywords": ["..."], "text": "...", "occluded": false, "partial": false } ] }

- "box" is the tight rectangle around ONE pin, in coordinates from 0 to 1000 relative to the image: x0,y0 = top-left corner, x1,y1 = bottom-right corner (x across, y down). Include the whole pin, including danglers, sliders and pin-on-pin pieces that belong to it, but not neighbouring pins.
- One entry per separate pin. Pins that touch or overlap are still separate pins. Do not include backing cards, lanyards, badges, buttons that are not enamel pins, or empty spaces.
- "characters": Disney characters on or represented by the pin, best guess first (up to 3). "keywords": up to 6 search terms — series/collection guesses, the object type, distinctive props. "text": any words printed on the pin, exactly as written, or "".
- "occluded": true when another pin or object covers part of this pin. "partial": true when part of the pin is outside the photo or hidden.
- List pins row by row, top to bottom, left to right.`;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Parse the model's JSON into boxes (0–1 fractions). Malformed entries are dropped. */
export function parseDetection(raw: string): DetectedPin[] {
  let parsed: unknown;
  try {
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s === -1 || e <= s) return [];
    parsed = JSON.parse(raw.slice(s, e + 1));
  } catch {
    return [];
  }
  const list = (parsed as { pins?: unknown })?.pins;
  if (!Array.isArray(list)) return [];
  const out: DetectedPin[] = [];
  for (const item of list as Array<Record<string, unknown>>) {
    const b = item?.box;
    if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => Number.isFinite(Number(n)))) continue;
    let [x0, y0, x1, y1] = b.map((n) => Number(n) / 1000);
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    x0 = clamp01(x0); y0 = clamp01(y0); x1 = clamp01(x1); y1 = clamp01(y1);
    const w = x1 - x0;
    const h = y1 - y0;
    // Specks and "the whole board" are not pins.
    if (w < 0.01 || h < 0.01 || w * h > 0.6) continue;
    const strings = (v: unknown, n: number) =>
      Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, n) : [];
    out.push({
      box: { x: x0, y: y0, w, h },
      characters: strings(item.characters, 3),
      keywords: strings(item.keywords, 6),
      text: typeof item.text === "string" ? item.text.trim().slice(0, 200) : "",
      occluded: item.occluded === true,
      partial: item.partial === true,
    });
  }
  return out;
}

function area(b: Box) {
  return b.w * b.h;
}

function intersection(a: Box, b: Box) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function iou(a: Box, b: Box): number {
  const i = intersection(a, b);
  return i ? i / (area(a) + area(b) - i) : 0;
}

/**
 * Merge duplicate detections (the same pin found twice, e.g. by two
 * overlapping tiles): drop a box that mostly overlaps one already kept, or
 * sits almost entirely inside it. Larger, un-cut boxes are kept first.
 */
export function dedupeDetections(pins: DetectedPin[], iouLimit = 0.5, containLimit = 0.85): DetectedPin[] {
  const ordered = [...pins].sort((a, b) => Number(a.partial) - Number(b.partial) || area(b.box) - area(a.box));
  const kept: DetectedPin[] = [];
  for (const p of ordered) {
    const dup = kept.some((k) => {
      const inter = intersection(p.box, k.box);
      return iou(p.box, k.box) > iouLimit || inter / Math.min(area(p.box), area(k.box)) > containLimit;
    });
    if (!dup) kept.push(p);
  }
  return sortReadingOrder(kept);
}

/** Row by row, top to bottom, left to right — the order people read a board in. */
export function sortReadingOrder(pins: DetectedPin[]): DetectedPin[] {
  const byTop = [...pins].sort((a, b) => a.box.y - b.box.y);
  const rows: DetectedPin[][] = [];
  for (const p of byTop) {
    const row = rows[rows.length - 1];
    const centre = p.box.y + p.box.h / 2;
    if (row && row.some((r) => centre >= r.box.y && centre <= r.box.y + r.box.h)) row.push(p);
    else rows.push([p]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.box.x - b.box.x));
}

async function detectOnce(
  openai: OpenAIClient,
  model: string,
  image: Buffer,
  timeoutMs: number,
  usage: TokenUsage,
): Promise<DetectedPin[]> {
  const resp = await withScanReasoning((extra) => openai.chat.completions.create({
    ...extra,
    model,
    // Reasoning eats into this before any JSON is written (ai-model-quirks.md);
    // 30 pins of JSON alone is ~3k tokens.
    max_completion_tokens: 10_000,
    messages: [
      { role: "system", content: DETECT_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "high" } },
          { type: "text", text: "Find every pin on this board and return the JSON." },
        ],
      },
    ],
  }, { timeout: timeoutMs, maxRetries: 1 }));
  addUsage(usage, resp);
  const content = resp.choices[0]?.message?.content ?? "";
  if (!content) console.warn("[board-scan] empty detection response, finish:", resp.choices[0]?.finish_reason);
  return parseDetection(content);
}

/** Downscale for the model: it sees at most ~2048px anyway, so sending more only costs upload time. */
async function forModel(image: Buffer, region?: { left: number; top: number; width: number; height: number }) {
  let s = sharp(image);
  if (region) s = s.extract(region);
  return s.resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}

/**
 * Detect pins on a normalised board photo (quality.normaliseBoardPhoto).
 * Throws when the model call itself fails; returns [] when it found nothing.
 */
export async function detectPins(
  openai: OpenAIClient,
  model: string,
  board: { image: Buffer; width: number; height: number },
  opts: { timeoutMs?: number; tiles?: number; maxPins?: number } = {},
): Promise<DetectionResult> {
  const usage = emptyUsage();
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const maxPins = opts.maxPins ?? boardMaxPins();
  const tiles = opts.tiles ?? (Number(process.env.BOARD_DETECT_TILES) === 2 ? 2 : 1);

  const all = await detectOnce(openai, model, await forModel(board.image), timeoutMs, usage);

  if (tiles === 2) {
    // Four quarters overlapping by 15%, mapped back to whole-photo fractions.
    const overlap = 0.15;
    const span = 0.5 + overlap / 2;
    const quarters = [0, 1].flatMap((ty) => [0, 1].map((tx) => ({ fx: tx ? 1 - span : 0, fy: ty ? 1 - span : 0 })));
    const results = await Promise.all(quarters.map(async (q) => {
      const region = {
        left: Math.floor(q.fx * board.width),
        top: Math.floor(q.fy * board.height),
        width: Math.floor(span * board.width),
        height: Math.floor(span * board.height),
      };
      try {
        const found = await detectOnce(openai, model, await forModel(board.image, region), timeoutMs, usage);
        return found.map((p) => ({
          ...p,
          box: { x: q.fx + p.box.x * span, y: q.fy + p.box.y * span, w: p.box.w * span, h: p.box.h * span },
          // A pin cut by the tile edge is not cut off in the real photo; the
          // whole-photo pass or a neighbouring tile has the full box.
          partial: false,
        }));
      } catch (err) {
        console.warn("[board-scan] tile detection failed, continuing:", err instanceof Error ? err.message : err);
        return [];
      }
    }));
    all.push(...results.flat());
  }

  const rawCount = all.length;
  const pins = dedupeDetections(all);
  return { pins: pins.slice(0, maxPins), truncated: pins.length > maxPins, rawCount, usage };
}
