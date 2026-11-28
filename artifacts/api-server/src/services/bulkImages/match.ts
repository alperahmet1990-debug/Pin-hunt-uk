/**
 * Bulk Image Matcher — suggest catalogue matches for one uploaded photo.
 *
 *   1. describe   one vision call → characters, keywords, printed text and
 *                 the main pin's box (DESCRIBE_PROMPT below; board scanning
 *                 uses the same prompt through describeCrop)
 *   2–4.          the board scanner's matching (boardScan/match.ts matchCrop):
 *                 the catalogue search built for ~116k pins (character +
 *                 specific word first, then printed text, then broad; sets
 *                 first when given), picture-index look-alikes when the index
 *                 is on, the shared ranking prompt, and a comparison with
 *                 every ranked candidate's reference picture (downloaded by
 *                 the server) with the format-first rule.
 *
 * Reference pictures may be Pin & Pop images (migration 042): used here only
 * for internal matching, never stored by this feature, returned in
 * candidates, or published. A match is only "confident" when its own
 * reference picture confirmed it; unchecked suggestions are capped at 60%.
 * Matching settings are the board scanner's (BOARD_MAX_REFERENCES,
 * BOARD_MAX_CANDIDATES, BOARD_MATCH_ALWAYS_COMPARE, BOARD_REFERENCE_DETAIL).
 */
import type { getOpenAIClient } from "@workspace/integrations-openai-ai-server";
import type { PinRepository } from "@workspace/pin-repository";
import { VERIFY_CONFIDENT_LEAD } from "../scanVerify";
import { describeCrop, matchCrop, type MatchCandidate } from "../boardScan/match";
import { emptyUsage } from "../boardScan/detect";

export type OpenAIClient = ReturnType<typeof getOpenAIClient>;

export interface BulkCandidate {
  pinhuntId: string;
  title: string;
  collection: string;
  brand: string;
  edition: string | null;
  characters: string[];
  /** The pin's current public PinHunt photo, if any. */
  imageUrl: string | null;
  confidence: number;
  reasoning: string;
  /** This candidate's own reference picture was compared with the photo. */
  verified?: boolean;
  /** Found by the picture index (its reference picture looks like the photo). */
  lookalike?: boolean;
}

/** Where the main pin is in the photo, as fractions of width/height: [left, top, right, bottom]. */
export type PinBox = [number, number, number, number];

export interface PhotoDescription {
  characters: string[];
  keywords: string[];
  /** The main (most central, most complete) pin, so clean-up can ignore neighbours. */
  box?: PinBox;
}

export type MatchBand = "confident" | "possible" | "uncertain" | "none";

export interface BulkMatchResult {
  candidates: BulkCandidate[];
  description: PhotoDescription;
  topConfidence: number;
  band: MatchBand;
  /** The top suggestion was checked against its own reference picture. */
  verified: boolean;
  aiCalls: number;
  /** Why the picture check didn't run or failed, if it didn't (logged; shown in a later change). */
  problem?: string | null;
}

export interface MatchDeps {
  openai: OpenAIClient;
  model: string;
  repository: PinRepository;
  /** Internal-only reference image URLs keyed by pinhunt id (e.g. Pin & Pop). */
  referenceImages?: (pinhuntIds: string[]) => Promise<Record<string, string>>;
  /** Fetch one reference picture as an inline image (default: the board scanner's server-side download). */
  fetchImage?: (url: string) => Promise<string | null>;
  /** The picture index: pinhunt ids of the pins that look most like the photo, closest first. */
  pictureSearch?: (photo: Buffer) => Promise<string[]>;
  /** Sets to search first (e.g. the batch is one set). */
  sets?: string[];
  timeoutMs?: number;
  /** No longer read here; matching settings are the board scanner's (BOARD_MAX_REFERENCES etc.). */
  env?: NodeJS.ProcessEnv;
}

export const SHOW_CANDIDATES = 5;
export const BAND_CONFIDENT_MIN = 85;
export const BAND_POSSIBLE_MIN = 50;
export const BAND_UNCERTAIN_MIN = 25;

/**
 * How sure the suggestion is. "confident" needs a reference image to have
 * confirmed it, a high score and a clear lead over the runner-up.
 */
export function matchBand(candidates: ReadonlyArray<{ confidence: number }>, verified: boolean): MatchBand {
  const top = candidates[0]?.confidence ?? 0;
  const second = candidates[1]?.confidence ?? 0;
  if (top < BAND_UNCERTAIN_MIN) return "none";
  if (verified && top >= BAND_CONFIDENT_MIN && top - second >= VERIFY_CONFIDENT_LEAD) return "confident";
  if (top >= BAND_POSSIBLE_MIN) return "possible";
  return "uncertain";
}

