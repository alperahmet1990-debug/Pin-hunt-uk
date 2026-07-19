/**
 * Admin routes — development / setup use only.
 * These endpoints are intentionally unprotected during early development.
 * Add authentication before deploying to production.
 */
import { Router, type IRouter } from "express";
import {
  createSupabasePinRepository,
  SEED_PINS,
  type PinRepository,
} from "@workspace/pin-repository";

const router: IRouter = Router();

function getRepository(): PinRepository {
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
 * Inserts the 20 seed pins into the Supabase catalogue.
 * Uses upsert-by-id so it is safe to call multiple times.
 *
 * curl -X POST https://<your-domain>/api/admin/seed-pins
 */
router.post("/admin/seed-pins", async (req, res) => {
  try {
    const repo = getRepository();

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
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /admin/catalogue-status
 *
 * Returns a count of pins by status — useful for verifying the seed ran.
 */
router.get("/admin/catalogue-status", async (req, res) => {
  try {
    const repo = getRepository();
    const [active, pending] = await Promise.all([
      repo.searchPins("", { status: "active", limit: 1000 }),
      repo.searchPins("", { status: "pending_review", limit: 1000 }),
    ]);

    res.json({
      active: active.length,
      pendingReview: pending.length,
      total: active.length + pending.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
