import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  createSupabasePinRepository,
  type CataloguePin,
  type PinRepository,
} from "@workspace/pin-repository";
import {
  getVisionSignals,
  visionSearchTerms,
  type VisionSignals,
} from "../services/google-vision";

const router: IRouter = Router();

// ── Repository ────────────────────────────────────────────────────────────────
// Created once per server process. Falls back gracefully when Supabase
// credentials are not yet configured (during initial setup).

function makeRepository(): PinRepository | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabasePinRepository(url, key);
}

const repository: PinRepository | null = makeRepository();

// ── Catalogue helpers ─────────────────────────────────────────────────────────

function buildCatalogueText(pins: CataloguePin[]): string {
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

/**
 * Find candidate pins for what the vision model saw in the photo.
 *
 * The catalogue is ~13k pins — far too many to hand to the model — so we
 * first describe the pin (stage 1), then search the catalogue by the
 * characters and keywords seen, and only rank those candidates (stage 2).
 */
async function findCandidates(
  description: {
    characters: string[];
    keywords: string[];
  },
  visionTerms: string[] = [],
): Promise<CataloguePin[]> {
  if (!repository) {
    console.warn("[scan] Supabase not configured.");
    return [];
  }
  const byId = new Map<string, CataloguePin>();
  const add = (pins: CataloguePin[]) => {
    for (const p of pins) if (!byId.has(p.id)) byId.set(p.id, p);
  };

  // Character matches are the strongest signal.
  for (const character of description.characters.slice(0, 4)) {
    try {
      add(await repository.searchPins("", { status: "active", character, limit: 120 }));
    } catch { /* keep going with other terms */ }
    if (byId.size >= 350) break;
  }
  // Character names + keywords against title/brand/collection.
  // Vision-derived terms (OCR text, web entities) go right after the AI
  // keywords — text read off the pin is a strong catalogue signal.
  for (const term of [
    ...description.characters,
    ...description.keywords,
    ...visionTerms,
  ].slice(0, 14)) {
    if (byId.size >= 350) break;
    if (term.trim().length < 3) continue;
    try {
      add(await repository.searchPins(term.trim(), { status: "active", limit: 80 }));
    } catch { /* keep going */ }
  }
  // Last resort so the scan still returns something rather than erroring.
  if (byId.size === 0) {
    add(await repository.searchPins("", { status: "active", limit: 300 }));
  }
  return [...byId.values()].slice(0, 350);
}

// ── POST /scan/identify ───────────────────────────────────────────────────────

interface ScanMatch {
  pinId: string;
  confidence: number;
  reasoning: string;
}

/** User-facing summary of what the scan understood from the photo. */
interface ImageInsights {
  /** Characters the AI thinks are on/represented by the pin. */
  characters: string[];
  /** Descriptive keywords from the AI (object type, series guesses). */
  keywords: string[];
  /** Exact text Google Vision read off the pin (OCR), if any. */
  textOnPin: string | null;
  /** Logos Google Vision recognised (e.g. Disney, Loungefly). */
  logos: string[];
  /** Google Vision web-detection guesses (best-guess labels + entities). */
  webGuesses: string[];
}

function buildImageInsights(
  description: { characters: string[]; keywords: string[] },
  signals: VisionSignals | null,
): ImageInsights {
  const dedupe = (arr: string[]) => {
    const seen = new Set<string>();
    return arr.filter((s) => {
      const k = s.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  return {
    characters: dedupe(description.characters).slice(0, 4),
    keywords: dedupe(description.keywords).slice(0, 8),
    textOnPin: signals?.ocrText
      ? signals.ocrText.replace(/\s+/g, " ").trim().slice(0, 200) || null
      : null,
    logos: dedupe(signals?.logos ?? []).slice(0, 4),
    webGuesses: dedupe([
      ...(signals?.bestGuessLabels ?? []),
      ...(signals?.webEntities ?? []),
    ]).slice(0, 6),
  };
}

/** Require a valid signed-in Supabase user (Bearer token). */
async function requireUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: "Sign in to identify pins" });
    return;
  }
  try {
    const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }
    (req as Request & { userId?: string }).userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: "Authentication failed" });
  }
}

// Per-user cooldown: the scan runs up to 3 AI calls, so rapid retries are
// expensive. One scan per user every 5 seconds is plenty for real use.
const SCAN_COOLDOWN_MS = 5_000;
const MAX_IMAGE_BASE64_CHARS = 8_000_000; // ~6MB image
const lastScanAt = new Map<string, number>();

