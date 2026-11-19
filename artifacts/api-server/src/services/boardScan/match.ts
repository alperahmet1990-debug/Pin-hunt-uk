/**
 * Board scanning — step 2: match one cropped pin to the catalogue.
 *
 * The same recognition as the single-pin scan (routes/scan.ts) and the Bulk
 * Image Matcher: a describe call on the pin itself (describeCrop — its own
 * search terms, and a tight box so the crop can be redone), catalogue search
 * (services/scanCandidates.ts), the shared ranking prompt, then a comparison
 * with reference images whenever any exist (services/pinRank.ts,
 * services/scanVerify.ts). The board-wide detection's description is too
 * coarse to search 100k+ pins with on its own.
 *
 * A match only counts as confident when a picture comparison confirmed it:
 * unchecked rankings are capped at UNVERIFIED_MAX, below the automatic
 * clean-up threshold. A checked match that no reference supports is shown
 * as not identified rather than as a guess.
 *
 * Reference images may include Pin & Pop images. Those are used here only
 * for internal recognition (permitted by the Pin & Pop agreement) — they are
 * never returned in candidates, stored as crops or published.
 */
import type { CataloguePin, PinRepository } from "@workspace/pin-repository";
import { withScanReasoning } from "../scanReasoning";
import { verifyDecision } from "../scanVerify";
import { findBoardCandidates } from "./candidates";
import { buildCatalogueText, parseMatches, rankSystemPrompt, verifySystemPrompt, type PinMatch } from "../pinRank";
import { DESCRIBE_PROMPT, parseDescription } from "../bulkImages/match";
import { addUsage, type DetectedPin, type OpenAIClient, type TokenUsage } from "./detect";
import type { Box } from "./quality";

export interface MatchCandidate {
  pinId: string;
  title: string;
  collection: string;
  /** The pin's public catalogue photo, if it has one. */
  imageUrl: string | null;
  confidence: number;
  reasoning: string;
  /** A picture comparison with reference images produced this ranking. */
  verified?: boolean;
}

export interface CropMatch {
  status: "suggested" | "unmatched";
  candidates: MatchCandidate[];
  /** The photo-comparison step ran. */
  verified: boolean;
}

export interface MatchDeps {
  openai: OpenAIClient;
  model: string;
  repository: PinRepository;
  /** Internal-only reference image URLs by pinhunt id (e.g. Pin & Pop). */
  referenceImages?: (pinhuntIds: string[]) => Promise<Record<string, string>>;
  timeoutMs?: number;
}

/** Below this, no candidate is plausible: shown as "not identified". */
export const MATCH_PLAUSIBLE_MIN = 25;
/** After a picture comparison, below this no reference supported the match: "not identified". */
export const MATCH_VERIFIED_MIN = 40;
/** Highest confidence a match can show without a picture comparison (below auto clean-up). */
export const UNVERIFIED_MAX = 60;

/**
 * Reference pictures shown in the comparison: every ranked candidate (up to
 * 5), not the scan's 3. With only the top 3 shown, the model promoted a 4th
 * or 5th candidate it had never seen when the pictured ones didn't match.
 */
function maxReferences(): number {
  const raw = Number(process.env.BOARD_MAX_REFERENCES);
  return Number.isFinite(raw) && raw > 0 ? Math.min(5, Math.floor(raw)) : 5;
}

const alwaysCompare = () => (process.env.BOARD_MATCH_ALWAYS_COMPARE ?? "true").toLowerCase() !== "false";

export interface CropDescription {
  characters: string[];
  keywords: string[];
  text: string;
  /** The main pin's box as fractions of the described image, when the model gave a sane one. */
  box?: Box;
}

/**
 * Describe one pin from a close-up (the Bulk Image Matcher's describe
 * prompt): characters, search terms, printed text and the main pin's box.
 */
export async function describeCrop(image: Buffer, deps: Pick<MatchDeps, "openai" | "model" | "timeoutMs">, usage: TokenUsage): Promise<CropDescription> {
  const resp = await withScanReasoning((extra) => deps.openai.chat.completions.create({
    ...extra,
    model: deps.model,
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: DESCRIBE_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "high" } },
          { type: "text", text: "Describe this pin as JSON." },
        ],
      },
    ],
  }, { timeout: deps.timeoutMs ?? 45_000, maxRetries: 1 }));
  addUsage(usage, resp);
  const d = parseDescription(resp.choices[0]?.message?.content ?? "");
  return {
    characters: d.characters,
    keywords: d.keywords,
    text: d.text,
    ...(d.box ? { box: { x: d.box[0], y: d.box[1], w: d.box[2] - d.box[0], h: d.box[3] - d.box[1] } } : {}),
  };
}

