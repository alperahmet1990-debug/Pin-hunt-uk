/**
 * Contribute a pin photo (user-facing, not admin) — the submit side of
 * /contribute-image/[pinId], reached from the scan result's "Add your photo"
 * (a matched pin with no catalogue photo), the pin page, and the catalogue
 * contributor screen.
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
 * The photo as taken (before Pixian) is also kept, in the private
 * pin-contributed-raw bucket (migration 080), which only admins can read, so
 * the reviewer can compare raw | cleaned | Pin & Pop. It is deleted once the
 * contribution is approved or rejected (discardRawOriginal); an unsubmitted
 * preview's draft goes after 24 hours (services/contributed-drafts-cleanup.ts).
 * Its metadata (EXIF GPS
 * location etc.) is stripped first; see rawWithoutMetadata. It is only kept
 * when the request says the collector was told (keepOriginalConsent: true,
 * sent by app builds whose consent step says the original is kept), so
 * older builds never have it kept. It is best-effort: without the bucket
 * (080 not applied yet) the contribution still goes through, just without a
 * raw original.
 *
 * Auth: requireUser (any signed-in collector, same Bearer-token pattern
 * as scan.ts) — NOT requireAdmin. Any user may contribute a photo; only
 * admins (routes/pin-images.ts) can approve one into the live catalogue.
 * Admins' and the App Creator's own photos (every App Creator is also an
 * admin, migration 040) go to the same review queue by default, so they get
 * the same side-by-side check. An admin can send { publishNow: true } to
 * publish straight away instead; it is ignored for everyone else.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createSupabasePinRepository, createSupabaseUserRepository } from "@workspace/pin-repository";
import { pixianConfigured, normalizePinPhoto, PixianTimeoutError } from "../services/pixian";
import { imageHash, recordUsage, withinDailyCap } from "../services/usage-caps";
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

/** Photos as taken, before Pixian. Admin-read only (migration 080). */
const RAW_BUCKET = "pin-contributed-raw";

const MAX_IMAGE_BASE64_CHARS = 8_000_000; // ~6MB image, same cap as /scan/identify

const PROPOSAL_REASONS = ["missing", "wrong_pin", "poor_quality", "other"] as const;
type ProposalReason = (typeof PROPOSAL_REASONS)[number];

// Clean (un-watermarked) Pixian results waiting for the contributor to
// confirm: {userId}/drafts/{pinId}__{photo hash}.jpg in the private bucket.
// Each user keeps at most one — a new preview clears the old ones — so
// abandoned previews can't pile up. Naming it after the photo's hash means
// previewing the same photo again reuses the cleaned result instead of
// paying Pixian twice.
const draftPrefix = (userId: string, pinId: string) => `${userId}/drafts/${pinId}__`;

async function clearDrafts(userId: string, keep?: string) {
  // The raw draft has the same path as the cleaned one, in RAW_BUCKET.
  for (const name of ["pin-contributed-images", RAW_BUCKET]) {
    const bucket = getStorageClient().storage.from(name);
    const { data } = await bucket.list(`${userId}/drafts`);
    const stale = (data ?? []).map((f) => `${userId}/drafts/${f.name}`).filter((p) => p !== keep);
    if (stale.length) await bucket.remove(stale);
  }
}

/** Decode limit for raw originals: far above any phone photo, far below sharp's ~268 MP default. */
const RAW_MAX_INPUT_PIXELS = 50_000_000;

/**
 * The photo as taken, without its metadata: re-encoded as JPEG with the EXIF
 * orientation applied and every EXIF/XMP/IPTC tag (GPS location, device,
 * timestamps) dropped, which is sharp's default. Pixels are otherwise
 * unchanged, so the reviewer still sees the uncleaned photo. Throws on input
 * sharp can't decode or that is over RAW_MAX_INPUT_PIXELS.
 */
export async function rawWithoutMetadata(imageBase64: string): Promise<Buffer> {
  return sharp(Buffer.from(imageBase64, "base64"), { limitInputPixels: RAW_MAX_INPUT_PIXELS, failOn: "error" })
    .rotate().jpeg({ quality: 92 }).toBuffer();
}

