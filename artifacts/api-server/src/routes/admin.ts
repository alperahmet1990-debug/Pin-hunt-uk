/**
 * Admin routes — dev-seeding, catalogue-status, and admin support endpoints.
 *
 * POST /admin/seed-pins        Insert 20 mock pins (dev convenience only —
 *                               production data comes from the import script)
 * GET  /admin/catalogue-status Count pins by verification_status
 *
 * Catalogue routes require the App Creator (requireAppCreator below —
 * profiles.is_app_creator, migrations 040/041); the submission
 * duplicate-candidate lookup only needs an admin (requireAdmin), since
 * admins still review submissions.
 *
 * Write operations require SUPABASE_SERVICE_ROLE_KEY because RLS blocks
 * anonymous writes. The anon key is used for read operations.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabasePinRepository,
  createSupabaseUserRepository,
  SEED_PINS,
  type PinRepository,
} from "@workspace/pin-repository";
import { watermarkPinPhoto } from "../services/watermark";

const router: IRouter = Router();

// ─── Admin auth (same convention as catalogue-validation.ts et al.) ──────────

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

// Catalogue tooling is App Creator only (migration 041) — plain admins only
// moderate. Duplicate-candidate lookup stays requireAdmin (submission review).
async function requireAppCreator(req: AdminRequest, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  try {
    const { data: { user }, error } = await getAnonClient().auth.getUser(auth.slice(7));
    if (error || !user) { res.status(401).json({ error: "Invalid token" }); return; }
    const { data: profile } = await getAdminAuthClient()
      .from("profiles").select("is_app_creator").eq("id", user.id).single();
    if (!profile?.is_app_creator) { res.status(403).json({ error: "App Creator access required" }); return; }
    req.adminId = user.id;
    next();
  } catch {
    res.status(500).json({ error: "Auth check failed" });
  }
}

/** Repository with service-role key — bypasses RLS for writes. */
function getWriteRepository(): PinRepository {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY; // fallback for envs without service role
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use admin routes.",
    );
  }
  return createSupabasePinRepository(url, key);
}

/** Repository with anon key — respects RLS (reads verified pins only). */
function getReadRepository(): PinRepository {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be set to use admin routes.",
    );
  }
  return createSupabasePinRepository(url, key);
}

/** User repository with service-role key — bypasses RLS for admin operations. */
function getAdminUserRepository() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use admin routes.",
    );
  }
  return createSupabaseUserRepository(url, key);
}

/**
 * POST /admin/seed-pins
 *
 * Inserts 20 mock development pins into Supabase.
 * Idempotent — safe to call multiple times (upserts by pinhunt_id).
 * All seed pins are inserted with verification_status='verified' so they
 * appear in the app immediately.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY to bypass RLS write policy.
 *
 * curl -X POST https://<domain>/api/admin/seed-pins
 */