function maxCandidates(): number {
  const raw = Number(process.env.BOARD_MAX_CANDIDATES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 150;
}

const CROP_CONTEXT = "\n\nThe photo is a crop of ONE pin from a photo of a whole pin trading board. Parts of neighbouring pins may show at the edges — identify only the pin in the centre.";

export async function matchCrop(
  crop: Buffer,
  detected: Pick<DetectedPin, "characters" | "keywords" | "text">,
  deps: MatchDeps,
  usage: TokenUsage,
  opts: { sets?: string[] } = {},
): Promise<CropMatch> {
  const timeout = deps.timeoutMs ?? 45_000;
  const textTerms = detected.text ? [detected.text] : [];
  const sets = opts.sets ?? [];
  const catalogue = await findBoardCandidates(deps.repository, detected, textTerms, maxCandidates(), sets);
  if (catalogue.length === 0) return { status: "unmatched", candidates: [], verified: false };

  const byId = new Map<string, CataloguePin>(catalogue.map((p) => [p.id, p]));
  const validIds = new Set(byId.keys());
  const photo = `data:image/jpeg;base64,${crop.toString("base64")}`;
  const hint = (detected.text
    ? `\n\nADDITIONAL SIGNALS from image analysis (use as strong hints, especially any text that matches a pin title or edition):\nText seen on the pin: "${detected.text}"`
    : "") + (sets.length
    ? `\n\nOther pins on this board come from these sets: ${sets.map((s) => `"${s}"`).join(", ")}. Prefer a candidate from one of them when its title and character fit, but only if nothing else fits better.`
    : "");

  const rankResp = await withScanReasoning((extra) => deps.openai.chat.completions.create({
    ...extra,
    model: deps.model,
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: rankSystemPrompt(buildCatalogueText(catalogue), hint, CROP_CONTEXT) },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: photo, detail: "high" } },
          { type: "text", text: "Please identify this Disney pin and return the top 5 matches as JSON." },
        ],
      },
    ],
  }, { timeout, maxRetries: 1 }));
  addUsage(usage, rankResp);
  let matches: PinMatch[] = parseMatches(rankResp.choices[0]?.message?.content ?? "", validIds, 5);

  let verified = false;
  /** Candidates whose own picture the comparison was shown. */
  let pictured = new Set<string>();
  const decision = verifyDecision(matches);
  if (decision === "compare" || (decision === "confident" && alwaysCompare())) {
    const internal = deps.referenceImages
      ? await deps.referenceImages(matches.map((m) => m.pinId)).catch(() => ({} as Record<string, string>))
      : {};
    const refs = matches
      .map((m) => ({ m, url: byId.get(m.pinId)?.imageUrl || internal[m.pinId] }))
      .filter((r): r is { m: PinMatch; url: string } => !!r.url)
      .slice(0, maxReferences());
    if (refs.length > 0) {
      try {
        const content: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } }
        > = [
          { type: "image_url", image_url: { url: photo, detail: "high" } },
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
        addUsage(usage, verifyResp);
        const reranked = parseMatches(verifyResp.choices[0]?.message?.content ?? "", validIds);
        if (reranked.length > 0) {
          matches = reranked;
          verified = true;
          pictured = withRef;
        }
      } catch (err) {
        // Comparison is optional, same as the single-pin scan.
        console.warn("[board-scan] reference comparison failed, using ranking:", err instanceof Error ? err.message : err);
      }
    }
  }

  const candidates: MatchCandidate[] = matches.slice(0, 3).map((m) => {
    const p = byId.get(m.pinId)!;
    // A candidate counts as checked only if its own picture was compared.
    const checked = verified && pictured.has(p.id);
    return {
      pinId: p.id,
      title: p.title,
      collection: p.collection,
      imageUrl: p.imageUrl ?? null,
      // Only a picture comparison can make a match confident.
      confidence: checked ? m.confidence : Math.min(m.confidence, UNVERIFIED_MAX),
      reasoning: m.reasoning,
      verified: checked,
    };
  });
  const top = candidates[0]?.confidence ?? 0;
  const min = candidates[0]?.verified ? MATCH_VERIFIED_MIN : MATCH_PLAUSIBLE_MIN;
  return { status: top >= min ? "suggested" : "unmatched", candidates, verified };
}
