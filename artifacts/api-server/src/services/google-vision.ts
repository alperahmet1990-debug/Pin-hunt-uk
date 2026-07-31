/**
 * Google Cloud Vision signals for the pin-scan pipeline.
 *
 * Extracts OCR text, logo names, web entities and best-guess labels from a
 * photo. Entirely best-effort: when credentials are missing, the API errors,
 * or the call takes too long, callers get `null` and the scan pipeline runs
 * exactly as before.
 */
import { ImageAnnotatorClient } from "@google-cloud/vision";

export interface VisionSignals {
  ocrText: string;
  /** Short OCR lines that look like pin text (names/editions, not noise). */
  ocrLines: string[];
  logos: string[];
  webEntities: string[];
  bestGuessLabels: string[];
}

let client: ImageAnnotatorClient | null = null;
let unavailable = false;

function getClient(): ImageAnnotatorClient | null {
  if (unavailable) return null;
  if (!client) {
    const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!raw) {
      unavailable = true;
      return null;
    }
    try {
      const credentials = JSON.parse(raw) as {
        project_id?: string;
        client_email: string;
        private_key: string;
      };
      client = new ImageAnnotatorClient({ credentials, projectId: credentials.project_id });
    } catch (err) {
      console.warn("[google-vision] invalid credentials JSON:", err);
      unavailable = true;
      return null;
    }
  }
  return client;
}

/** Words that never help a catalogue search. */
const GENERIC_TERMS = new Set([
  "pin", "pins", "badge", "badges", "brooch", "enamel pin", "lapel pin",
  "product", "metal", "jewellery", "jewelry", "accessory", "fashion accessory",
  "collectable", "collectible", "font", "logo", "brand", "trademark",
]);

function cleanTerm(term: string): string {
  return term.replace(/\s+/g, " ").trim();
}

function isUsefulTerm(term: string): boolean {
  const t = term.toLowerCase();
  if (t.length < 3 || t.length > 60) return false;
  if (GENERIC_TERMS.has(t)) return false;
  return /[a-z]{3}/i.test(t);
}

/**
 * Run Vision with a hard time budget. Resolves `null` on any failure or
 * timeout so the scan pipeline never waits on or breaks because of Vision.
 */
export async function getVisionSignals(
  imageBase64: string,
  timeoutMs = 6000,
): Promise<VisionSignals | null> {
  const vision = getClient();
  if (!vision) return null;

  try {
    const call = (async (): Promise<VisionSignals | null> => {
      const [result] = await vision.annotateImage({
        image: { content: imageBase64 },
        features: [
          { type: "TEXT_DETECTION" },
          { type: "LOGO_DETECTION", maxResults: 5 },
          { type: "WEB_DETECTION", maxResults: 12 },
        ],
      });
      if (result.error?.message) {
        console.warn("[google-vision] API error:", result.error.message);
        return null;
      }

      const ocrText = result.textAnnotations?.[0]?.description?.trim() ?? "";
      const ocrLines = ocrText
        .split("\n")
        .map(cleanTerm)
        .filter((l) => l.length >= 3 && l.length <= 40 && /[a-zA-Z]{3}/.test(l))
        .slice(0, 8);

      const logos = (result.logoAnnotations ?? [])
        .map((l) => cleanTerm(l.description ?? ""))
        .filter(isUsefulTerm)
        .slice(0, 5);

      const web = result.webDetection ?? {};
      const webEntities = (web.webEntities ?? [])
        .filter((e) => e.description && (typeof e.score !== "number" || e.score >= 0.3))
        .map((e) => cleanTerm(e.description!))
        .filter(isUsefulTerm)
        .slice(0, 8);

      const bestGuessLabels = (web.bestGuessLabels ?? [])
        .map((l) => cleanTerm(l.label ?? ""))
        .filter(isUsefulTerm)
        .slice(0, 3);

      return { ocrText, ocrLines, logos, webEntities, bestGuessLabels };
    })();

    const timeout = new Promise<null>((resolve) => {
      const t = setTimeout(() => resolve(null), timeoutMs);
      t.unref?.();
    });

    return await Promise.race([call, timeout]);
  } catch (err) {
    console.warn("[google-vision] request failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Distil Vision signals into extra catalogue search terms, most specific
 * first: OCR lines (actual text on the pin), then best-guess labels, then
 * web entities and logos.
 */
export function visionSearchTerms(signals: VisionSignals): string[] {
  const terms = new Set<string>();
  for (const line of signals.ocrLines) if (isUsefulTerm(line)) terms.add(line);
  for (const label of signals.bestGuessLabels) terms.add(label);
  for (const e of signals.webEntities) terms.add(e);
  for (const l of signals.logos) terms.add(l);
  return [...terms].slice(0, 10);
}
