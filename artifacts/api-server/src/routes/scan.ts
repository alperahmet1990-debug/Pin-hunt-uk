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

/** Fetch live catalogue from Supabase; fall back to empty list with a warning. */
async function getCatalogue(): Promise<CataloguePin[]> {
  if (!repository) {
    console.warn(
      "[scan] Supabase not configured — set SUPABASE_URL and SUPABASE_ANON_KEY " +
        "then POST /api/admin/seed-pins to populate the catalogue.",
    );
    return [];
  }
  return repository.searchPins("", { status: "active", limit: 500 });
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

  // Load the live catalogue — gives the AI accurate, up-to-date pin data
  const catalogue = await getCatalogue();

  if (catalogue.length === 0) {
    res.status(503).json({
      error:
        "Pin catalogue is empty. Connect Supabase and seed the database first.",
    });
    return;
  }

  const catalogueText = buildCatalogueText(catalogue);

  try {
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

    // Validate each match has a known pinId from the live catalogue
    const validIds = new Set(catalogue.map((p) => p.id));
    matches = matches.filter((m) => validIds.has(m.pinId));

    res.json({ matches });
  } catch (err) {
    console.error("[scan] Vision analysis error:", err);
    res.status(500).json({ error: "Vision analysis failed. Please try again." });
  }
});

export default router;
