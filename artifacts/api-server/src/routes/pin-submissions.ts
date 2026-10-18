/**
 * Submit a brand-new pin to the catalogue — the user-facing "I scanned
 * something that's not in PinHunt yet" flow (scan.tsx's "can't find it"
 * link, and the standalone Add Pin screen) → add-pin.tsx.
 *
 * POST /pin-submissions/preview   Step 1: clean up the photo and show it.
 * POST /pin-submissions           Step 2: submit (with the previewed photo).
 *
 * Runs the front photo through Pixian.ai (services/pixian.ts) to normalize
 * it into a uniform catalogue thumbnail — solid white background, cropped
 * and centered — because it's what becomes the pin's public catalogue
 * image if an admin approves the submission (admin/pin/[id].tsx pre-fills
 * the new catalogue pin's image from this same photo). The Pixian API key
 * never reaches the client, which is why this upload happens server-side
 * rather than directly from the app to Supabase Storage (same reasoning as
 * contribute-pin-image.ts).
 *
 * Unlike contribute-pin-image.ts, this does NOT hard-fail when Pixian is
 * unreachable or unconfigured — adding a missing pin is a core flow, not an
 * optional nice-to-have, so a normalization outage falls back to storing
 * the raw photo rather than blocking the submission. An admin can still
 * review it either way.
 *
 * An optional back photo (#257) is stored as taken, with no clean-up and
 * no watermark: the backstamp is evidence for the admin who checks the pin,
 * kept in the same private bucket and never published automatically.
 *
 * Photo-only submissions (Early Contributor Programme, migration 047): the
 * front photo is the only required input. Name, brand and everything else
 * are optional; an unnamed submission is stored with NULLs and named by
 * the admin. When the app sends `rightsConfirmed` it must be true, and a
 * photo-only submission must send it. Older app builds that don't send it
 * at all still work (rights_confirmed_at stays NULL for them). The AI
 * scan's suggestions (`aiIdentification`) are stored, size-limited, as
 * hints for the admin's duplicate check — never trusted or published.
 *
 * Cost controls (services/usage-caps.ts): Pixian runs at most once per
 * identical photo (the preview is keyed by the photo's hash and reused),
 * and a daily per-user cap applies to clean-ups and submissions. Hitting
 * the clean-up cap never blocks a submission — the raw photo is kept.
 *
 * Auth: requireUser (any signed-in collector) — the row lands with status
 * 'submitted', ready for the admin review queue.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseUserRepository, type EditionType, type SubmissionAiIdentification } from "@workspace/pin-repository";
import { pixianConfigured, normalizePinPhoto } from "../services/pixian";
import { watermarkPinPhoto } from "../services/watermark";
import { imageHash, recordUsage, withinDailyCap } from "../services/usage-caps";

const router: IRouter = Router();

// ── Auth (same convention as scan.ts / contribute-pin-image.ts) ───────────────

interface UserRequest extends Request {
  userId?: string;
}

async function requireUser(req: UserRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: "Sign in to submit a pin" });
    return;
  }
  try {
    const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }
    req.userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: "Authentication failed" });
  }
}

// ── Service-role access for storage + the DB write ────────────────────────────

let storageClient: SupabaseClient | null = null;
function getStorageClient(): SupabaseClient {
  if (!storageClient) {
    storageClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return storageClient;
}

function getServiceUserRepository() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }
  return createSupabaseUserRepository(url, key);
}

const MAX_IMAGE_BASE64_CHARS = 8_000_000; // ~6MB image, same cap as /scan/identify

function generateSubmissionId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface SubmitPinBody {
  proposedName?: string;
  brand?: string;
  seriesName?: string;
  releaseLocation?: string;
  releaseYear?: number;
  editionType?: EditionType;
  editionSize?: number;
  facNumber?: string;
  sku?: string;
  characterNames?: string[];
  notes?: string;
  frontImageBase64?: string;
  mimeType?: string;
  /** From /pin-submissions/preview — submits that already-cleaned photo. */
  frontDraftPath?: string;
  /** Optional back of the pin (#257), stored as taken for the admin. */
  backImageBase64?: string;
  /** "I took this photo and PinHunt may use it" — see header. */
  rightsConfirmed?: boolean;
  /** What the AI scan suggested; sanitized by sanitizeAiIdentification(). */
  aiIdentification?: unknown;
}

const str = (v: unknown, max = 200): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

/**
 * Keep only the expected shape, bounded: up to 5 matches and 10
 * characters, short strings. Anything else is dropped rather than refused —
 * these are hints, and a malformed hint must never block a submission.
 */