/** Store the raw original. Best-effort: logs and returns false on any failure. */
async function storeRaw(path: string, imageBase64: string): Promise<boolean> {
  try {
    const { error } = await getStorageClient().storage
      .from(RAW_BUCKET)
      .upload(path, await rawWithoutMetadata(imageBase64), { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.warn("[contribute-pin-image] raw original not kept:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** The cleaned draft for this exact photo, if the user previewed it already. */
async function existingDraft(draftPath: string): Promise<Buffer | null> {
  const { data } = await getStorageClient().storage.from("pin-contributed-images").download(draftPath);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
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
  /** Admins only: publish now instead of queueing for review. Ignored otherwise. */
  publishNow?: boolean;
  /**
   * The collector was told the original photo is kept for moderators. Only
   * then is it kept; older app builds don't send it.
   */
  keepOriginalConsent?: boolean;
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
  // Everything below is checked before the (paid) Pixian call, not just
  // before the insert.
  const pinRepo = createSupabasePinRepository(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  if (!(await pinRepo.getPinByPinhuntId(pinId))) {
    res.status(404).json({ error: "We couldn't find that pin." });
    return false;
  }
  if (await getServiceUserRepository().hasPendingContributedImage(req.userId!, pinId)) {
    res.status(409).json({ error: "You've already sent a photo of this pin — it's waiting for review." });
    return false;
  }
  return true;
}

/**
 * Pixian-normalize a photo within the user's daily clean-up cap (shared with
 * pin submissions). Sends a 429, 504 or 502 and returns null on failure.
 */
async function normalize(res: Response, userId: string, imageBase64: string, mimeType: string): Promise<Buffer | null> {
  if (!(await withinDailyCap(userId, "photo_cleanup"))) {
    res.status(429).json({ error: "You've reached today's limit for photo clean-ups. Please try again tomorrow." });
    return null;
  }
  void recordUsage(userId, "photo_cleanup", imageHash(imageBase64));
  try {
    return await normalizePinPhoto(Buffer.from(imageBase64, "base64"), mimeType);
  } catch (err) {
    console.error("[contribute-pin-image] Pixian normalization failed:", err);
    if (err instanceof PixianTimeoutError) {
      res.status(504).json({ error: "Photo clean-up is taking too long. Please try again." });
      return null;
    }
    res.status(502).json({
      error: "Could not process your photo — please retake it with better lighting or a plainer background.",
    });
    return null;
  }
}

/**
 * Record the contribution for an object already in the private bucket. It
 * waits for review, unless an admin explicitly asked to publish now.
 */
async function recordContribution(
  res: Response,
  userId: string,
  body: ContributionBody,
  storagePath: string,
  rawStoragePath: string | undefined,
) {
  const userRepo = getServiceUserRepository();
  const proposalReason = body.proposalReason as ProposalReason | undefined;
  const image = await userRepo.createContributedImage(userId, body.pinId!, {
    storagePath,
    rawStoragePath,
    consentGranted: true,
    proposalReason,
  });

  // Review is the default for everyone. Only an admin's explicit
  // "publish now" skips it; the profile check is server-side.
  let isAdmin = false;
  if (body.publishNow === true) {
    const { data: profile } = await getStorageClient()
      .from("profiles").select("is_admin").eq("id", userId).single();
    isAdmin = !!profile?.is_admin;
  }
  if (isAdmin) {
    try {
      const published = await publishContributedImage(image, userId, {
        serviceClient: getStorageClient(),
        userRepo,
        pinRepo: createSupabasePinRepository(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!),
      }, {
        // An admin proposing a replacement has seen the current photo.
        replaceExisting: !!proposalReason && proposalReason !== "missing",
      });
      res.json({ image: published, autoApproved: true });
      return;
    } catch (err) {
      // The pending row is already saved, so it falls back to the review queue
      // (including a pin that gained a photo since: the reviewer decides).
      console.error(
        `[contribute-pin-image] auto-publish failed, left pending (pin ${body.pinId}, image ${image.id}):`,
        err,
      );
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

    const draftPath = `${draftPrefix(userId, body.pinId!)}${imageHash(body.imageBase64!)}.jpg`;
    let processed = await existingDraft(draftPath);
    if (!processed) {
      processed = await normalize(res, userId, body.imageBase64!, body.mimeType ?? "image/jpeg");
      if (!processed) return;
      const { error: uploadError } = await getStorageClient().storage
        .from("pin-contributed-images")
        .upload(draftPath, processed, { contentType: "image/jpeg", upsert: true });
      if (uploadError) {
        res.status(500).json({ error: `Could not store your photo: ${uploadError.message}` });
        return;
      }
      // The photo as taken, same path, admin-only bucket.
      if (body.keepOriginalConsent === true) await storeRaw(draftPath, body.imageBase64!);
    }
    await clearDrafts(userId, draftPath);

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
 * the draft (and its raw original) into place and queues it for review.
 * An admin's { publishNow: true } publishes it directly instead.
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
    let rawStoragePath: string | undefined;

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
      if (body.keepOriginalConsent === true) {
        const { error: rawMoveError } = await getStorageClient().storage
          .from(RAW_BUCKET).move(body.draftPath, storagePath);
        if (rawMoveError) {
          console.warn("[contribute-pin-image] raw original not kept:", rawMoveError.message);
        } else {
          rawStoragePath = storagePath;
        }
      }
    } else {
      const processed = await normalize(res, userId, body.imageBase64!, body.mimeType ?? "image/jpeg");
      if (!processed) return;
      const { error: uploadError } = await bucket
        .upload(storagePath, processed, { contentType: "image/jpeg", upsert: false });
      if (uploadError) {
        res.status(500).json({ error: `Could not store your photo: ${uploadError.message}` });
        return;
      }
      if (body.keepOriginalConsent === true && await storeRaw(storagePath, body.imageBase64!)) {
        rawStoragePath = storagePath;
      }
    }

    try {
      await recordContribution(res, userId, body, storagePath, rawStoragePath);
    } catch (err) {
      // No row points at the raw original now, so don't leave it behind.
      // Best-effort: a failed clean-up must not hide the original error.
      if (rawStoragePath) {
        try {
          await getStorageClient().storage.from(RAW_BUCKET).remove([rawStoragePath]);
        } catch {
          console.warn("[contribute-pin-image] raw original not removed after a failed submit");
        }
      }
      throw err;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
