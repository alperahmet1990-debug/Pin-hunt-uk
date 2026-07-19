import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// Compact pin catalogue — used in the vision prompt so the model can match
const PIN_CATALOGUE = [
  { id: "dp-001", title: "Mickey Classic Silhouette", brand: "Disney Parks", collection: "Classics 2024", characters: ["Mickey Mouse"], edition: "Open Edition" },
  { id: "dp-002", title: "Minnie Bow & Polka Dot", brand: "Disney Parks", collection: "Classics 2024", characters: ["Minnie Mouse"], edition: "Open Edition" },
  { id: "dp-003", title: "Castle Fireworks Night", brand: "Disney Parks", collection: "Park Icons", characters: [], edition: "LE 2500" },
  { id: "dp-004", title: "Tinker Bell Sparkle Trail", brand: "Disney Parks", collection: "Fairy Tale Friends", characters: ["Tinker Bell"], edition: "Open Edition" },
  { id: "dp-005", title: "Stitch Aloha Hawaiian", brand: "Disney Parks", collection: "Tropical Vibes", characters: ["Stitch"], edition: "Open Edition" },
  { id: "dp-006", title: "Dumbo Blue Sky Journey", brand: "Disney Parks", collection: "Park Icons", characters: ["Dumbo"], edition: "Open Edition" },
  { id: "dp-007", title: "Haunted Mansion Hitchhikers", brand: "Disney Parks", collection: "Haunted Mansion 50th", characters: ["Hitchhiking Ghosts"], edition: "LE 1500" },
  { id: "dp-008", title: "Space Mountain Star Blazer", brand: "Disney Parks", collection: "Tomorrowland", characters: [], edition: "LE 3000" },
  { id: "dp-009", title: "Pirates Treasure Trove", brand: "Disney Parks", collection: "Adventure Seas", characters: ["Jack Sparrow"], edition: "Open Edition" },
  { id: "dp-010", title: "Winnie Honey Time", brand: "Disney Parks", collection: "Hundred Acre Friends", characters: ["Winnie the Pooh"], edition: "Open Edition" },
  { id: "lf-001", title: "Wonderland Tea Party", brand: "Loungefly", collection: "Storybook Series Vol. 1", characters: ["Alice", "Mad Hatter"], edition: "Open Edition" },
  { id: "lf-002", title: "Ariel's Sea Garden", brand: "Loungefly", collection: "Undersea Dreams", characters: ["Ariel"], edition: "Open Edition" },
  { id: "lf-003", title: "Belle's Library Rose", brand: "Loungefly", collection: "Enchanted Series", characters: ["Belle", "Beast"], edition: "LE 2000" },
  { id: "lf-004", title: "Aurora's Golden Dream", brand: "Loungefly", collection: "Storybook Series Vol. 1", characters: ["Aurora", "Maleficent"], edition: "Open Edition" },
  { id: "lf-005", title: "Snow White Apple Garden", brand: "Loungefly", collection: "Storybook Series Vol. 2", characters: ["Snow White", "Evil Queen"], edition: "Open Edition" },
  { id: "bl-001", title: "Simba's Pride Dawn", brand: "BoxLunch", collection: "Circle of Life", characters: ["Simba", "Mufasa"], edition: "Open Edition" },
  { id: "bl-002", title: "Aladdin's Magic Journey", brand: "BoxLunch", collection: "Desert Nights", characters: ["Aladdin", "Jasmine", "Genie"], edition: "Open Edition" },
  { id: "bl-003", title: "Mulan Cherry Blossom", brand: "BoxLunch", collection: "Warriors & Legends", characters: ["Mulan", "Mushu"], edition: "LE 1800" },
  { id: "bl-004", title: "Moana Wave Rider", brand: "BoxLunch", collection: "Ocean Explorers", characters: ["Moana", "Maui"], edition: "Open Edition" },
  { id: "bl-005", title: "Raya Dragon Heart", brand: "BoxLunch", collection: "Warriors & Legends", characters: ["Raya", "Sisu"], edition: "LE 2200" },
];

const CATALOGUE_TEXT = PIN_CATALOGUE.map(
  (p) =>
    `ID: ${p.id} | "${p.title}" | ${p.brand} | ${p.collection} | Characters: ${p.characters.join(", ") || "none"} | ${p.edition}`
).join("\n");

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

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `You are an expert Disney enamel pin identifier with deep knowledge of Disney Parks, Loungefly, and BoxLunch pin collections.

You will be shown a photo of a Disney enamel pin. Your job is to identify it from the catalogue below and return the top 3 most likely matches with a confidence score.

PIN CATALOGUE:
${CATALOGUE_TEXT}

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
      // Extract the first JSON array found in the response, ignoring any
      // surrounding prose or markdown fences the model may have added
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        matches = Array.isArray(parsed) ? parsed.slice(0, 3) : [];
      }
    } catch (parseErr) {
      console.error("JSON parse error from model response:", parseErr, "\nRaw:", raw);
      matches = [];
    }

    // Validate each match has a known pinId
    const validIds = new Set(PIN_CATALOGUE.map((p) => p.id));
    matches = matches.filter((m) => validIds.has(m.pinId));

    res.json({ matches });
  } catch (err) {
    console.error("Scan identify error:", err);
    res.status(500).json({ error: "Vision analysis failed. Please try again." });
  }
});

export default router;
