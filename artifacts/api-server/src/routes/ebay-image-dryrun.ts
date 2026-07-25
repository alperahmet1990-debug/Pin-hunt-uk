/**
 * eBay image dry-run routes (admin only).
 *
 * POST /api/catalogue/ebay-image-dry-run           — start a run (limit ≤ 50)
 * GET  /api/catalogue/ebay-image-dry-run/runs      — recent runs
 * GET  /api/catalogue/ebay-image-dry-run/runs/:id  — run summary + results
 *
 * Report only: never modifies pin image fields or approved images.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ebayConfigured } from "../services/ebay";
import {
  DRY_RUN_MAX_PINS,
  startImageDryRun,
  isDryRunActive,
  getDryRunSummary,
  getDryRunResults,
  listDryRuns,
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
    const rawLimit = (req.body as { limit?: unknown })?.limit;
    const limit = typeof rawLimit === "number" && Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DRY_RUN_MAX_PINS;
    if (limit < 1 || limit > DRY_RUN_MAX_PINS) {
      res.status(400).json({ error: `limit must be between 1 and ${DRY_RUN_MAX_PINS}` });
      return;
    }
    const runId = await startImageDryRun(limit);
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

export default router;
