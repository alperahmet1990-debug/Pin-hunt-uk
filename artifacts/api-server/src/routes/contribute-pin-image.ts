/**
 * Contribute a pin photo (user-facing, not admin) — the submit side of the
 * scan → "we don't have a photo of this pin yet" flow (scan.tsx →
 * /contribute-image/[pinId]).
 *
 * POST /pin-images/contribute/preview   Step 1: process + show the result.
 * POST /pin-images/contribute           Step 2: confirm it.
 *
 * Runs every submitted photo through Pixian.ai (services/pixian.ts) to
 * normalize it into a uniform catalogue thumbnail — solid white
 * background, cropped and centered, fixed size — before it's ever stored.
 * The contributor sees that result, watermarked exactly as it will be
 * published (services/watermark.ts), and confirms or retakes before
 * anything reaches the review queue. The clean original is what's stored;
 * the watermark is applied when it's published. The Pixian API key never
 * reaches the client, which is why this happens server-side rather than
 * directly from the app to Supabase Storage.
 *
 * Auth: requireUser (any signed-in collector, same Bearer-token pattern
 * as scan.ts) — NOT requireAdmin. Any user may contribute a photo; only
 * admins (routes/pin-images.ts) can approve one into the live catalogue.
 * Photos from admins and the App Creator (every App Creator is also an
 * admin, migration 040) skip the queue and are published immediately.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabasePinRepository, createSupabaseUserRepository } from "@workspace/pin-repository";
import { pixianConfigured, normalizePinPhoto } from "../services/pixian";
import { publishContributedImage } from "../services/contributed-images";
import { watermarkPinPhoto } from "../services/watermark";

const router: IRouter = Router();

// ── Auth (same convention as scan.ts's requireUser) ───────────────────────────

interface UserRequest extends Request {
  userId?: string;
}

async function requireUser(req: UserRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: "Sign in to contribute a photo" });
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
// Writing the pending pin_images row bypasses RLS via the service-role key,
// same as every other server-side write in this repo — the route itself is
// still gated by requireUser above, not open writes.

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

const PROPOSAL_REASONS = ["missing", "wrong_pin", "poor_quality", "other"] as const;
type ProposalReason = (typeof PROPOSAL_REASONS)[number];

// Clean (un-watermarked) Pixian results waiting for the contributor to
// confirm: {userId}/drafts/{pinId}__{timestamp}.jpg in the private bucket.
// Each user keeps at most one — a new preview clears the old ones — so
// abandoned previews can't pile up.
const draftPrefix = (userId: string, pinId: string) => `${userId}/drafts/${pinId}__`;

async function clearDrafts(userId: string) {
  const bucket = getStorageClient().storage.from("pin-contributed-images");
  const { data } = await bucket.list(`${userId}/drafts`);
  if (data?.length) await bucket.remove(data.map((f) => `${userId}/drafts/${f.name}`));
}

interface ContributionBody {
  pinId?: string;
  imageBase64?: string;
  mimeType?: string;
  consentGranted?: boolean;
  /** Sent by the catalogue contribution flow; omitted by scan. */
  proposalReason?: string;
  /** From /preview — confirms that already-processed photo. */
  draftPath?: string;
}

/** Shared checks for both steps. Sends the error response and returns false on failure. */
async function validateContribution(req: UserRequest, res: Response, needsImage: boolean): Promise<boolean> {
  const { pinId, imageBase64, consentGranted, proposalReason } = req.body as ContributionBody;

  if (!pinId || pinId.includes("/")) { res.status(400).json({ error: "pinId is required" }); return false; }
  if (needsImage) {
    if (!pixianConfigured()) {
      res.status(503).json({ error: "Photo normalization is not configured on this server yet." });
      return false;
    }
    if (!imageBase64) { res.status(400).json({ error: "imageBase64 is required" }); return false; }
    if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      res.status(413).json({ error: "Photo is too large — please retake it." });
      return false;
    }
  }
  if (consentGranted !== true) {
    res.status(400).json({ error: "Rights consent is required to contribute a pin image." });
    return false;
  }
  if (proposalReason !== undefined && !PROPOSAL_REASONS.includes(proposalReason as ProposalReason)) {
    res.status(400).json({ error: "Unknown proposal reason." });
    return false;
  }
  // Checked before the (paid) Pixian call, not just before the insert.
  if (await getServiceUserRepository().hasPendingContributedImage(req.userId!, pinId)) {
    res.status(409).json({ error: "You've already sent a photo of this pin — it's waiting for review." });
    return false;
  }
  return true;
}