router.post("/admin/seed-pins", requireAppCreator, async (_req, res) => {
  try {
    const repo = getWriteRepository();

    const results = await Promise.allSettled(
      SEED_PINS.map((pin) => repo.createPin(pin)),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason?.message ?? String(r.reason));

    res.json({
      seeded: succeeded,
      total: SEED_PINS.length,
      ...(failed.length > 0 ? { errors: failed } : {}),
      note: "These are development mock pins. For production data, run the import script.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /admin/catalogue-status
 *
 * Returns pin counts grouped by verification_status.
 * Uses service role to see all pins, not just verified ones.
 *
 * curl https://<domain>/api/admin/catalogue-status
 */
router.get("/admin/catalogue-status", requireAppCreator, async (_req, res) => {
  try {
    const repo = getWriteRepository(); // service role to see unverified pins

    const [verified, needsSource, unverified] = await Promise.all([
      repo.searchPins("", { verificationStatus: "verified", limit: 9999 }),
      repo.searchPins("", { verificationStatus: "needs_source_verification", limit: 9999 }),
      repo.searchPins("", { verificationStatus: "unverified", limit: 9999 }),
    ]);

    // Also count via anon key to show what the app actually sees
    let appVisible = 0;
    try {
      const anonRepo = getReadRepository();
      const anonPins = await anonRepo.searchPins("", { limit: 9999 });
      appVisible = anonPins.length;
    } catch {
      // anon key might not be set in this env
    }

    res.json({
      verified: verified.length,
      needsSourceVerification: needsSource.length,
      unverified: unverified.length,
      total: verified.length + needsSource.length + unverified.length,
      appVisible,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /admin/pins/missing-images
 *
 * Lists pins where needs_front_image OR needs_back_image is true.
 * Supports optional ?brand= and ?collection= query params.
 *
 * curl "https://<domain>/api/admin/pins/missing-images?brand=Disney"
 */
router.get("/admin/pins/missing-images", requireAppCreator, async (req, res) => {
  try {
    const repo = getWriteRepository(); // service role to see all pins
    const { brand, collection, limit = "200" } = req.query as Record<string, string>;

    const pins = await repo.searchPins("", {
      needsAnyImage: true,
      ...(brand ? { brand } : {}),
      ...(collection ? { collection } : {}),
      limit: Math.min(parseInt(limit, 10) || 200, 500),
    });

    res.json({ pins, total: pins.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /admin/catalogue/distinct
 *
 * Returns distinct brand or collection values for autocomplete suggestions.
 * Query params:
 *   field  — "brand" | "collection" (required)
 *   search — optional case-insensitive substring filter
 *   limit  — max values to return (default 25, capped at 100)
 *
 * curl "https://<domain>/api/admin/catalogue/distinct?field=brand&search=dis"
 */
router.get("/admin/catalogue/distinct", requireAppCreator, async (req, res) => {
  try {
    const { field, search, limit = "25" } = req.query as Record<string, string>;

    if (field !== "brand" && field !== "collection") {
      res.status(400).json({ error: 'Query param "field" must be "brand" or "collection".' });
      return;
    }

    const repo = getWriteRepository(); // service role — include unverified pins
    const values = await repo.getDistinctFieldValues(
      field,
      search,
      Math.min(parseInt(limit, 10) || 25, 100),
    );

    res.json({ field, values });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * PATCH /admin/pins/:pinhuntId/images
 *
 * Updates image_url and/or back_image_url for a pin and clears the
 * corresponding needs_front_image / needs_back_image flags.
 *
 * Body: { imageUrl?: string; backImageUrl?: string }
 *
 * curl -X PATCH https://<domain>/api/admin/pins/PHUK-00000001/images \
 *   -H "Content-Type: application/json" \
 *   -d '{"imageUrl":"https://..."}'
 */
router.patch("/admin/pins/:pinhuntId/images", requireAppCreator, async (req: Request, res: Response) => {
  try {
    const { pinhuntId } = req.params as { pinhuntId: string };
    const { imageUrl, backImageUrl } = req.body as {
      imageUrl?: string;
      backImageUrl?: string;
    };

    if (!imageUrl && !backImageUrl) {
      res.status(400).json({ error: "Provide at least imageUrl or backImageUrl." });
      return;
    }

    const repo = getWriteRepository();

    const update: Parameters<typeof repo.updatePin>[1] = {};
    if (imageUrl    !== undefined) { update.imageUrl      = imageUrl;    update.needsFrontImage = false; }
    if (backImageUrl !== undefined) { update.backImageUrl = backImageUrl; update.needsBackImage  = false; }

    const pin = await repo.updatePin(pinhuntId, update);
    res.json({ pin });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("NOT_FOUND") ? 404 : 500;
    res.status(status).json({ error: msg });
  }
});

/**
 * POST /admin/catalogue-photos
 *
 * Upload a photo taken or picked in the app (Pin Editor, Missing Images)
 * as a catalogue image. Every PinHunt-owned photo that goes public carries
 * the PinHunt watermark (services/watermark.ts), so these uploads go
 * through the server rather than straight from the app to Storage.
 * Images set by URL (e.g. imported reference photos) are not touched.
 *
 * Body: { pinhuntId, side: 'front' | 'back', imageBase64 }
 * Returns: { publicUrl } — the caller saves it on the pin as before.
 */
const MAX_PHOTO_BASE64_CHARS = 14_000_000;

router.post("/admin/catalogue-photos", requireAppCreator, async (req: Request, res: Response) => {
  try {
    const { pinhuntId, side, imageBase64 } = req.body as {
      pinhuntId?: string;
      side?: string;
      imageBase64?: string;
    };
    if (!pinhuntId || !/^[A-Za-z0-9_-]+$/.test(pinhuntId)) {
      res.status(400).json({ error: "pinhuntId is required" });
      return;
    }
    if (side !== "front" && side !== "back") {
      res.status(400).json({ error: "side must be 'front' or 'back'" });
      return;
    }
    if (!imageBase64) { res.status(400).json({ error: "imageBase64 is required" }); return; }
    if (imageBase64.length > MAX_PHOTO_BASE64_CHARS) {
      res.status(413).json({ error: "Photo is too large." });
      return;
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY must be set to upload catalogue photos." });
      return;
    }

    const watermarked = await watermarkPinPhoto(Buffer.from(imageBase64, "base64"));
    // Same path as before (pin deletion cleans up pins/<id>/front|back.jpg);
    // the ?v= on the returned URL stops a replaced photo being served stale.
    const path = `pins/${pinhuntId}/${side}.jpg`;
    const storage = createClient(url, key).storage.from("pin-catalogue");
    const { error } = await storage.upload(path, watermarked, { contentType: "image/jpeg", upsert: true });
    if (error) {
      res.status(500).json({ error: `Could not store photo: ${error.message}` });
      return;
    }
    res.json({ publicUrl: `${storage.getPublicUrl(path).data.publicUrl}?v=${Date.now()}` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * GET /admin/submissions/:id/duplicate-candidates
 *
 * Returns catalogue pins that may already represent the same pin as the
 * given submission, matched by FAC number / SKU, name words (+ brand), and
 * same set + year + character.
 * Admins use this before approving to decide whether to merge or create new.
 *
 * curl https://<domain>/api/admin/submissions/<id>/duplicate-candidates
 */
router.get(
  "/admin/submissions/:id/duplicate-candidates",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const userRepo = getAdminUserRepository();
      const { id } = req.params as { id: string };
      // failedChecks lists any check that errored — the admin UI warns that
      // the list may be incomplete rather than implying "no duplicates".
      const { candidates, failedChecks } = await userRepo.findSubmissionDuplicateCandidates(id);
      res.json({ candidates, failedChecks });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("not found") ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  },
);

/**
 * POST /admin/submissions/:id/propose-photo   { pinhuntId }
 *
 * "Use this photo" after merging a submission into an existing pin that has
 * no photo (#395). Copies the submission's front photo into the contributed
 * images bucket as a PENDING proposal credited to the submitter, so it goes
 * through the normal photo review (admin/contributed-images) — never straight
 * onto the pin. Needs the submitter's image-rights confirmation (migration
 * 047); older submissions without it can't be proposed this way.
 */
router.post(
  "/admin/submissions/:id/propose-photo",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as { id: string };
      const { pinhuntId } = (req.body ?? {}) as { pinhuntId?: unknown };
      if (typeof pinhuntId !== "string" || !pinhuntId.trim()) {
        res.status(400).json({ error: "pinhuntId is required" });
        return;
      }
      const userRepo = getAdminUserRepository();
      const sub = await userRepo.getPinSubmission(id);
      if (!sub) { res.status(404).json({ error: "Submission not found" }); return; }
      if (!sub.rightsConfirmedAt) {
        res.status(409).json({ error: "The submitter didn't confirm the photo rights, so it can't be used as the pin's photo." });
        return;
      }

      const storage = getAdminAuthClient().storage;
      const { data: blob, error: downloadError } = await storage.from("pin-submissions").download(sub.frontImagePath);
      if (downloadError || !blob) {
        res.status(500).json({ error: `Could not read the submission photo: ${downloadError?.message ?? "missing"}` });
        return;
      }
      const storagePath = `${sub.submittedBy}/${pinhuntId.trim()}/${Date.now()}.jpg`;
      const { error: uploadError } = await storage.from("pin-contributed-images")
        .upload(storagePath, Buffer.from(await blob.arrayBuffer()), { contentType: "image/jpeg", upsert: false });
      if (uploadError) {
        res.status(500).json({ error: `Could not store the photo: ${uploadError.message}` });
        return;
      }

      const image = await userRepo.createContributedImage(sub.submittedBy, pinhuntId.trim(), {
        storagePath,
        consentGranted: true,
        proposalReason: "missing",
      });
      res.json({ image });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(msg.includes("not found") ? 404 : 500).json({ error: msg });
    }
  },
);

export default router;
