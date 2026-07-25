/**
 * Admin routes — development / setup use only.
 *
 * POST /admin/seed-pins        Insert 20 mock pins (dev convenience only —
 *                               production data comes from the import script)
 * GET  /admin/catalogue-status Count pins by verification_status
 *
 * SECURITY: These endpoints are unprotected during development.
 *           Add authentication before deploying to production.
 *
 * Write operations require SUPABASE_SERVICE_ROLE_KEY because RLS blocks
 * anonymous writes. The anon key is used for read operations.
 */
import { Router, type IRouter } from "express";
import {
  createSupabasePinRepository,
  createSupabaseUserRepository,
  SEED_PINS,
  type PinRepository,
} from "@workspace/pin-repository";

const router: IRouter = Router();

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
router.post("/admin/seed-pins", async (_req, res) => {
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
router.get("/admin/catalogue-status", async (_req, res) => {
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
router.get("/admin/pins/missing-images", async (req, res) => {
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
router.get("/admin/catalogue/distinct", async (req, res) => {
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
router.patch("/admin/pins/:pinhuntId/images", async (req, res) => {
  try {
    const { pinhuntId } = req.params;
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
 * GET /admin/submissions/:id/duplicate-candidates
 *
 * Returns catalogue pins that may already represent the same pin as the
 * given submission, matched by title+brand similarity, FAC number, and SKU.
 * Admins use this before approving to decide whether to merge or create new.
 *
 * curl https://<domain>/api/admin/submissions/<id>/duplicate-candidates
 */
router.get(
  "/admin/submissions/:id/duplicate-candidates",
  async (req, res) => {
    try {
      const userRepo = getAdminUserRepository();
      const candidates = await userRepo.findSubmissionDuplicateCandidates(
        req.params.id,
      );
      res.json({ candidates });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("not found") ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  },
);

export default router;
