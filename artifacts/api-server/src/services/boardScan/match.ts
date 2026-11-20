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
import { fetchReferenceImage } from "./references";

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
  /** Why the picture check didn't run or failed, for the reviewer (null when it worked or wasn't needed). */
  problem?: string | null;
}

/** Candidates kept per pin: shown as the suggestion plus alternatives. */
export const KEEP_CANDIDATES = 5;

export interface MatchDeps {
  openai: OpenAIClient;
  model: string;
  repository: PinRepository;
  /** Internal-only reference image URLs by pinhunt id (e.g. Pin & Pop). */
  referenceImages?: (pinhuntIds: string[]) => Promise<Record<string, string>>;
  /** Fetch one reference picture as an inline image (default: fetchReferenceImage). */
  fetchImage?: (url: string) => Promise<string | null>;
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

/**
 * Disney reuses the same character art across many pins (round, framed,
 * cut-out, with or without a dangle). The shared comparison prompt judges
 * "same shapes, colours, props" — the art — so a Rhino in a silver frame
 * matched a round Rhino pin at 98%. Board matching adds a format-first rule
 * and asks for "format_match" per candidate; a format mismatch is capped at
 * FORMAT_MISMATCH_MAX, below MATCH_VERIFIED_MIN, so it can't pass as a
 * checked match, be cleaned automatically or be approved in bulk.
 */
export const FORMAT_MISMATCH_MAX = 35;

export const FORMAT_RULES = `

FORMAT FIRST: Disney reuses the same character artwork on many different pins. Before comparing the artwork, compare each reference's FORMAT with the user's pin: the outline/shape (round, rectangular, picture frame, cut-out character), any frame or border and its metal colour (silver vs gold), dangles, chains, hinges, spinners or sliders, and how the art sits inside the pin. If the format differs — e.g. the same character art, but the user's pin is in a silver frame and the reference is a round pin, or the reference has a dangle the user's pin doesn't — it is a DIFFERENT pin: give it 35 or less, however similar the art. Parts of the user's pin hidden by the crop or glare are not differences.
For every candidate also return "format_match": true when its reference has the same format as the user's pin, false when it visibly differs, or null when it has no reference image.`;

/** Candidates the comparison said have a different format (format_match: false). */
export function formatMismatches(raw: string): Set<string> {
  const out = new Set<string>();
  try {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end <= start) return out;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Array<{ pinId?: unknown; format_match?: unknown }>;
    for (const m of Array.isArray(parsed) ? parsed : []) {
      if (typeof m?.pinId === "string" && m.format_match === false) out.add(m.pinId);
    }
  } catch {
    // unparseable: no mismatches known
  }
  return out;
}

/** Detail the model sees reference pictures at; "low" (~512 px) loses frame metal and small text. */
const referenceDetail = (): "low" | "high" => (process.env.BOARD_REFERENCE_DETAIL === "low" ? "low" : "high");

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
  let problem: string | null = null;
  /** Candidates whose own picture the comparison was shown. */
  let pictured = new Set<string>();
  const decision = verifyDecision(matches);
  if (decision === "compare" || (decision === "confident" && alwaysCompare())) {
    let internal: Record<string, string> = {};
    if (deps.referenceImages) {
      try {
        internal = await deps.referenceImages(matches.map((m) => m.pinId));
      } catch (err) {
        problem = "Couldn't look up reference pictures, so the match wasn't checked against a picture.";
        console.warn("[board-scan] reference lookup failed:", err instanceof Error ? err.message : err);
      }
    }
    const fetchImage = deps.fetchImage ?? fetchReferenceImage;
    const wanted = matches
      .map((m) => ({ m, url: byId.get(m.pinId)?.imageUrl || internal[m.pinId] }))
      .filter((r): r is { m: PinMatch; url: string } => !!r.url)
      .slice(0, maxReferences());
    // Downloaded here, so one picture that can't be fetched is left out instead of failing the check.
    const refs = (await Promise.all(wanted.map(async (r) => ({ m: r.m, url: await fetchImage(r.url) }))))
      .filter((r): r is { m: PinMatch; url: string } => !!r.url);
    if (wanted.length === 0 && !problem) {
      problem = "No reference pictures were found for these candidates, so the match wasn't checked against a picture.";
    } else if (wanted.length > 0 && refs.length === 0) {
      problem = "The reference pictures couldn't be downloaded, so the match wasn't checked against a picture.";
    }
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
          content.push({ type: "image_url", image_url: { url: r.url, detail: referenceDetail() } });
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
            { role: "system", content: verifySystemPrompt(candidateList, matches.length) + FORMAT_RULES },
            { role: "user", content },
          ],
        }, { timeout, maxRetries: 0 }));
        addUsage(usage, verifyResp);
        const verifyRaw = verifyResp.choices[0]?.message?.content ?? "";
        const mismatched = formatMismatches(verifyRaw);
        const reranked = parseMatches(verifyRaw, validIds)
          .map((m) => (mismatched.has(m.pinId)
            ? { ...m, confidence: Math.min(m.confidence, FORMAT_MISMATCH_MAX), reasoning: `Different format from your pin. ${m.reasoning}`.trim() }
            : m))
          .sort((a, b) => b.confidence - a.confidence);
        if (reranked.length > 0) {
          matches = reranked;
          verified = true;
          pictured = withRef;
        }
      } catch (err) {
        // The match still stands on its ranking, but the reviewer is told why it wasn't checked.
        problem = `The picture check failed (${err instanceof Error ? err.message.slice(0, 120) : "error"}), so the match wasn't checked against a picture.`;
        console.warn("[board-scan] reference comparison failed, using ranking:", err instanceof Error ? err.message : err);
      }
    }
  }

  const candidates: MatchCandidate[] = matches.slice(0, KEEP_CANDIDATES).map((m) => {
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
  })
    // Order after the caps: an unchecked 88 capped to 60 mustn't stay above a checked 80.
    .sort((a, b) => b.confidence - a.confidence || Number(b.verified) - Number(a.verified));
  const top = candidates[0]?.confidence ?? 0;
  const min = candidates[0]?.verified ? MATCH_VERIFIED_MIN : MATCH_PLAUSIBLE_MIN;
  return { status: top >= min ? "suggested" : "unmatched", candidates, verified, problem };
}
