/**
 * Contributed pin image moderation (admin only).
 *
 * GET  /admin/pending-pin-images              List images awaiting review,
 *      each with a signed URL for the cleaned photo, one for the raw photo
 *      as taken (admin-only bucket, migration 079) and the pin's Pin & Pop
 *      reference (admin-only, migration 042).
 * POST /admin/pin-images/:id/approve          Promote the cleaned photo into
 *      the public pin-catalogue bucket and set it as the pin's display image.
 *      409 { code: 'has_image' } when a "missing photo" contribution's pin
 *      has gained a photo since; send { replaceExisting: true } to confirm.
 * POST /admin/pin-images/:id/reject           Mark rejected, no storage change.
 *
 * Same Bearer JWT -> profiles.is_admin convention used by admin.ts et al.
 * Write operations use SUPABASE_SERVICE_ROLE_KEY because RLS blocks
 * anonymous writes and cross-bucket storage moves need the Storage API
 * with a service-role key (SQL cannot manipulate storage.objects).
 *
 * Pin & Pop images are only ever returned here, for an admin to look at.
 * They are never sent to OpenAI or any other AI service.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabasePinRepository,
  createSupabaseUserRepository,
} from "@workspace/pin-repository";
import { publishContributedImage, PublishBlockedError } from "../services/contributed-images";

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
    // Admin-only reference — never returned by any collector-facing route.
    const pinAndPop = await userRepo.getPinAndPopReferences([...new Set(images.map((img) => img.pinId))]);
    const withUrls = await Promise.all(
      images.map(async (img) => {
        try {
          return {
            ...img,
            signedUrl: await userRepo.getContributedImageUrl(img.storagePath),
            // Older rows (and a server without migration 079) have none.
            rawSignedUrl: img.rawStoragePath
              ? await userRepo.getContributedRawImageUrl(img.rawStoragePath).catch(() => null)
              : null,
            pinAndPop: pinAndPop[img.pinId] ?? null,
          };
        } catch (err) {
          // One unreadable row shouldn't take down the whole queue.
          console.error(`[pin-images] skipping pending image ${img.id}:`, err);
          return null;
        }
      }),
    );
    res.json({ images: withUrls.filter((img) => img !== null) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /admin/pin-images/:id/approve
 *
 * Publishes the pending photo into the live catalogue — see
 * services/contributed-images.ts (also used for an admin's "publish now").
 *
 * Body: { replaceExisting?: boolean }. Replacement proposals (reason
 * wrong_pin / poor_quality / other) replace the current photo, which the
 * reviewer sees on the card. A "missing photo" contribution for a pin that
 * has gained a photo since needs replaceExisting: true, else 409.
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
    if (!image.uploadedBy) {
      res.status(400).json({ error: "Only collector-contributed photos can be approved." });
      return;
    }

    const { replaceExisting } = (req.body ?? {}) as { replaceExisting?: unknown };
    const isReplacementProposal = !!image.proposalReason && image.proposalReason !== "missing";
    const published = await publishContributedImage(image, req.adminId!, {
      serviceClient: getAdminAuthClient(),
      userRepo,
      pinRepo: getWritePinRepository(),
    }, { replaceExisting: replaceExisting === true || isReplacementProposal });
    res.json({ image: published });
  } catch (err) {
    if (err instanceof PublishBlockedError) {
      res.status(err.code === "has_image" ? 409 : 400)
        .json({ error: err.message, code: err.code, existingImageUrl: err.existingImageUrl ?? null });
      return;
    }
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
