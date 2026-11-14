/**
 * On-demand sold prices for one pin ("Get a price").
 *
 * GET  /api/pins/:pinId/price-request   the pin's request state (no provider call)
 * POST /api/pins/:pinId/price-request   ask for eBay UK/US sold prices now
 *
 * Signed-in users only. Behind MARKET_PRICE_REQUEST_ENABLED (and
 * MARKET_VALUATION_V2_ENABLED): 404 when off. :pinId is the public pinhunt
 * id; the pin is looked up as the caller sees it (RLS), so a pin the caller
 * can't see is a 404 before anything is planned or paid for.
 *
 * POST answers at once; the search runs in the background and the app polls
 * GET, then reads the values from GET /market-valuations:
 *   202 { state: "pending" }                       started
 *   409 { state: "pending" }                       already running for this pin
 *   200 { state: "priced" | "no_sales", ... }      answered from a recent request
 *   429 { error: "daily_limit" | "busy", retryAfter }   or { error: "too_many_requests" } (per-minute limit)
 *   503 { error: "budget" | "unavailable" }        monthly budget or setup
 * No listing rows, titles, prices of individual listings or links, ever.
 * See services/market/price-request/service.ts and scripts/PRICE-REQUEST.md.
 */
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { PIN_ID_RE, requireUser, userClient, type AuthedRequest } from "./market-valuations";
import { createPriceRequestDeps } from "../services/market/price-request/deps";
import { priceRequestStatus, startPriceRequest, unavailableReason } from "../services/market/price-request/service";
import { createRateLimiter, type RateLimiter } from "../services/market/price-request/rate-limit";

const router: IRouter = Router();

/** Off means 404 for everyone, signed in or not, before any auth call. */
function flagGate(_req: Request, res: Response, next: NextFunction) {
  if (unavailableReason(process.env) === "disabled") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
}

// Per signed-in user, per process. The app polls GET every 4s while a request runs.
export const POSTS_PER_MINUTE = 6;
export const GETS_PER_MINUTE = 30;
let postLimit = createRateLimiter(POSTS_PER_MINUTE, 60_000);
let getLimit = createRateLimiter(GETS_PER_MINUTE, 60_000);

/** For tests: forget every user's recent requests. */
export function resetPriceRequestRateLimitsForTests() {
  postLimit = createRateLimiter(POSTS_PER_MINUTE, 60_000);
  getLimit = createRateLimiter(GETS_PER_MINUTE, 60_000);
}

function rateLimit(limiter: () => RateLimiter) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!limiter().take(req.userId ?? "")) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    next();
  };
}

/** The pin's UUID as the caller sees it, or null (404). Throws on a lookup error. */
async function visiblePinUuid(req: AuthedRequest, pinhuntId: string): Promise<string | null> {
  const { data, error } = await userClient(req.supabaseToken!)
    .from("pins")
    .select("id")
    .eq("pinhunt_id", pinhuntId)
    .maybeSingle();
  if (error) throw new Error("pin lookup failed");
  const id = (data as { id?: unknown } | null)?.id;
  return typeof id === "string" && id ? id : null;
}

/** Shared gate: id shape and visibility. Sends the response and returns null when refused. */
async function gate(req: AuthedRequest, res: Response): Promise<{ pinhuntId: string; pinUuid: string } | null> {
  const pinhuntId = String(req.params.pinId);
  if (!PIN_ID_RE.test(pinhuntId)) {
    res.status(404).json({ error: "Pin not found" });
    return null;
  }
  const pinUuid = await visiblePinUuid(req, pinhuntId);
  if (!pinUuid) {
    res.status(404).json({ error: "Pin not found" });
    return null;
  }
  return { pinhuntId, pinUuid };
}

router.get("/pins/:pinId/price-request", flagGate, requireUser, rateLimit(() => getLimit), async (req: AuthedRequest, res) => {
  try {
    const pin = await gate(req, res);
    if (!pin) return;
    const deps = createPriceRequestDeps();
    if (!deps) {
      res.status(503).json({ error: "unavailable" });
      return;
    }
    const s = await priceRequestStatus(pin.pinUuid, deps);
    res.json({ pinId: pin.pinhuntId, ...s });
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.name : "unknown" }, "price-request status failed");
    res.status(500).json({ error: "Failed to load price request" });
  }
});

router.post("/pins/:pinId/price-request", flagGate, requireUser, rateLimit(() => postLimit), async (req: AuthedRequest, res) => {
  try {
    const pin = await gate(req, res);
    if (!pin) return;
    const deps = createPriceRequestDeps();
    if (!deps) {
      res.status(503).json({ error: "unavailable" });
      return;
    }
    const r = await startPriceRequest({ pinhuntId: pin.pinhuntId, origin: "user", userId: req.userId! }, deps);
    switch (r.kind) {
      case "started":
        // Never awaited by the response; done() never rejects and logs its own failures.
        void r.done;
        res.status(202).json({ pinId: pin.pinhuntId, state: "pending" });
        return;
      case "in_flight":
        res.status(409).json({ pinId: pin.pinhuntId, state: "pending", error: "in_flight" });
        return;
      case "cached":
        res.status(200).json({ pinId: pin.pinhuntId, state: r.outcome, checkedAt: r.checkedAt, nextRequestAt: r.nextRequestAt });
        return;
      case "capped":
        res.status(429).json({ error: r.scope === "user" ? "daily_limit" : "busy", retryAfter: r.retryAfter });
        return;
      case "budget":
        res.status(503).json({ error: "budget" });
        return;
      case "not_found":
        res.status(404).json({ error: "Pin not found" });
        return;
      case "unavailable":
        if (r.reason === "disabled") {
          res.status(404).json({ error: "Not found" });
          return;
        }
        req.log.warn({ reason: r.reason }, "price request unavailable");
        res.status(503).json({ error: "unavailable" });
        return;
    }
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.name : "unknown" }, "price request failed");
    res.status(500).json({ error: "Failed to request a price" });
  }
});

export default router;
