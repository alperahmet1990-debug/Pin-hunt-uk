/**
 * Admin "Price pins": run the capped sold-price batch from the app.
 *
 * GET  /api/admin/price-batch        setup (markets, budget, switches) and the current/last run
 * POST /api/admin/price-batch/plan   free: what a run would price and spend
 * POST /api/admin/price-batch/run    start a run (needs confirmCredits = the plan's credits)
 * POST /api/admin/price-batch/stop   stop the running job before its next pin
 *
 * App Creator only: it spends paid Soldgraph credits and writes valuations.
 * Body: { pins: { kind: "popular", count } | { kind: "ids", pinhuntIds },
 *         markets?: ["UK","US"], cacheDays?: 30, maxCredits, confirmCredits? }
 * Responses are counts only. See services/market/price-request/admin-batch.ts
 * and scripts/PRICE-REQUEST.md ("Price pins from the app").
 */
import { Router, type IRouter, type Response } from "express";
import { requireAppCreator } from "./research-review";
import { requestMarkets } from "../services/market/price-request/config";
import { createAdminBatchDeps } from "../services/market/price-request/deps";
import {
  BatchUsageError,
  adminBatchStatus,
  parseAdminBatchInput,
  planAdminBatch,
  startAdminBatch,
  stopAdminBatch,
} from "../services/market/price-request/admin-batch";

const router: IRouter = Router();

function deps(res: Response) {
  const d = createAdminBatchDeps();
  if (!d) res.status(503).json({ error: "The API server has no Supabase service key, so it can't price pins." });
  return d;
}

function failed(res: Response, err: unknown, log: { error: (o: object, m: string) => void }) {
  if (err instanceof BatchUsageError) {
    res.status(400).json({ error: err.message });
    return;
  }
  log.error({ err: err instanceof Error ? err.name : "unknown" }, "price batch failed");
  res.status(500).json({ error: "Price pins failed" });
}

router.get("/admin/price-batch", requireAppCreator, async (req, res) => {
  const d = deps(res);
  if (!d) return;
  try {
    const env = d.env;
    const month = new Date().toISOString().slice(0, 7);
    const budget = await d.store.budget(month).catch(() => null);
    res.json({
      markets: requestMarkets(env),
      switches: {
        soldgraph: env.SOLDGRAPH_ENABLED === "true" && Boolean(env.SOLDGRAPH_API_KEY),
        valuationV2: env.MARKET_VALUATION_V2_ENABLED === "true",
      },
      month,
      budget,
      job: adminBatchStatus(),
    });
  } catch (err) {
    failed(res, err, req.log);
  }
});

router.post("/admin/price-batch/plan", requireAppCreator, async (req, res) => {
  const d = deps(res);
  if (!d) return;
  try {
    const input = parseAdminBatchInput(req.body, d.env);
    res.json(await planAdminBatch(input, d));
  } catch (err) {
    failed(res, err, req.log);
  }
});

router.post("/admin/price-batch/run", requireAppCreator, async (req, res) => {
  const d = deps(res);
  if (!d) return;
  try {
    const input = parseAdminBatchInput(req.body, d.env);
    const r = await startAdminBatch(input, d);
    if (r.kind === "running") {
      res.status(409).json({ error: "A run is already going.", job: r.job });
      return;
    }
    if (r.kind === "refused") {
      res.status(422).json({ error: "Not run", plan: r.plan, blockers: r.blockers });
      return;
    }
    void r.done; // never rejects; the job records its own failure
    req.log.info({ planned: r.job.plannedCredits, pins: r.job.pinsToTry }, "price batch started");
    res.status(202).json({ job: r.job });
  } catch (err) {
    failed(res, err, req.log);
  }
});

router.post("/admin/price-batch/stop", requireAppCreator, (_req, res) => {
  res.json({ stopping: stopAdminBatch(), job: adminBatchStatus() });
});

export default router;
