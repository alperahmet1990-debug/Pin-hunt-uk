/**
 * eBay image dry-run routes (admin only). Developer tooling — not exposed
 * in the normal Admin navigation.
 *
 * POST /api/catalogue/ebay-image-dry-run           — start a run (limit ≤ 50)
 * GET  /api/catalogue/ebay-image-dry-run/runs      — recent runs
 * GET  /api/catalogue/ebay-image-dry-run/runs/:id  — run summary + results
 * POST /api/catalogue/ebay-image-dry-run/results/:id/apply — WRITES the
 *      candidate image to the live pin (pinhunt admin screen gates this
 *      behind a per-item confirmation dialog before calling it).
 *
 * NOT guaranteed non-destructive. The default call (limit only) is a
 * read-only report. But passing `releaseYear` and/or `autoApplyMinScore`
 * in the POST body switches the run into "bulk ingest" mode (up to
 * BULK_INGEST_MAX_PINS pins) and AUTO-APPLIES any high-scoring image
 * directly to the live pin with no per-item confirmation — see
 * applyCandidateImage() in ../services/ebay-image-dryrun.ts. The pinhunt
 * admin screen never sends these params, so this mode is only reachable by
 * a direct API call (curl/Postman/script) — treat it as a live-write action,
 * not a report, if you call it that way.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ebayConfigured } from "../services/ebay";
import {
  DRY_RUN_MAX_PINS,
  startImageDryRun,
  BULK_INGEST_MAX_PINS,
  isDryRunActive,
  getDryRunSummary,
  getDryRunResults,
  listDryRuns,
  applyDryRunImage,
  retryDryRunResult,
} from "../services/ebay-image-dryrun";

const router: IRouter = Router();

// ─── Admin auth (same convention as catalogue-import routes) ─────────────────

let anonClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    anonClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  }
  return anonClient;
}
function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return adminClient;
}

async function requireAdmin(req: Request, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  try {
    const { data: { user }, error } = await getAnonClient().auth.getUser(auth.slice(7));
    if (error || !user) { res.status(401).json({ error: "Invalid token" }); return; }
    const { data: profile } = await getAdminClient()
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) { res.status(403).json({ error: "Admin access required" }); return; }
    next();
  } catch {
    res.status(500).json({ error: "Auth check failed" });
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post("/catalogue/ebay-image-dry-run", requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!ebayConfigured()) {
      res.status(503).json({ error: "eBay credentials are not configured" });
      return;
    }
    const body = req.body as { limit?: unknown; releaseYear?: unknown; autoApplyMinScore?: unknown };
    const releaseYear = typeof body.releaseYear === "number" && Number.isInteger(body.releaseYear) ? body.releaseYear : undefined;
    const autoApplyMinScore =
      typeof body.autoApplyMinScore === "number" && body.autoApplyMinScore >= 50 && body.autoApplyMinScore <= 100
        ? body.autoApplyMinScore
        : undefined;
    const isBulk = releaseYear != null || autoApplyMinScore != null;
    const maxPins = isBulk ? BULK_INGEST_MAX_PINS : DRY_RUN_MAX_PINS;
    const limit = typeof body.limit === "number" && Number.isFinite(body.limit) ? Math.floor(body.limit) : DRY_RUN_MAX_PINS;
    if (limit < 1 || limit > maxPins) {
      res.status(400).json({ error: `limit must be between 1 and ${maxPins}` });
      return;
    }
    const runId = await startImageDryRun(limit, { releaseYear, autoApplyMinScore });
    res.status(202).json({ runId, status: "running" });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    res.status(status).json({ error: e instanceof Error ? e.message : "Failed to start dry run" });
  }
});

router.get("/catalogue/ebay-image-dry-run/runs", requireAdmin, async (_req, res: Response) => {
  try {
    res.json({ runs: await listDryRuns(), active: isDryRunActive() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list runs" });
  }
});

router.get("/catalogue/ebay-image-dry-run/runs/:runId", requireAdmin, async (req, res: Response) => {
  try {
    const runId = String(req.params.runId);
    const summary = await getDryRunSummary(runId);
    if (!summary) { res.status(404).json({ error: "Run not found" }); return; }
    const results = await getDryRunResults(runId);
    res.json({ summary, results });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load run" });
  }
});

// Re-search eBay for a different candidate image (excludes rejected listings).
router.post(
  "/catalogue/ebay-image-dry-run/results/:resultId/retry",
  requireAdmin,
  async (req, res: Response) => {
    try {
      const result = await retryDryRunResult(String(req.params.resultId));
      res.json({ result });
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      res.status(status).json({ error: e instanceof Error ? e.message : "Retry failed" });
    }
  },
);

// Admin-confirmed apply: writes the candidate image to the live pin.
router.post(
  "/catalogue/ebay-image-dry-run/results/:resultId/apply",
  requireAdmin,
  async (req, res: Response) => {
    try {
      const applied = await applyDryRunImage(String(req.params.resultId));
      res.json({ applied });
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      res.status(status).json({ error: e instanceof Error ? e.message : "Failed to apply image" });
    }
  },
);

export default router;