export function sanitizeAiIdentification(raw: unknown): SubmissionAiIdentification | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: SubmissionAiIdentification = {};

  if (Array.isArray(r.matches)) {
    const matches = r.matches
      .map((m) => {
        const mm = (m ?? {}) as Record<string, unknown>;
        const pinId = str(mm.pinId, 64);
        const confidence = typeof mm.confidence === "number" && Number.isFinite(mm.confidence)
          ? Math.max(0, Math.min(100, Math.round(mm.confidence)))
          : 0;
        return pinId ? { pinId, confidence } : null;
      })
      .filter((m): m is { pinId: string; confidence: number } => m !== null)
      .slice(0, 5);
    if (matches.length) out.matches = matches;
  }

  if (r.suggested && typeof r.suggested === "object" && !Array.isArray(r.suggested)) {
    const sg = r.suggested as Record<string, unknown>;
    const suggested: NonNullable<SubmissionAiIdentification["suggested"]> = {
      name: str(sg.name),
      brand: str(sg.brand, 100),
      setName: str(sg.setName),
      characters: Array.isArray(sg.characters)
        ? sg.characters.map((c) => str(c, 80)).filter((c): c is string => !!c).slice(0, 10)
        : undefined,
    };
    if (!suggested.characters?.length) delete suggested.characters;
    for (const k of Object.keys(suggested) as Array<keyof typeof suggested>) {
      if (suggested[k] === undefined) delete suggested[k];
    }
    if (Object.keys(suggested).length) out.suggested = suggested;
  }

  return out.matches || out.suggested ? out : undefined;
}

/**
 * Why a photo wasn't cleaned up, so the app can say so: "off" when the
 * clean-up service isn't set up on this server (e.g. staging), "failed"
 * when it was tried and didn't work for this photo, "limit" when the
 * user's daily clean-up cap is used up (older apps show it as "failed").
 */
export type CleanupSkipped = "off" | "failed" | "limit";

/** Pixian-normalize, falling back to the raw photo (see header). */
async function normalizeOrRaw(
  rawBuffer: Buffer,
  mimeType: string,
  userId: string,
  sha256: string,
): Promise<{ buffer: Buffer; cleaned: boolean; cleanupSkipped?: CleanupSkipped }> {
  if (!pixianConfigured()) return { buffer: rawBuffer, cleaned: false, cleanupSkipped: "off" };
  if (!(await withinDailyCap(userId, "photo_cleanup"))) {
    return { buffer: rawBuffer, cleaned: false, cleanupSkipped: "limit" };
  }
  void recordUsage(userId, "photo_cleanup", sha256);
  try {
    return { buffer: await normalizePinPhoto(rawBuffer, mimeType), cleaned: true };
  } catch (err) {
    console.warn("[pin-submissions] Pixian normalization failed, using raw photo:", err);
    return { buffer: rawBuffer, cleaned: false, cleanupSkipped: "failed" };
  }
}

// Cleaned photos waiting for the submitter to confirm, in the private
// pin-submissions bucket. Each user keeps at most one — a new preview
// clears the old — so abandoned previews can't pile up. The file is named
// after the photo's hash, so previewing the same photo again (going back a
// step, a retry) reuses the cleaned result instead of paying Pixian twice.
const draftDir = (userId: string) => `${userId}/drafts`;
const CLEANED_SUFFIX = "-clean.jpg";

/**
 * POST /pin-submissions/preview
 *
 * Step 1: clean up the front photo and return it as it will appear in the
 * catalogue (watermarked), so the collector can confirm or retake before
 * submitting. Returns { draftPath, previewBase64, cleaned, cleanupSkipped? }.
 */