export const DESCRIBE_PROMPT = `You identify Disney enamel pins. Look at the photo and return ONLY valid JSON (no markdown):
{ "characters": ["<Disney character names>"], "keywords": ["<search terms: series/collection name guesses, visible text, distinctive objects>"], "text": "<any text printed on the pin, or empty>", "box": [<left>, <top>, <right>, <bottom>] }

The photo may show neighbouring pins at the edges (e.g. taken on a pin board). Describe ONLY the main pin: the one the photo is centred on and shows most completely. "box" is that main pin's bounding box as fractions of the image width and height (0 to 1), including its whole outline and any dangle, but no neighbouring pins.

IMPORTANT: many Disney pins are objects THEMED after a character (a dessert, dress, ear hat or flower in a character's colours with their signature props) without showing the character's face. Read the props and palette. Include your best character guesses in "characters" even when no face is visible — up to 4, most likely first.
For keywords, include the object type AND close synonyms/series words. Up to 8 keywords. Use empty arrays only if you truly cannot tell.`;

/** A sane box, or undefined. Rejects tiny, inverted or out-of-range boxes. */
export function parseBox(v: unknown): PinBox | undefined {
  if (!Array.isArray(v) || v.length !== 4) return undefined;
  const n = v.map(Number);
  if (n.some((x) => !Number.isFinite(x))) return undefined;
  const [l, t, r, b] = n.map((x) => Math.max(0, Math.min(1, x)));
  if (r - l < 0.1 || b - t < 0.1) return undefined;
  return [l, t, r, b];
}

export function parseDescription(raw: string): { characters: string[]; keywords: string[]; text: string; box?: PinBox } {
  try {
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    const parsed = s !== -1 && e > s ? JSON.parse(raw.slice(s, e + 1)) : {};
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : []);
    return {
      characters: list(parsed.characters).slice(0, 4),
      keywords: list(parsed.keywords).slice(0, 8),
      text: typeof parsed.text === "string" ? parsed.text.trim().slice(0, 200) : "",
      box: parseBox(parsed.box),
    };
  } catch {
    return { characters: [], keywords: [], text: "" };
  }
}

/** [left, top, right, bottom], rounded so a box survives the round trip through x/y/w/h exactly. */
function toPinBox(b: { x: number; y: number; w: number; h: number }): PinBox {
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return [r(b.x), r(b.y), r(b.x + b.w), r(b.y + b.h)];
}

/** What the ranking is told about a bulk photo (one pin, usually centred). */
export const SINGLE_PHOTO_CONTEXT = "\n\nThe photo shows ONE pin, usually centred. If anything else shows at the edges, identify only the main pin.";

function toCandidate(c: MatchCandidate): BulkCandidate {
  return {
    pinhuntId: c.pinId,
    title: c.title,
    collection: c.collection,
    brand: c.brand ?? "",
    edition: c.edition ?? null,
    characters: c.characters ?? [],
    imageUrl: c.imageUrl,
    confidence: c.confidence,
    reasoning: c.reasoning,
    ...(c.verified ? { verified: true } : {}),
    ...(c.lookalike ? { lookalike: true } : {}),
  };
}

/**
 * Suggest catalogue matches for one photo (a JPEG, already downscaled).
 *
 * Describe here, then the board scanner's matching (boardScan/match.ts
 * matchCrop), so both admin tools match the same way: the search built for
 * the 116k catalogue (character + specific word first), picture-index
 * look-alikes when the index is on, every ranked candidate's reference
 * picture compared (fetched by the server), the format-first rule, and only
 * a picture comparison can make a match confident (unchecked rankings are
 * capped at 60%; a checked match under 40% is not identified).
 */
export async function matchPhoto(photo: Buffer, deps: MatchDeps): Promise<BulkMatchResult> {
  const timeout = deps.timeoutMs ?? 45_000;
  const usage = emptyUsage();

  // 1. Describe
  const described = await describeCrop(photo, { openai: deps.openai, model: deps.model, timeoutMs: timeout }, usage);
  const description: PhotoDescription = {
    characters: described.characters,
    keywords: described.keywords,
    ...(described.box ? { box: toPinBox(described.box) } : {}),
  };

  // 2–4. Search, rank and compare: shared with board scanning.
  const result = await matchCrop(
    photo,
    { characters: described.characters, keywords: described.keywords, text: described.text },
    {
      openai: deps.openai,
      model: deps.model,
      repository: deps.repository,
      referenceImages: deps.referenceImages,
      ...(deps.fetchImage ? { fetchImage: deps.fetchImage } : {}),
      ...(deps.pictureSearch ? { pictureSearch: deps.pictureSearch } : {}),
      timeoutMs: timeout,
    },
    usage,
    { context: SINGLE_PHOTO_CONTEXT, ...(deps.sets?.length ? { sets: deps.sets } : {}) },
  );
  if (result.problem) console.warn("[bulk-images] picture check:", result.problem);

  const candidates = result.candidates.slice(0, SHOW_CANDIDATES).map(toCandidate);
  const topChecked = !!result.candidates[0]?.verified;
  return {
    candidates,
    description,
    topConfidence: candidates[0]?.confidence ?? 0,
    band: result.status === "unmatched" ? "none" : matchBand(candidates, topChecked),
    verified: topChecked,
    aiCalls: usage.calls,
    problem: result.problem ?? null,
  };
}
