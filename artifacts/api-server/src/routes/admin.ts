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

export default router;
