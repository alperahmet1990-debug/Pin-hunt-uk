/**
 * Pin market valuation routes.
 *
 * GET  /api/pins/:pinId/market-value          Saved UK + US estimates
 * POST /api/pins/:pinId/market-value/refresh  Search eBay and recalculate
 *
 * :pinId is the public pinhunt id. eBay credentials never leave the server.
 */
import { Router, type IRouter } from "express";
import { ebayConfigured } from "../services/ebay";
import {
  getMarketValueForPin,
  refreshMarketValueForPin,
} from "../services/valuation";

const router: IRouter = Router();

router.get("/pins/:pinId/market-value", async (req, res) => {
  try {
    const result = await getMarketValueForPin(req.params.pinId);
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

router.post("/pins/:pinId/market-value/refresh", async (req, res) => {
  if (!ebayConfigured()) {
    res.status(503).json({ error: "eBay is not configured on this server yet." });
    return;
  }
  try {
    const result = await refreshMarketValueForPin(req.params.pinId);
    res.json({ ...result, ebayConfigured: true });
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
