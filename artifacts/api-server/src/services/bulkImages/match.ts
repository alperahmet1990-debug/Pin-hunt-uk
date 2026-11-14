/**
 * Bulk Image Matcher — suggest catalogue matches for one uploaded photo.
 *
 * The same recognition as the single-pin scan (routes/scan.ts), reused
 * rather than rebuilt:
 *   1. describe   one vision call → characters + keywords
 *   2. retrieve   services/scanCandidates.ts: indexed catalogue searches by
 *                 those terms. This is what keeps it cheap at Pin & Pop scale
 *                 (~116k records): the database narrows to ≤150 candidates,
 *                 the model never sees the whole catalogue, and no per-record
 *                 AI comparison is made.
 *   3. rank       services/pinRank.ts prompt → top 5
 *   4. compare    services/scanVerify.ts rules, against up to 3 reference
 *                 images: the pin's PinHunt photo, or else its Pin & Pop
 *                 reference image (migration 042). Pin & Pop images are used
 *                 here only for internal matching; they are never stored by
 *                 this feature, returned in candidates, or published.
 *
 * Unlike the scan, the comparison runs whenever any reference image exists
 * (BULK_MATCH_ALWAYS_COMPARE, default on): catalogue data quality matters
 * more than a few seconds, and text alone cannot separate sibling pins
 * (.agents/memory/ai-model-quirks.md). A match is only "confident" when a
 * reference image confirmed it.
 */
import type { getOpenAIClient } from "@workspace/integrations-openai-ai-server";
import type { CataloguePin, PinRepository } from "@workspace/pin-repository";
import { findCandidates } from "../scanCandidates";
import { withScanReasoning } from "../scanReasoning";
import { verifyDecision, VERIFY_CONFIDENT_LEAD, VERIFY_MAX_REFERENCES } from "../scanVerify";
import { buildCatalogueText, parseMatches, rankSystemPrompt, verifySystemPrompt, type PinMatch } from "../pinRank";

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
  /** A reference-image comparison re-ranked the candidates. */
  verified: boolean;
  aiCalls: number;
}