router.post("/pin-submissions/preview", requireUser, async (req: UserRequest, res: Response) => {
  try {
    const { frontImageBase64, mimeType = "image/jpeg" } = req.body as SubmitPinBody;
    if (!frontImageBase64) { res.status(400).json({ error: "frontImageBase64 is required" }); return; }
    if (frontImageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      res.status(413).json({ error: "Photo is too large — please retake it." });
      return;
    }
    const userId = req.userId!;
    const sha = imageHash(frontImageBase64);
    const bucket = getStorageClient().storage.from("pin-submissions");
    const { data: old } = await bucket.list(draftDir(userId));

    // Same photo, already cleaned: serve it again.
    const reusable = old?.find((f) => f.name === `${sha}${CLEANED_SUFFIX}`);
    if (reusable) {
      const reusePath = `${draftDir(userId)}/${reusable.name}`;
      const { data: blob } = await bucket.download(reusePath);
      if (blob) {
        const preview = await watermarkPinPhoto(Buffer.from(await blob.arrayBuffer()));
        res.json({ draftPath: reusePath, previewBase64: preview.toString("base64"), cleaned: true, reused: true });
        return;
      }
    }

    const { buffer, cleaned, cleanupSkipped } = await normalizeOrRaw(
      Buffer.from(frontImageBase64, "base64"), mimeType, userId, sha);
    if (old?.length) await bucket.remove(old.map((f) => `${draftDir(userId)}/${f.name}`));

    // Only a cleaned result is worth reusing; a raw one is retried next time.
    const draftPath = `${draftDir(userId)}/${cleaned ? `${sha}${CLEANED_SUFFIX}` : `${Date.now()}.jpg`}`;
    const { error } = await bucket.upload(draftPath, buffer, { contentType: "image/jpeg", upsert: false });
    if (error) {
      res.status(500).json({ error: `Could not store your photo: ${error.message}` });
      return;
    }
    const preview = await watermarkPinPhoto(buffer);
    res.json({ draftPath, previewBase64: preview.toString("base64"), cleaned, cleanupSkipped });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/pin-submissions", requireUser, async (req: UserRequest, res: Response) => {
  try {
    const {
      proposedName, brand, seriesName, releaseLocation, releaseYear,
      editionType, editionSize, facNumber, sku, characterNames, notes,
      frontImageBase64, mimeType = "image/jpeg", frontDraftPath, backImageBase64,
      rightsConfirmed, aiIdentification,
    } = req.body as SubmitPinBody;

    if (!frontImageBase64 && !frontDraftPath) { res.status(400).json({ error: "A front photo is required" }); return; }
    if (proposedName !== undefined && typeof proposedName !== "string") {
      res.status(400).json({ error: "proposedName must be a string" });
      return;
    }
    if (brand !== undefined && typeof brand !== "string") {
      res.status(400).json({ error: "brand must be a string" });
      return;
    }
    if (rightsConfirmed !== undefined && rightsConfirmed !== true) {
      res.status(400).json({ error: "Please confirm you took this photo and PinHunt may use it." });
      return;
    }
    if (!proposedName?.trim() && rightsConfirmed !== true) {
      res.status(400).json({ error: "Please confirm you took this photo and PinHunt may use it." });
      return;
    }
    if (backImageBase64 !== undefined && typeof backImageBase64 !== "string") {
      res.status(400).json({ error: "backImageBase64 must be a string" });
      return;
    }
    if (backImageBase64 && backImageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      res.status(413).json({ error: "The back photo is too large — please retake it." });
      return;
    }

    const userId = req.userId!;
    if (!(await withinDailyCap(userId, "submission"))) {
      res.status(429).json({ error: "You've added a lot of pins today — thank you! Please try again tomorrow.", capReached: true });
      return;
    }
    const submissionId = generateSubmissionId();
    const storagePath = `${userId}/${submissionId}/front.jpg`;
    const bucket = getStorageClient().storage.from("pin-submissions");

    // The back goes first, so a failure here leaves nothing behind.
    let backPath: string | null = null;
    if (backImageBase64) {
      backPath = `${userId}/${submissionId}/back.jpg`;
      const { error: backError } = await bucket
        .upload(backPath, Buffer.from(backImageBase64, "base64"), { contentType: "image/jpeg", upsert: false });
      if (backError) {
        res.status(500).json({ error: `Could not store the back photo: ${backError.message}` });
        return;
      }
    }
    const dropBack = async () => { if (backPath) await bucket.remove([backPath]); };

    if (frontDraftPath) {
      // Only the caller's own preview can be submitted.
      if (!frontDraftPath.startsWith(`${draftDir(userId)}/`) || frontDraftPath.split("/").length !== 3) {
        await dropBack();
        res.status(400).json({ error: "That photo preview isn't yours." });
        return;
      }
      const { error: moveError } = await bucket.move(frontDraftPath, storagePath);
      if (moveError) {
        await dropBack();
        res.status(410).json({ error: "This photo preview has expired — please take the photo again." });
        return;
      }
    } else {
      // Older app builds send the photo directly, without a preview.
      if (!frontImageBase64) { await dropBack(); res.status(400).json({ error: "frontImageBase64 is required" }); return; }
      if (frontImageBase64.length > MAX_IMAGE_BASE64_CHARS) {
        await dropBack();
        res.status(413).json({ error: "Photo is too large — please retake it." });
        return;
      }
      const { buffer } = await normalizeOrRaw(
        Buffer.from(frontImageBase64, "base64"), mimeType, userId, imageHash(frontImageBase64));
      const { error: uploadError } = await bucket
        .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: true });
      if (uploadError) {
        await dropBack();
        res.status(500).json({ error: `Could not store your photo: ${uploadError.message}` });
        return;
      }
    }

    const userRepo = getServiceUserRepository();
    const submission = await userRepo.createPinSubmissionFromPaths(
      userId,
      {
        proposedName: proposedName?.trim() || undefined,
        brand: brand?.trim() || undefined,
        seriesName: seriesName?.trim() || undefined,
        releaseLocation: releaseLocation?.trim() || undefined,
        releaseYear,
        editionType,
        editionSize,
        facNumber: facNumber?.trim() || undefined,
        sku: sku?.trim() || undefined,
        characterNames,
        notes: notes?.trim() || undefined,
        status: "submitted",
        rightsConfirmed: rightsConfirmed === true,
        aiIdentification: sanitizeAiIdentification(aiIdentification),
      },
      submissionId,
      storagePath,
      backPath,
    );

    res.json({ submission });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
