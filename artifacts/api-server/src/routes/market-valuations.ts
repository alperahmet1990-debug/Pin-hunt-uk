/**
 * Valuation v2 read route (SG-05, #408).
 *
 * GET /api/pins/:pinId/market-valuations
 *   Signed-in users only. Behind MARKET_VALUATION_V2_ENABLED (404 when off).
 *   :pinId is the public pinhunt id, as in the v1 market-value routes.
 *   Returns the stored per-market v2 values (UK, FR, US), confidence,
 *   attribution and method version. Read-only: no route can start a paid
 *   refresh; refreshes run only from the maintainer's SG-06 script.
 *
 * Reads use a client scoped to the caller's own token, so RLS applies
 * (market_valuations is signed-in read; pins are read as the caller sees
 * them). The response is built field by field from a whitelist: derived
 * values and source ids, counts and latest dates only. No listing titles,
 * links, images, sellers or prices of individual listings.
 *
 * The v1 routes in market-value.ts are unchanged.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getMarketValuations,
  type MarketCode,
  type MarketValuation,
  type MarketValuationsClient,
} from "@workspace/pin-repository";
import { valuationV2Enabled } from "../services/market/valuation-v2-service";
import { basisForCounts, primaryMarket, type ValuationBasis } from "../services/market/valuation-v2";

const router: IRouter = Router();

const PIN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SOURCE_ID_RE = /^[a-z0-9_]+:[a-z0-9_]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

interface AuthedRequest extends Request {
  supabaseToken?: string;
}

/** Require a valid signed-in Supabase user (Bearer token). */
async function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
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
    req.supabaseToken = token;
    next();
  } catch {
    res.status(401).json({ error: "Authentication failed" });
  }
}

/** A client that acts as the caller, so RLS decides what is visible. */
function userClient(token: string): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface MarketValuationResponseItem {
  market: MarketCode;
  currency: string;
  basis: ValuationBasis;
  low: number | null;
  fair: number | null;
  high: number | null;
  soldCount: number;
  activeCount: number;
  confidence: { score: number; band: string };
  sources: Array<{ sourceId: string; count: number; latestDate: string | null }>;
  methodVersion: string;
  calculatedAt: string;
  stale: boolean;
}

/** Whitelist mapping: only these fields ever leave the server. */
export function toResponseItem(v: MarketValuation, now: number): MarketValuationResponseItem {
  const expires = Date.parse(v.expiresAt);
  return {
    market: v.market,
    currency: v.currency,
    basis: basisForCounts(v.soldCount, v.activeCount),
    low: v.low ?? null,
    fair: v.fair ?? null,
    high: v.high ?? null,
    soldCount: v.soldCount,
    activeCount: v.activeCount,
    confidence: { score: v.confidenceScore, band: v.confidenceBand },
    sources: v.sources
      .filter(s => SOURCE_ID_RE.test(s.sourceId))
      .map(s => ({
        sourceId: s.sourceId,
        count: s.count,
        latestDate: s.latestDate && DATE_RE.test(s.latestDate) ? s.latestDate.slice(0, 10) : null,
      })),
    methodVersion: v.methodVersion,
    calculatedAt: v.calculatedAt,
    stale: Number.isNaN(expires) || expires < now,
  };
}

router.get("/pins/:pinId/market-valuations", requireUser, async (req: AuthedRequest, res) => {
  if (!valuationV2Enabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const pinhuntId = String(req.params.pinId);
  if (!PIN_ID_RE.test(pinhuntId)) {
    res.status(404).json({ error: "Pin not found" });
    return;
  }
  try {
    const db = userClient(req.supabaseToken!);
    const { data: pin, error: pinErr } = await db
      .from("pins")
      .select("id")
      .eq("pinhunt_id", pinhuntId)
      .maybeSingle();
    if (pinErr) throw new Error("pin lookup failed");
    if (!pin?.id) {
      res.status(404).json({ error: "Pin not found" });
      return;
    }
    const rows = await getMarketValuations(db as unknown as MarketValuationsClient, String(pin.id));
    const now = Date.now();
    const valuations = rows.map(v => toResponseItem(v, now));
    res.json({ pinId: pinhuntId, primaryMarket: primaryMarket(valuations), valuations });
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "unknown" }, "market-valuations read failed");
    res.status(500).json({ error: "Failed to load market valuations" });
  }
});

export default router;