/** Pixian-normalize a photo; sends a 502 and returns null on failure. */
async function normalize(res: Response, imageBase64: string, mimeType: string): Promise<Buffer | null> {
  try {
    return await normalizePinPhoto(Buffer.from(imageBase64, "base64"), mimeType);
  } catch (err) {
    console.error("[contribute-pin-image] Pixian normalization failed:", err);
    res.status(502).json({
      error: "Could not process your photo — please retake it with better lighting or a plainer background.",
    });
    return null;
  }
}

/**
 * Record the contribution for an object already in the private bucket, then
 * publish it straight away when the contributor is trusted.
 */
async function recordContribution(res: Response, userId: string, body: ContributionBody, storagePath: string) {
  const userRepo = getServiceUserRepository();
  const image = await userRepo.createContributedImage(userId, body.pinId!, {
    storagePath,
    consentGranted: true,
    proposalReason: body.proposalReason as ProposalReason | undefined,
  });

  // Trusted accounts publish straight to the catalogue, self-reviewed.
  const { data: profile } = await getStorageClient()
    .from("profiles").select("is_admin").eq("id", userId).single();
  if (profile?.is_admin) {
    try {
      const published = await publishContributedImage(image, userId, {
        serviceClient: getStorageClient(),
        userRepo,
        pinRepo: createSupabasePinRepository(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!),
      });
      res.json({ image: published, autoApproved: true });
      return;
    } catch (err) {
      // The pending row is already saved, so it falls back to the review queue.
      console.error("[contribute-pin-image] auto-publish failed, left pending:", err);
    }
  }

  res.json({ image, autoApproved: false });
}

/**
 * POST /pin-images/contribute/preview
 *
 * Step 1: normalize the photo via Pixian and return it exactly as it would
 * be published (watermarked), so the contributor can confirm or retake.
 * The clean result is kept as a draft; nothing is queued for review yet.
 *
 * Returns { draftPath, previewBase64 } — previewBase64 is a JPEG.
 */
router.post("/pin-images/contribute/preview", requireUser, async (req: UserRequest, res: Response) => {
  try {
    if (!(await validateContribution(req, res, true))) return;
    const body = req.body as ContributionBody;
    const userId = req.userId!;

    const processed = await normalize(res, body.imageBase64!, body.mimeType ?? "image/jpeg");
    if (!processed) return;

    await clearDrafts(userId);
    const draftPath = `${draftPrefix(userId, body.pinId!)}${Date.now()}.jpg`;
    const { error: uploadError } = await getStorageClient().storage
      .from("pin-contributed-images")
      .upload(draftPath, processed, { contentType: "image/jpeg", upsert: false });
    if (uploadError) {
      res.status(500).json({ error: `Could not store your photo: ${uploadError.message}` });
      return;
    }

    const preview = await watermarkPinPhoto(processed);
    res.json({ draftPath, previewBase64: preview.toString("base64") });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /pin-images/contribute
 *
 * Step 2: confirm a previewed photo ({ draftPath } from /preview) — moves
 * the draft into place and queues it for review, or publishes it directly
 * for admins / the App Creator.
 *
 * Still accepts { imageBase64 } without a preview, for app builds that
 * predate the preview step.
 */
router.post("/pin-images/contribute", requireUser, async (req: UserRequest, res: Response) => {
  try {
    const body = req.body as ContributionBody;
    const userId = req.userId!;
    if (!(await validateContribution(req, res, !body.draftPath))) return;

    const storagePath = `${userId}/${body.pinId}/${Date.now()}.jpg`;
    const bucket = getStorageClient().storage.from("pin-contributed-images");

    if (body.draftPath) {
      // Only the caller's own draft for this pin can be confirmed.
      const prefix = draftPrefix(userId, body.pinId!);
      if (!body.draftPath.startsWith(prefix) || body.draftPath.slice(prefix.length).includes("/")) {
        res.status(400).json({ error: "That preview doesn't match this pin." });
        return;
      }
      const { error: moveError } = await bucket.move(body.draftPath, storagePath);
      if (moveError) {
        res.status(410).json({ error: "This preview has expired — please take the photo again." });
        return;
      }
    } else {
      const processed = await normalize(res, body.imageBase64!, body.mimeType ?? "image/jpeg");
      if (!processed) return;
      const { error: uploadError } = await bucket
        .upload(storagePath, processed, { contentType: "image/jpeg", upsert: false });
      if (uploadError) {
        res.status(500).json({ error: `Could not store your photo: ${uploadError.message}` });
        return;
      }
    }

    await recordContribution(res, userId, body, storagePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
