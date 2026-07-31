/**
 * Vision Test — isolated proof of concept for Google Cloud Vision.
 *
 * POST /vision-test  (admin only)
 *   Body: { imageBase64: string, mimeType?: string }
 *   Returns OCR text, logo detection, web detection, and suggested
 *   search terms derived from the Vision results.
 *
 * Does not touch any other app functionality.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ImageAnnotatorClient } from "@google-cloud/vision";

const router: IRouter = Router();

// ── Auth (same pattern as other admin routes) ────────────────────────────────

let anonClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    anonClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  }
  return anonClient;
}

function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return adminClient;
}

async function requireAdmin(req: Request, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  try {
    const { data: { user }, error } = await getAnonClient().auth.getUser(auth.slice(7));
    if (error || !user) { res.status(401).json({ error: "Invalid token" }); return; }
    const { data: profile } = await getAdminClient()
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) { res.status(403).json({ error: "Admin access required" }); return; }
    next();
  } catch {
    res.status(500).json({ error: "Auth check failed" });
  }
}

// ── Vision client ─────────────────────────────────────────────────────────────

let visionClient: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
  if (!visionClient) {
    const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!raw) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set");
    const credentials = JSON.parse(raw) as { project_id?: string; client_email: string; private_key: string };
    visionClient = new ImageAnnotatorClient({
      credentials,
      projectId: credentials.project_id,
    });
  }
  return visionClient;
}

// ── Route ─────────────────────────────────────────────────────────────────────

const MAX_IMAGE_BASE64_CHARS = 8_000_000; // ~6MB image

router.post("/vision-test", requireAdmin, async (req: Request, res: Response) => {
  const { imageBase64 } = req.body as { imageBase64?: unknown };
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(imageBase64.slice(0, 1000))) {
    res.status(400).json({ error: "imageBase64 must be plain base64 (no data: prefix)" });
    return;
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    res.status(413).json({ error: "Image too large — please use a smaller photo" });
    return;
  }

  try {
    const client = getVisionClient();
    const [result] = await client.annotateImage({
      image: { content: imageBase64 },
      features: [
        { type: "TEXT_DETECTION" },
        { type: "LOGO_DETECTION", maxResults: 10 },
        { type: "WEB_DETECTION", maxResults: 15 },
      ],
    });

    if (result.error?.message) {
      res.status(502).json({ error: `Vision API error: ${result.error.message}` });
      return;
    }

    // OCR — first annotation is the full text block.
    const ocrText = result.textAnnotations?.[0]?.description?.trim() ?? "";

    const logos = (result.logoAnnotations ?? []).map((l) => ({
      description: l.description ?? "",
      score: typeof l.score === "number" ? Math.round(l.score * 100) : null,
    }));

    const web = result.webDetection ?? {};
    const webEntities = (web.webEntities ?? [])
      .filter((e) => e.description)
      .map((e) => ({
        description: e.description!,
        score: typeof e.score === "number" ? Number(e.score.toFixed(2)) : null,
      }));
    const bestGuessLabels = (web.bestGuessLabels ?? [])
      .map((l) => l.label)
      .filter((l): l is string => !!l);
    const pagesWithMatchingImages = (web.pagesWithMatchingImages ?? [])
      .slice(0, 8)
      .map((p) => ({ url: p.url ?? "", title: (p.pageTitle ?? "").replace(/<[^>]+>/g, "") }));
    const similarImages = (web.visuallySimilarImages ?? [])
      .slice(0, 8)
      .map((i) => i.url)
      .filter((u): u is string => !!u);

    // Suggested search terms: best-guess labels first, then top web entities
    // and logos, plus short OCR lines that look like pin text (not numbers).
    const terms = new Set<string>();
    for (const label of bestGuessLabels) terms.add(label);
    for (const e of webEntities.slice(0, 6)) terms.add(e.description);
    for (const l of logos) if (l.description) terms.add(l.description);
    for (const line of ocrText.split("\n")) {
      const t = line.trim();
      if (t.length >= 4 && t.length <= 40 && /[a-zA-Z]{3}/.test(t)) terms.add(t);
    }
    const suggestedSearchTerms = [...terms].slice(0, 12).map((t) =>
      /disney|pin/i.test(t) ? t : `${t} Disney pin`,
    );

    res.json({
      ocrText,
      logos,
      webDetection: {
        bestGuessLabels,
        webEntities,
        pagesWithMatchingImages,
        similarImages,
      },
      suggestedSearchTerms,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Vision request failed";
    console.error("[vision-test]", msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