router.post("/scan/identify", requireUser, async (req, res) => {
  const { imageBase64, mimeType = "image/jpeg" } = req.body as {
    imageBase64: string;
    mimeType?: string;
  };

  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    res.status(413).json({ error: "Photo is too large — please retake it." });
    return;
  }
  const userId = (req as Request & { userId?: string }).userId ?? "unknown";
  const last = lastScanAt.get(userId);
  if (last && Date.now() - last < SCAN_COOLDOWN_MS) {
    res.status(429).json({ error: "One moment — please wait a few seconds between scans." });
    return;
  }
  lastScanAt.set(userId, Date.now());
  if (lastScanAt.size > 5000) lastScanAt.clear();

  if (!repository) {
    res.status(503).json({ error: "Pin catalogue is not available yet." });
    return;
  }

  try {
    // ── Stage 1: describe the pin in the photo ──
    // Google Vision (OCR + web detection) runs in parallel with the AI
    // describe call — it adds no latency and is entirely best-effort.
    const visionPromise: Promise<VisionSignals | null> = getVisionSignals(imageBase64).catch(
      () => null,
    );
    const describeResp = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content: `You identify Disney enamel pins. Look at the photo and return ONLY valid JSON (no markdown):
{ "characters": ["<Disney character names>"], "keywords": ["<search terms: series/collection name guesses, visible text, distinctive objects>"] }

IMPORTANT: many Disney pins are objects THEMED after a character (a dessert, dress, ear hat or flower in a character's colours with their signature props) without showing the character's face. Read the props and palette: e.g. a fan + comb + jade green suggests Mulan; a glass slipper + powder blue suggests Cinderella. Include your best character guesses in "characters" even when no face is visible — up to 4, most likely first.
For keywords, include the object type AND close synonyms/series words (e.g. macaron → pastry, pastries, treats, dessert). Up to 8 keywords. Use empty arrays only if you truly cannot tell.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" },
            },
            { type: "text", text: "Describe this pin as JSON." },
          ],
        },
      ],
    });

    let description = { characters: [] as string[], keywords: [] as string[] };
    try {
      const raw = describeResp.choices[0]?.message?.content ?? "{}";
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      const parsed = s !== -1 && e > s ? JSON.parse(raw.slice(s, e + 1)) : {};
      description = {
        characters: Array.isArray(parsed.characters) ? parsed.characters.map(String) : [],
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
      };
    } catch { /* fall through with empty description */ }
    console.log("[scan] stage-1 description:", JSON.stringify(description));

    const visionSignals = await visionPromise;
    const visionTerms = visionSignals ? visionSearchTerms(visionSignals) : [];
    if (visionSignals) {
      console.log("[scan] vision signals:", JSON.stringify({
        ocrLines: visionSignals.ocrLines,
        bestGuessLabels: visionSignals.bestGuessLabels,
        webEntities: visionSignals.webEntities,
        logos: visionSignals.logos,
      }));
    }
    if (description.characters.length === 0 && description.keywords.length === 0) {
      console.log("[scan] stage-1 raw content:", JSON.stringify(describeResp.choices[0]?.message?.content ?? null), "finish:", describeResp.choices[0]?.finish_reason);
    }

    // ── Stage 2: search the full catalogue for candidates, then rank ──
    const catalogue = await findCandidates(description, visionTerms);
    if (catalogue.length === 0) {
      res.status(503).json({
        error: "Pin catalogue is empty. Connect Supabase and seed the database first.",
      });
      return;
    }
    const catalogueText = buildCatalogueText(catalogue);

    // Vision hints for the ranking prompt: real text read off the pin plus
    // web-detection guesses. Kept short so the prompt stays bounded.
    const visionHintLines: string[] = [];
    if (visionSignals?.ocrText) {
      visionHintLines.push(`Text read off the pin by OCR: "${visionSignals.ocrText.replace(/\s+/g, " ").slice(0, 200)}"`);
    }
    const webGuesses = [
      ...(visionSignals?.bestGuessLabels ?? []),
      ...(visionSignals?.webEntities ?? []),
      ...(visionSignals?.logos ?? []),
    ].slice(0, 8);
    if (webGuesses.length > 0) {
      visionHintLines.push(`Web image search suggests: ${webGuesses.join(", ")}`);
    }
    const visionHintText = visionHintLines.length > 0
      ? `\n\nADDITIONAL SIGNALS from image analysis (use as strong hints, especially any text that matches a pin title or edition):\n${visionHintLines.join("\n")}`
      : "";

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `You are an expert Disney enamel pin identifier with deep knowledge of Disney Parks, Loungefly, and BoxLunch pin collections.

You will be shown a photo of a Disney enamel pin. Your job is to identify it from the catalogue below and return the top 5 most likely matches.

PIN CATALOGUE:
${catalogueText}${visionHintText}

Respond with ONLY a valid JSON array of exactly 5 objects, no markdown, no explanation outside the JSON:
[
  { "pinId": "<id from catalogue>", "confidence": <0-100 integer>, "reasoning": "<1 sentence why>" },
  ...
]

If the image is unclear, not a Disney pin, or doesn't match any pin well, still return 3 entries with low confidence scores (under 40). Always pick the best visual matches available — look at characters, colour palette, shape, brand style, and any visible text.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: "Please identify this Disney pin and return the top 5 matches as JSON.",
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "[]";

    let matches: ScanMatch[] = [];
    try {
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        matches = Array.isArray(parsed) ? parsed.slice(0, 5) : [];
      }
    } catch (parseErr) {
      console.error(
        "[scan] JSON parse error from model response:",
        parseErr,
        "\nRaw:",
        raw,
      );
      matches = [];
    }

    // Validate each match has a known pinId from the live catalogue,
    // and never return the same pin twice.
    const validIds = new Set(catalogue.map((p) => p.id));
    const seen = new Set<string>();
    matches = matches.filter((m) => {
      if (!validIds.has(m.pinId) || seen.has(m.pinId)) return false;
      seen.add(m.pinId);
      return true;
    });

    // ── Stage 3: visual verification against real catalogue images ──
    // When any candidate has a stored catalogue photo, show the model the
    // user's photo alongside those reference images and let it re-rank.
    // Text metadata alone confuses similar pins (e.g. every Princess
    // Pastries macaron shares the same collection description).
    const byPinId = new Map(catalogue.map((p) => [p.id, p]));

    // Pull in same-collection siblings that have real catalogue images.
    // Similar pins in one collection (e.g. all Princess Pastries macarons)
    // are indistinguishable by text, so any sibling with a photo must be
    // shown to the model even if the text ranking missed it.
    const topCollections = [...new Set(
      matches.slice(0, 3).map((m) => byPinId.get(m.pinId)?.collection).filter(Boolean),
    )] as string[];
    for (const collection of topCollections.slice(0, 2)) {
      try {
        const siblings = await repository.searchPins("", { status: "active", collection, limit: 50 });
        for (const s of siblings) {
          if (!s.imageUrl || byPinId.has(s.id) && matches.some((m) => m.pinId === s.id)) continue;
          byPinId.set(s.id, s);
          if (!matches.some((m) => m.pinId === s.id)) {
            matches.push({ pinId: s.id, confidence: 30, reasoning: "Same collection — has a reference image for comparison." });
          }
        }
      } catch { /* siblings are best-effort */ }
    }
    validIds.clear();
    for (const id of byPinId.keys()) validIds.add(id);
    // Hard cap the rerank candidate list to keep stage-3 prompts bounded.
    matches = matches.slice(0, 10);

    const withImages = matches
      .map((m) => ({ match: m, pin: byPinId.get(m.pinId)! }))
      .filter((c) => !!c.pin?.imageUrl)
      .slice(0, 6);

    if (withImages.length > 0) {
      try {
        const refContent: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } }
        > = [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" },
          },
          { type: "text", text: "Photo above is the USER'S PIN. Reference images follow:" },
        ];
        for (const c of withImages) {
          refContent.push({ type: "text", text: `Reference for ${c.pin.id} — "${c.pin.title}" (${c.pin.collection}):` });
          refContent.push({ type: "image_url", image_url: { url: c.pin.imageUrl!, detail: "low" } });
        }
        refContent.push({
          type: "text",
          text: "Compare the user's pin to each reference image and re-rank ALL candidates as JSON.",
        });

        const candidateList = matches
          .map((m) => {
            const p = byPinId.get(m.pinId)!;
            return `${p.id} | "${p.title}" | ${p.collection} | reference image: ${p.imageUrl ? "YES (shown below)" : "no image available"}`;
          })
          .join("\n");

        const verifyResp = await openai.chat.completions.create({
          model: "gpt-5.6-luna",
          max_completion_tokens: 1024,
          messages: [
            {
              role: "system",
              content: `You verify Disney pin identifications by comparing photos. Candidates:
${candidateList}

Where a reference image is shown, compare it DIRECTLY to the user's pin photo — same shapes, colours, props and layout means a match; visible differences mean it is NOT that pin, no matter how similar the text sounds. Candidates without reference images keep roughly their original plausibility.
Respond with ONLY a JSON array re-ranking all ${matches.length} candidates, best first:
[ { "pinId": "<id>", "confidence": <0-100>, "reasoning": "<1 sentence>" }, ... ]
Give a confidence above 85 only when a reference image visually confirms the match.`,
            },
            { role: "user", content: refContent },
          ],
        });

        const vraw = verifyResp.choices[0]?.message?.content ?? "[]";
        const vs = vraw.indexOf("[");
        const ve = vraw.lastIndexOf("]");
        if (vs !== -1 && ve > vs) {
          const reranked = (JSON.parse(vraw.slice(vs, ve + 1)) as ScanMatch[]).filter(
            (m) => validIds.has(m.pinId),
          );
          const rerankedSeen = new Set<string>();
          const deduped = reranked.filter((m) => {
            if (rerankedSeen.has(m.pinId)) return false;
            rerankedSeen.add(m.pinId);
            return true;
          });
          if (deduped.length > 0) matches = deduped;
        }
      } catch (verifyErr) {
        console.warn("[scan] visual verification failed, using text ranking:", verifyErr);
      }
    }

    res.json({
      matches: matches.slice(0, 3),
      imageInsights: buildImageInsights(description, visionSignals),
    });
  } catch (err) {
    console.error("[scan] Vision analysis error:", err);
    res.status(500).json({ error: "Vision analysis failed. Please try again." });
  }
});

export default router;
