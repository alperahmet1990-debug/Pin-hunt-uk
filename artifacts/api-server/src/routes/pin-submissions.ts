/**
 * Submit a brand-new pin to the catalogue — the user-facing "I scanned
 * something that's not in PinHunt yet" flow (scan.tsx's "can't find it"
 * link, and the standalone Add Pin screen) → add-pin.tsx.
 *
 * POST /pin-submissions
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
 * Auth: requireUser (any signed-in collector) — the row lands with status
 * 'submitted', ready for the admin review queue.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseUserRepository, type EditionType } from "@workspace/pin-repository";
import { pixianConfigured, normalizePinPhoto } from "../services/pixian";

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
}

router.post("/pin-submissions", requireUser, async (req: UserRequest, res: Response) => {
  try {
    const {
      proposedName, brand, seriesName, releaseLocation, releaseYear,
      editionType, editionSize, facNumber, sku, characterNames, notes,
      frontImageBase64, mimeType = "image/jpeg",
    } = req.body as SubmitPinBody;

    if (!proposedName?.trim()) { res.status(400).json({ error: "proposedName is required" }); return; }
    if (!brand?.trim()) { res.status(400).json({ error: "brand is required" }); return; }
    if (!frontImageBase64) { res.status(400).json({ error: "frontImageBase64 is required" }); return; }
    if (frontImageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      res.status(413).json({ error: "Photo is too large — please retake it." });
      return;
    }

    const userId = req.userId!;
    const rawBuffer = Buffer.from(frontImageBase64, "base64");

    let finalBuffer: Buffer = rawBuffer;
    if (pixianConfigured()) {
      try {
        finalBuffer = await normalizePinPhoto(rawBuffer, mimeType);
      } catch (err) {
        // Don't block a core flow on a third-party API outage — fall back
        // to the raw photo; an admin can still review the submission.
        console.warn("[pin-submissions] Pixian normalization failed, using raw photo:", err);
      }
    }

    const submissionId = generateSubmissionId();
    const storagePath = `${userId}/${submissionId}/front.jpg`;
    const { error: uploadError } = await getStorageClient().storage
      .from("pin-submissions")
      .upload(storagePath, finalBuffer, { contentType: "image/jpeg", upsert: true });
    if (uploadError) {
      res.status(500).json({ error: `Could not store your photo: ${uploadError.message}` });
      return;
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
      null,
    );

    res.json({ submission });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
