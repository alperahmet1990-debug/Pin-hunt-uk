/**
 * The ranking and photo-comparison steps of pin recognition, shared by the
 * single-pin scan (routes/scan.ts) and board scanning (services/boardScan).
 *
 * Both experiences identify a pin the same way: search the catalogue for
 * candidates, ask the model to rank them against the photo, then (when the
 * ranking is unsure) compare the photo with reference images. Only the
 * photo differs — a board scan sends one crop per pin.
 */
import type { CataloguePin } from "@workspace/pin-repository";

export interface PinMatch {
  pinId: string;
  confidence: number;
  reasoning: string;
}

export function buildCatalogueText(pins: CataloguePin[]): string {
  return pins
    .map(
      (p) => {
        const chars = [...new Set([
          ...(p.mainCharacter ? [p.mainCharacter] : []),
          ...p.characters,
          ...(p.allCharacters ?? "").split(/[;,]/).map(c => c.trim()).filter(Boolean),
        ])];
        return `ID: ${p.id} | "${p.title}" | ${p.brand} | ${p.collection}` +
          ` | Characters: ${chars.join(", ") || "none"}` +
          ` | ${p.edition ?? "Open Edition"}`;
      },
    )
    .join("\n");
}

/** System prompt for the ranking step. `photoContext` is extra framing for crops. */
export function rankSystemPrompt(catalogueText: string, visionHintText: string, photoContext = ""): string {
  return `You are an expert Disney enamel pin identifier with deep knowledge of Disney Parks, Loungefly, and BoxLunch pin collections.

You will be shown a photo of a Disney enamel pin. Your job is to identify it from the catalogue below and return the top 5 most likely matches.${photoContext}

PIN CATALOGUE:
${catalogueText}${visionHintText}

Respond with ONLY a valid JSON array of exactly 5 objects, no markdown, no explanation outside the JSON:
[
  { "pinId": "<id from catalogue>", "confidence": <0-100 integer>, "reasoning": "<1 sentence why>" },
  ...
]

If the image is unclear, not a Disney pin, or doesn't match any pin well, still return 3 entries with low confidence scores (under 40). Always pick the best visual matches available — look at characters, colour palette, shape, brand style, and any visible text.`;
}

/** System prompt for the comparison step. */
export function verifySystemPrompt(candidateList: string, candidateCount: number): string {
  return `You verify Disney pin identifications by comparing photos. Candidates:
  ${candidateList}

  Where a reference image is shown, compare it DIRECTLY to the user's pin photo — same shapes, colours, props and layout means a match; visible differences mean it is NOT that pin, no matter how similar the text sounds. Candidates without reference images keep roughly their original plausibility.
  Respond with ONLY a JSON array re-ranking all ${candidateCount} candidates, best first:
  [ { "pinId": "<id>", "confidence": <0-100>, "reasoning": "<1 sentence>" }, ... ]
  Give a confidence above 85 only when a reference image visually confirms the match.`;
}

/**
 * Parse a model's JSON array of matches, keeping only known pin ids and
 * the first occurrence of each. Returns [] for anything unparseable.
 */
export function parseMatches(raw: string, validIds: ReadonlySet<string>, limit = Infinity): PinMatch[] {
  let parsed: unknown;
  try {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end <= start) return [];
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: PinMatch[] = [];
  for (const m of parsed.slice(0, limit) as Array<Partial<PinMatch>>) {
    if (!m || typeof m.pinId !== "string" || !validIds.has(m.pinId) || seen.has(m.pinId)) continue;
    seen.add(m.pinId);
    const confidence = Number(m.confidence);
    out.push({
      pinId: m.pinId,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 0,
      reasoning: typeof m.reasoning === "string" ? m.reasoning : "",
    });
  }
  return out;
}