export interface MatchDeps {
  openai: OpenAIClient;
  model: string;
  repository: PinRepository;
  /** Internal-only reference image URLs keyed by pinhunt id (e.g. Pin & Pop). */
  referenceImages?: (pinhuntIds: string[]) => Promise<Record<string, string>>;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export const SHOW_CANDIDATES = 5;
export const BAND_CONFIDENT_MIN = 85;
export const BAND_POSSIBLE_MIN = 50;
export const BAND_UNCERTAIN_MIN = 25;

function maxCandidates(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.BULK_MATCH_MAX_CANDIDATES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 150;
}

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

const DESCRIBE_PROMPT = `You identify Disney enamel pins. Look at the photo and return ONLY valid JSON (no markdown):
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

function parseDescription(raw: string): { characters: string[]; keywords: string[]; text: string; box?: PinBox } {
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

function toCandidate(p: CataloguePin, m: PinMatch): BulkCandidate {
  return {
    pinhuntId: p.id,
    title: p.title,
    collection: p.collection,
    brand: p.brand,
    edition: p.edition ?? null,
    characters: [...new Set([...(p.mainCharacter ? [p.mainCharacter] : []), ...p.characters])].slice(0, 6),
    imageUrl: p.imageUrl ?? null,
    confidence: m.confidence,
    reasoning: m.reasoning,
  };
}

/** Suggest catalogue matches for one photo (a JPEG, already downscaled). */
export async function matchPhoto(photo: Buffer, deps: MatchDeps): Promise<BulkMatchResult> {
  const env = deps.env ?? process.env;
  const timeout = deps.timeoutMs ?? 45_000;
  const dataUrl = `data:image/jpeg;base64,${photo.toString("base64")}`;
  let aiCalls = 0;

  // 1. Describe
  const describeResp = await withScanReasoning((extra) => deps.openai.chat.completions.create({
    ...extra,
    model: deps.model,
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: DESCRIBE_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          { type: "text", text: "Describe this pin as JSON." },
        ],
      },
    ],
  }, { timeout, maxRetries: 1 }));
  aiCalls++;
  const described = parseDescription(describeResp.choices[0]?.message?.content ?? "");
  const description: PhotoDescription = {
    characters: described.characters,
    keywords: described.keywords,
    ...(described.box ? { box: described.box } : {}),
  };

  // 2. Retrieve (bounded, indexed searches — never the whole catalogue)
  const textTerms = described.text ? [described.text] : [];
  const catalogue = (await findCandidates(deps.repository, description, textTerms)).slice(0, maxCandidates(env));
  if (catalogue.length === 0) {
    return { candidates: [], description, topConfidence: 0, band: "none", verified: false, aiCalls };
  }
  const byId = new Map<string, CataloguePin>(catalogue.map((p) => [p.id, p]));
  const validIds = new Set(byId.keys());

  // 3. Rank
  const hint = described.text
    ? `\n\nADDITIONAL SIGNALS from image analysis (use as strong hints, especially any text that matches a pin title or edition):\nText seen on the pin: "${described.text}"`
    : "";
  const rankResp = await withScanReasoning((extra) => deps.openai.chat.completions.create({
    ...extra,
    model: deps.model,
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: rankSystemPrompt(buildCatalogueText(catalogue), hint) },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          { type: "text", text: "Please identify this Disney pin and return the top 5 matches as JSON." },
        ],
      },
    ],
  }, { timeout, maxRetries: 1 }));
  aiCalls++;
  let matches: PinMatch[] = parseMatches(rankResp.choices[0]?.message?.content ?? "", validIds, SHOW_CANDIDATES);

  // 4. Compare with reference images
  let verified = false;
  const alwaysCompare = (env.BULK_MATCH_ALWAYS_COMPARE ?? "true").toLowerCase() !== "false";
  const decision = verifyDecision(matches);
  if (decision === "compare" || (alwaysCompare && decision === "confident")) {
    const internal = deps.referenceImages
      ? await deps.referenceImages(matches.map((m) => m.pinId)).catch(() => ({} as Record<string, string>))
      : {};
    const refs = matches
      .map((m) => ({ m, url: byId.get(m.pinId)?.imageUrl || internal[m.pinId] }))
      .filter((r): r is { m: PinMatch; url: string } => !!r.url)
      .slice(0, VERIFY_MAX_REFERENCES);
    if (refs.length > 0) {
      try {
        const content: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } }
        > = [
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          { type: "text", text: "Photo above is the USER'S PIN. Reference images follow:" },
        ];
        for (const r of refs) {
          const p = byId.get(r.m.pinId)!;
          content.push({ type: "text", text: `Reference for ${p.id} — "${p.title}" (${p.collection}):` });
          content.push({ type: "image_url", image_url: { url: r.url, detail: "low" } });
        }
        content.push({ type: "text", text: "Compare the user's pin to each reference image and re-rank ALL candidates as JSON." });
        const withRef = new Set(refs.map((r) => r.m.pinId));
        const candidateList = matches
          .map((m) => {
            const p = byId.get(m.pinId)!;
            return `${p.id} | "${p.title}" | ${p.collection} | reference image: ${withRef.has(p.id) ? "YES (shown below)" : "no image available"}`;
          })
          .join("\n");
        const verifyResp = await withScanReasoning((extra) => deps.openai.chat.completions.create({
          ...extra,
          model: deps.model,
          max_completion_tokens: 2048,
          messages: [
            { role: "system", content: verifySystemPrompt(candidateList, matches.length) },
            { role: "user", content },
          ],
        }, { timeout, maxRetries: 0 }));
        aiCalls++;
        const reranked = parseMatches(verifyResp.choices[0]?.message?.content ?? "", validIds, SHOW_CANDIDATES);
        if (reranked.length > 0) {
          // Keep any candidate the comparison dropped, after the re-ranked ones.
          const seen = new Set(reranked.map((m) => m.pinId));
          matches = [...reranked, ...matches.filter((m) => !seen.has(m.pinId))].slice(0, SHOW_CANDIDATES);
          verified = true;
        }
      } catch (err) {
        // The comparison is optional: keep the ranking.
        console.warn("[bulk-images] reference comparison failed, using ranking:", err instanceof Error ? err.message : err);
      }
    }
  }

  const candidates = matches.map((m) => toCandidate(byId.get(m.pinId)!, m));
  return {
    candidates,
    description,
    topConfidence: candidates[0]?.confidence ?? 0,
    band: matchBand(candidates, verified),
    verified,
    aiCalls,
  };
}
