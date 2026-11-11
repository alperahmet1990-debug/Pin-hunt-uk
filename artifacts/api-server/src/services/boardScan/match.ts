/**
 * Board scanning — step 2: match one cropped pin to the catalogue.
 *
 * The same recognition as the single-pin scan (routes/scan.ts): catalogue
 * search (services/scanCandidates.ts), the shared ranking prompt, and, when
 * the ranking is unsure, a comparison with reference images
 * (services/pinRank.ts, services/scanVerify.ts). Detection already
 * described the pin, so there is no separate describe call per crop.
 *
 * Reference images may include Pin & Pop images. Those are used here only
 * for internal recognition (permitted by the Pin & Pop agreement) — they are
 * never returned in candidates, stored as crops or published.
 */
import type { CataloguePin, PinRepository } from "@workspace/pin-repository";
import { findCandidates } from "../scanCandidates";
import { withScanReasoning } from "../scanReasoning";
import { verifyDecision, VERIFY_MAX_REFERENCES } from "../scanVerify";
import { buildCatalogueText, parseMatches, rankSystemPrompt, verifySystemPrompt, type PinMatch } from "../pinRank";
import { addUsage, type DetectedPin, type OpenAIClient, type TokenUsage } from "./detect";

export interface MatchCandidate {
  pinId: string;
  title: string;
  collection: string;
  /** The pin's public catalogue photo, if it has one. */
  imageUrl: string | null;
  confidence: number;
  reasoning: string;
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
): Promise<CropMatch> {
  const timeout = deps.timeoutMs ?? 45_000;
  const textTerms = detected.text ? [detected.text] : [];
  const catalogue = (await findCandidates(deps.repository, detected, textTerms)).slice(0, maxCandidates());
  if (catalogue.length === 0) return { status: "unmatched", candidates: [], verified: false };

  const byId = new Map<string, CataloguePin>(catalogue.map((p) => [p.id, p]));
  const validIds = new Set(byId.keys());
  const photo = `data:image/jpeg;base64,${crop.toString("base64")}`;
  const hint = detected.text
    ? `\n\nADDITIONAL SIGNALS from image analysis (use as strong hints, especially any text that matches a pin title or edition):\nText seen on the pin: "${detected.text}"`
    : "";

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
  if (verifyDecision(matches) === "compare") {
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
        }
      } catch (err) {
        // Comparison is optional, same as the single-pin scan.
        console.warn("[board-scan] reference comparison failed, using ranking:", err instanceof Error ? err.message : err);
      }
    }
  }

  const candidates: MatchCandidate[] = matches.slice(0, 3).map((m) => {
    const p = byId.get(m.pinId)!;
    return {
      pinId: p.id,
      title: p.title,
      collection: p.collection,
      imageUrl: p.imageUrl ?? null,
      confidence: m.confidence,
      reasoning: m.reasoning,
    };
  });
  const top = candidates[0]?.confidence ?? 0;
  return { status: top >= MATCH_PLAUSIBLE_MIN ? "suggested" : "unmatched", candidates, verified };
}
