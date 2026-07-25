import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  createSupabasePinRepository,
  type CataloguePin,
  type PinRepository,
} from "@workspace/pin-repository";

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
      (p) =>
        `ID: ${p.id} | "${p.title}" | ${p.brand} | ${p.collection}` +
        ` | Characters: ${p.characters.join(", ") || "none"}` +
        ` | ${p.edition ?? "Open Edition"}`,
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
async function findCandidates(description: {
  characters: string[];
  keywords: string[];
}): Promise<CataloguePin[]> {
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
  for (const term of [...description.characters, ...description.keywords].slice(0, 8)) {
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

router.post("/scan/identify", async (req, res) => {
  const { imageBase64, mimeType = "image/jpeg" } = req.body as {
    imageBase64: string;
    mimeType?: string;
  };

  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  if (!repository) {
    res.status(503).json({ error: "Pin catalogue is not available yet." });
    return;
  }

  try {
    // ── Stage 1: describe the pin in the photo ──
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
    if (description.characters.length === 0 && description.keywords.length === 0) {
      console.log("[scan] stage-1 raw content:", JSON.stringify(describeResp.choices[0]?.message?.content ?? null), "finish:", describeResp.choices[0]?.finish_reason);
    }

    // ── Stage 2: search the full catalogue for candidates, then rank ──
    const catalogue = await findCandidates(description);
    if (catalogue.length === 0) {
      res.status(503).json({
        error: "Pin catalogue is empty. Connect Supabase and seed the database first.",
      });
      return;
    }
    const catalogueText = buildCatalogueText(catalogue);

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `You are an expert Disney enamel pin identifier with deep knowledge of Disney Parks, Loungefly, and BoxLunch pin collections.

You will be shown a photo of a Disney enamel pin. Your job is to identify it from the catalogue below and return the top 3 most likely matches.

PIN CATALOGUE:
${catalogueText}

Respond with ONLY a valid JSON array of exactly 3 objects, no markdown, no explanation outside the JSON:
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
              text: "Please identify this Disney pin and return the top 3 matches as JSON.",
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
        matches = Array.isArray(parsed) ? parsed.slice(0, 3) : [];
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

    res.json({ matches });
  } catch (err) {
    console.error("[scan] Vision analysis error:", err);
    res.status(500).json({ error: "Vision analysis failed. Please try again." });
  }
});

export default router;
