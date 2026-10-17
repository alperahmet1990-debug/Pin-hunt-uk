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
 * Auth: requireUser (any signed-in collector) — the row lands with status
 * 'submitted', ready for the admin review queue.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseUserRepository, type EditionType } from "@workspace/pin-repository";
import { pixianConfigured, normalizePinPhoto } from "../services/pixian";
import { watermarkPinPhoto } from "../services/watermark";

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
}

/**
 * Why a photo wasn't cleaned up, so the app can say so: "off" when the
 * clean-up service isn't set up on this server (e.g. staging), "failed"
 * when it was tried and didn't work for this photo.
 */
export type CleanupSkipped = "off" | "failed";

/** Pixian-normalize, falling back to the raw photo (see header). */
async function normalizeOrRaw(
  rawBuffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; cleaned: boolean; cleanupSkipped?: CleanupSkipped }> {
  if (!pixianConfigured()) return { buffer: rawBuffer, cleaned: false, cleanupSkipped: "off" };
  try {
    return { buffer: await normalizePinPhoto(rawBuffer, mimeType), cleaned: true };
  } catch (err) {
    console.warn("[pin-submissions] Pixian normalization failed, using raw photo:", err);
    return { buffer: rawBuffer, cleaned: false, cleanupSkipped: "failed" };
  }
}

// Cleaned photos waiting for the submitter to confirm, in the private
// pin-submissions bucket. Each user keeps at most one — a new preview
// clears the old — so abandoned previews can't pile up.
const draftDir = (userId: string) => `${userId}/drafts`;

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
    const { buffer, cleaned, cleanupSkipped } = await normalizeOrRaw(Buffer.from(frontImageBase64, "base64"), mimeType);

    const bucket = getStorageClient().storage.from("pin-submissions");
    const { data: old } = await bucket.list(draftDir(userId));
    if (old?.length) await bucket.remove(old.map((f) => `${draftDir(userId)}/${f.name}`));

    const draftPath = `${draftDir(userId)}/${Date.now()}.jpg`;
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
    } = req.body as SubmitPinBody;

    if (!proposedName?.trim()) { res.status(400).json({ error: "proposedName is required" }); return; }
    if (!brand?.trim()) { res.status(400).json({ error: "brand is required" }); return; }
    if (!frontImageBase64 && !frontDraftPath) { res.status(400).json({ error: "A front photo is required" }); return; }
    if (backImageBase64 !== undefined && typeof backImageBase64 !== "string") {
      res.status(400).json({ error: "backImageBase64 must be a string" });
      return;
    }
    if (backImageBase64 && backImageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      res.status(413).json({ error: "The back photo is too large — please retake it." });
      return;
    }

    const userId = req.userId!;
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
      const { buffer } = await normalizeOrRaw(Buffer.from(frontImageBase64, "base64"), mimeType);
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
        proposedName: proposedName.trim(),
        brand: brand.trim(),
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
