/**
 * Catalogue validation routes (admin only).
 *
 * POST /api/catalogue/validation                  — start a run
 * POST /api/catalogue/validation/pause            — pause the active run
 * GET  /api/catalogue/validation/runs             — recent runs
 * GET  /api/catalogue/validation/runs/:id         — run summary + results
 * GET  /api/catalogue/validation/runs/:id/csv     — downloadable CSV report
 * POST /api/catalogue/validation/results/:id/decision — admin decision
 * POST /api/catalogue/validation/results/:id/revalidate — re-run one record
 *
 * All findings are suggestions; pins change only through an admin decision,
 * and every applied change is written to pin_change_audit.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ebayConfigured } from "../services/ebay";
import {
  VALIDATION_DEFAULT_LIMIT,
  VALIDATION_MAX_LIMIT,
  startValidationRun,
  isValidationRunActive,
  requestPause,
  listValidationRuns,
  getValidationRun,
  getValidationResults,
  buildValidationCsv,
  applyValidationDecision,
  revalidateOne,
} from "../services/catalogue-validation";

const router: IRouter = Router();

// ─── Admin auth (same convention as the other catalogue routes) ──────────────

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
    const { data: profile } = await getAdminClient()
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) { res.status(403).json({ error: "Admin access required" }); return; }
    req.adminId = user.id;
    next();
  } catch {
    res.status(500).json({ error: "Auth check failed" });
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post("/catalogue/validation", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!ebayConfigured()) {
      res.status(503).json({ error: "eBay credentials are not configured" });
      return;
    }
    const body = req.body as { limit?: unknown; retryRunId?: unknown; collection?: unknown };
    const limit = typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.floor(body.limit)
      : VALIDATION_DEFAULT_LIMIT;
    if (limit < 1 || limit > VALIDATION_MAX_LIMIT) {
      res.status(400).json({ error: `limit must be between 1 and ${VALIDATION_MAX_LIMIT}` });
      return;
    }
    const retryRunId = typeof body.retryRunId === "string" ? body.retryRunId : undefined;
    const collection = typeof body.collection === "string" && body.collection.trim().length > 0
      ? body.collection.trim()
      : undefined;
    const runId = await startValidationRun(limit, req.adminId ?? null, { retryRunId, collection });
    res.status(202).json({ runId, status: "running" });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    res.status(status).json({ error: e instanceof Error ? e.message : "Failed to start validation run" });
  }
});

router.post("/catalogue/validation/pause", requireAdmin, async (_req, res: Response) => {
  res.json({ paused: requestPause() });
});

router.get("/catalogue/validation/runs", requireAdmin, async (_req, res: Response) => {
  try {
    res.json({ runs: await listValidationRuns(), active: isValidationRunActive() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list runs" });
  }
});

router.get("/catalogue/validation/runs/:runId", requireAdmin, async (req, res: Response) => {
  try {
    const runId = String(req.params.runId);
    const summary = await getValidationRun(runId);
    if (!summary) { res.status(404).json({ error: "Run not found" }); return; }
    const results = await getValidationResults(runId);
    res.json({ summary, results });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load run" });
  }
});

router.get("/catalogue/validation/runs/:runId/csv", requireAdmin, async (req, res: Response) => {
  try {
    const csv = await buildValidationCsv(String(req.params.runId));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="catalogue-validation-${req.params.runId}.csv"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to build CSV" });
  }
});

router.post(
  "/catalogue/validation/results/:validationId/decision",
  requireAdmin,
  async (req: AdminRequest, res: Response) => {
    try {
      const body = req.body as {
        action?: unknown; fields?: unknown; manualValues?: unknown; reason?: unknown;
      };
      const action = String(body.action ?? "");
      const allowed = ["approve", "approve_fields", "reject", "unable_to_verify", "mark_duplicate", "keep_both"];
      if (!allowed.includes(action)) {
        res.status(400).json({ error: `action must be one of: ${allowed.join(", ")}` });
        return;
      }
      const result = await applyValidationDecision({
        validationId: String(req.params.validationId),
        action: action as "approve",
        fields: Array.isArray(body.fields) ? body.fields.map(String) : undefined,
        manualValues:
          body.manualValues && typeof body.manualValues === "object"
            ? (body.manualValues as Record<string, string | number | null>)
            : undefined,
        adminId: req.adminId!,
        reason: typeof body.reason === "string" ? body.reason : undefined,
      });
      res.json(result);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      res.status(status).json({ error: e instanceof Error ? e.message : "Decision failed" });
    }
  },
);

router.post(
  "/catalogue/validation/results/:validationId/revalidate",
  requireAdmin,
  async (req, res: Response) => {
    try {
      await revalidateOne(String(req.params.validationId));
      res.json({ ok: true });
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      res.status(status).json({ error: e instanceof Error ? e.message : "Revalidation failed" });
    }
  },
);

export default router;
