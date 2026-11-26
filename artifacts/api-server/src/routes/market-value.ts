/**
 * Pin market valuation routes.
 *
 * GET  /api/pins/:pinId/market-value          Saved UK + US estimates
 * POST /api/pins/:pinId/market-value/refresh  Search eBay and recalculate
 *
 * :pinId is the public pinhunt id. eBay credentials never leave the server.
 *
 * Collector refresh controls (PRICE-01, docs/market-data/RIGHTS.md §3):
 *   MARKET_VALUE_REFRESH_ENABLED     default off; when off the refresh route is a 404
 *   MARKET_VALUE_REFRESH_FRESH_HOURS default 24; a stored estimate this recent is
 *                                    returned with cached:true and eBay is not called
 *   MARKET_VALUE_REFRESH_USER_DAILY  default 20 eBay calls per user per rolling 24 h
 *                                    (per server process); over it -> 429 daily_limit.
 *                                    Cached answers do not count.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { ebayConfigured } from "../services/ebay";
import {
  getMarketValueForPin,
  getLatestValuesForPins,
  refreshMarketValueForPin,
} from "../services/valuation";
import { isFresh, refreshEnabled, takeUserRefresh } from "../services/market/refresh-limits";

const router: IRouter = Router();

/** Require a valid signed-in Supabase user (Bearer token). */
async function requireUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  try {
    const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }
    res.locals.userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: "Authentication failed" });
  }
}

// Per-pin cooldown so anonymous retries / rapid taps can't hammer eBay.
const REFRESH_COOLDOWN_MS = 60_000;
const lastRefreshAt = new Map<string, number>();

// Batch: latest saved values for up to 100 pins (read-only, no eBay calls).
router.get("/pins/market-values", async (req, res) => {
  try {
    const raw = String(req.query.ids ?? "");
    const ids = [...new Set(raw.split(",").map(s => s.trim()).filter(Boolean))].slice(0, 100);
    if (ids.length === 0) {
      res.status(400).json({ error: "Provide ids as a comma-separated list" });
      return;
    }
    res.json({ values: await getLatestValuesForPins(ids) });
  } catch (err) {
    req.log.error({ err }, "market-values batch read failed");
    res.status(500).json({ error: "Failed to load market values" });
  }
});

router.get("/pins/:pinId/market-value", async (req, res) => {
  try {
    const result = await getMarketValueForPin(String(req.params.pinId));
    if (!result) {
      res.status(404).json({ error: "Pin not found" });
      return;
    }
    res.json({ ...result, ebayConfigured: ebayConfigured() });
  } catch (err) {
    req.log.error({ err }, "market-value read failed");
    res.status(500).json({ error: "Failed to load market value" });
  }
});

/** Flag off: behave as if the route does not exist, before anything else. */
function requireRefreshEnabled(_req: Request, res: Response, next: NextFunction) {
  if (!refreshEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
}

router.post("/pins/:pinId/market-value/refresh", requireRefreshEnabled, requireUser, async (req, res) => {
  if (!ebayConfigured()) {
    res.status(503).json({ error: "eBay is not configured on this server yet." });
    return;
  }
  // Fresh stored value: answer from it, no eBay call, no cap use.
  try {
    const stored = await getMarketValueForPin(String(req.params.pinId));
    if (!stored) {
      res.status(404).json({ error: "Pin not found" });
      return;
    }
    const newest = stored.estimates
      .map(e => e.calculatedAt)
      .filter(Boolean)
      .sort()
      .pop();
    if (isFresh(newest)) {
      res.json({ ...stored, ebayConfigured: true, cached: true });
      return;
    }
  } catch (err) {
    req.log.error({ err }, "market-value refresh: stored value check failed");
    res.status(500).json({ error: "Failed to load market value" });
    return;
  }
  const last = lastRefreshAt.get(String(req.params.pinId));
  if (last && Date.now() - last < REFRESH_COOLDOWN_MS) {
    res.status(429).json({ error: "This pin was just checked — try again in a minute." });
    return;
  }
  if (!takeUserRefresh(String(res.locals.userId))) {
    res.status(429).json({ error: "daily_limit" });
    return;
  }
  lastRefreshAt.set(String(req.params.pinId), Date.now());
  if (lastRefreshAt.size > 5000) lastRefreshAt.clear();
  try {
    const result = await refreshMarketValueForPin(String(req.params.pinId));
    res.json({ ...result, ebayConfigured: true, cached: false });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 502;
    req.log.error({ err }, "market-value refresh failed");
    res.status(status).json({
      error:
        status === 404
          ? "Pin not found"
          : "eBay is unavailable right now. Any saved value is unchanged.",
    });
  }
});

export default router;
