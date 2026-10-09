/**
 * Contribute a pin photo (user-facing, not admin) — the submit side of the
 * scan → "we don't have a photo of this pin yet" flow (scan.tsx →
 * /contribute-image/[pinId]).
 *
 * POST /pin-images/contribute
 *
 * Runs every submitted photo through Pixian.ai (services/pixian.ts) to
 * normalize it into a uniform catalogue thumbnail — solid white
 * background, cropped and centered, fixed size — before it's ever stored,
 * so the admin review queue (routes/pin-images.ts) already shows the
 * final thumbnail. The Pixian API key never reaches the client, which is
 * why this upload happens server-side rather than directly from the app
 * to Supabase Storage.
 *
 * Auth: requireUser (any signed-in collector, same Bearer-token pattern
 * as scan.ts) — NOT requireAdmin. Any user may contribute a photo; only
 * admins (routes/pin-images.ts) can approve one into the live catalogue.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseUserRepository } from "@workspace/pin-repository";
import { pixianConfigured, normalizePinPhoto } from "../services/pixian";

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

router.post("/pin-images/contribute", requireUser, async (req: UserRequest, res: Response) => {
  try {
    if (!pixianConfigured()) {
      res.status(503).json({ error: "Photo normalization is not configured on this server yet." });
      return;
    }

    const { pinId, imageBase64, mimeType = "image/jpeg", consentGranted, proposalReason } = req.body as {
      pinId?: string;
      imageBase64?: string;
      mimeType?: string;
      consentGranted?: boolean;
      /** Sent by the catalogue contribution flow; omitted by scan. */
      proposalReason?: string;
    };

    if (!pinId) { res.status(400).json({ error: "pinId is required" }); return; }
    if (!imageBase64) { res.status(400).json({ error: "imageBase64 is required" }); return; }
    if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      res.status(413).json({ error: "Photo is too large — please retake it." });
      return;
    }
    if (consentGranted !== true) {
      res.status(400).json({ error: "Rights consent is required to contribute a pin image." });
      return;
    }

    if (proposalReason !== undefined && !PROPOSAL_REASONS.includes(proposalReason as ProposalReason)) {
      res.status(400).json({ error: "Unknown proposal reason." });
      return;
    }

    const userId = req.userId!;
    const userRepo = getServiceUserRepository();

    // Checked before the (paid) Pixian call, not just before the insert.
    if (await userRepo.hasPendingContributedImage(userId, pinId)) {
      res.status(409).json({ error: "You've already sent a photo of this pin — it's waiting for review." });
      return;
    }

    const rawBuffer = Buffer.from(imageBase64, "base64");

    let processedBuffer: Buffer;
    try {
      processedBuffer = await normalizePinPhoto(rawBuffer, mimeType);
    } catch (err) {
      console.error("[contribute-pin-image] Pixian normalization failed:", err);
      res.status(502).json({
        error: "Could not process your photo — please retake it with better lighting or a plainer background.",
      });
      return;
    }

    const storagePath = `${userId}/${pinId}/${Date.now()}.jpg`;
    const { error: uploadError } = await getStorageClient().storage
      .from("pin-contributed-images")
      .upload(storagePath, processedBuffer, { contentType: "image/jpeg", upsert: false });
    if (uploadError) {
      res.status(500).json({ error: `Could not store your photo: ${uploadError.message}` });
      return;
    }

    const image = await userRepo.createContributedImage(userId, pinId, {
      storagePath,
      consentGranted,
      proposalReason: proposalReason as ProposalReason | undefined,
    });

    res.json({ image });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
