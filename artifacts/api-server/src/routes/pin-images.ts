/**
 * Contributed pin image moderation (admin only).
 *
 * GET  /admin/pending-pin-images              List images awaiting review.
 * POST /admin/pin-images/:id/approve          Promote into the public
 *      pin-catalogue bucket and set it as the pin's display image.
 * POST /admin/pin-images/:id/reject           Mark rejected, no storage change.
 *
 * Same Bearer JWT -> profiles.is_admin convention used by admin.ts et al.
 * Write operations use SUPABASE_SERVICE_ROLE_KEY because RLS blocks
 * anonymous writes and cross-bucket storage moves need the Storage API
 * with a service-role key (SQL cannot manipulate storage.objects).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabasePinRepository,
  createSupabaseUserRepository,
} from "@workspace/pin-repository";

const router: IRouter = Router();

// ─── Admin auth (same convention as admin.ts) ────────────────────────────────

let anonClient: SupabaseClient | null = null;
let adminAuthClient: SupabaseClient | null = null;

function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    anonClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  }
  return anonClient;
}
function getAdminAuthClient(): SupabaseClient {
  if (!adminAuthClient) {
    adminAuthClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return adminAuthClient;
}

interface AdminRequest extends Request {
  adminId?: string;
}

async function requireAdmin(req: AdminRequest, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  try {
    const { data: { user }, error } = await getAnonClient().auth.getUser(auth.slice(7));
    if (error || !user) { res.status(401).json({ error: "Invalid token" }); return; }
    const { data: profile } = await getAdminAuthClient()
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) { res.status(403).json({ error: "Admin access required" }); return; }
    req.adminId = user.id;
    next();
  } catch {
    res.status(500).json({ error: "Auth check failed" });
  }
}

function getAdminUserRepository() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use admin routes.");
  }
  return createSupabaseUserRepository(url, key);
}

function getWritePinRepository() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use admin routes.");
  }
  return createSupabasePinRepository(url, key);
}

/**
 * GET /admin/pending-pin-images
 *
 * curl -H "Authorization: Bearer <token>" https://<domain>/api/admin/pending-pin-images
 */
router.get("/admin/pending-pin-images", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const userRepo = getAdminUserRepository();
    const images = await userRepo.getPendingContributedImages();
    const withUrls = await Promise.all(
      images.map(async (img) => ({
        ...img,
        signedUrl: await userRepo.getContributedImageUrl(img.storagePath),
      })),
    );
    res.json({ images: withUrls });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /admin/pin-images/:id/approve
 *
 * Downloads the pending object from the private pin-contributed-images
 * bucket, re-uploads it into the public pin-catalogue bucket, writes
 * pins.image_url, and flips the pin_images row to approved + publicly
 * displayable. Known v1 gap: no cross-step transaction — a failure
 * between the storage copy and the DB writes can leave an orphaned
 * public-bucket object (low-volume admin action, acceptable for now).
 *
 * curl -X POST -H "Authorization: Bearer <token>" \
 *   https://<domain>/api/admin/pin-images/<id>/approve
 */
router.post("/admin/pin-images/:id/approve", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const userRepo = getAdminUserRepository();

    const image = await userRepo.getContributedImage(id);
    if (!image) { res.status(404).json({ error: "Contributed image not found" }); return; }
    if (image.status !== "pending") {
      res.status(400).json({ error: `Image is already ${image.status}, not pending.` });
      return;
    }
    if (!image.pinhuntId) {
      res.status(500).json({ error: "Contributed image is missing its linked pin." });
      return;
    }

    const storage = getAdminAuthClient().storage;
    const { data: blob, error: downloadError } = await storage
      .from("pin-contributed-images")
      .download(image.storagePath);
    if (downloadError || !blob) {
      res.status(500).json({ error: `Could not read contributed image: ${downloadError?.message ?? "unknown"}` });
      return;
    }

    const publicPath = `${image.pinId}/contributed-${image.id}.jpg`;
    const { error: uploadError } = await storage
      .from("pin-catalogue")
      .upload(publicPath, blob, { contentType: "image/jpeg", upsert: true });
    if (uploadError) {
      res.status(500).json({ error: `Could not publish image: ${uploadError.message}` });
      return;
    }

    const { data: publicUrlData } = storage.from("pin-catalogue").getPublicUrl(publicPath);

    const pinRepo = getWritePinRepository();
    await pinRepo.updatePin(image.pinhuntId, {
      imageUrl: publicUrlData.publicUrl,
      needsFrontImage: false,
    });

    const reviewed = await userRepo.markContributedImageReviewed(id, req.adminId!, { action: "approve" });
    res.json({ image: { ...reviewed, publicUrl: publicUrlData.publicUrl } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /admin/pin-images/:id/reject
 *
 * Body: { reviewerNotes?: string }
 *
 * curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
 *   -d '{"reviewerNotes":"Wrong pin"}' https://<domain>/api/admin/pin-images/<id>/reject
 */
router.post("/admin/pin-images/:id/reject", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { reviewerNotes } = req.body as { reviewerNotes?: string };

    const userRepo = getAdminUserRepository();
    const image = await userRepo.getContributedImage(id);
    if (!image) { res.status(404).json({ error: "Contributed image not found" }); return; }
    if (image.status !== "pending") {
      res.status(400).json({ error: `Image is already ${image.status}, not pending.` });
      return;
    }

    const reviewed = await userRepo.markContributedImageReviewed(id, req.adminId!, {
      action: "reject",
      reviewerNotes,
    });
    res.json({ image: reviewed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
