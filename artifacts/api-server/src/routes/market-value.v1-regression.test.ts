import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression (SG-05, #408): the v1 market-value endpoints behave exactly as
// before, with valuation v2 on or off. The v1 service and eBay are mocked.
const v1 = vi.hoisted(() => ({
  getMarketValueForPin: vi.fn(),
  getLatestValuesForPins: vi.fn(),
  refreshMarketValueForPin: vi.fn(),
  ebayConfigured: vi.fn(() => true),
}));

vi.mock("../services/valuation", () => ({
  getMarketValueForPin: v1.getMarketValueForPin,
  getLatestValuesForPins: v1.getLatestValuesForPins,
  refreshMarketValueForPin: v1.refreshMarketValueForPin,
}));
vi.mock("../services/ebay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/ebay")>()),
  ebayConfigured: v1.ebayConfigured,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async (t: string) => (t === "good-token" ? { data: { user: { id: "u" } }, error: null } : { data: { user: null }, error: {} }) },
  }),
}));

import app from "../app";

const RESULT = {
  pinId: "PHUK-00000001",
  estimates: [
    { marketplace: "EBAY_GB", currency: "GBP", estimatedLow: 8, estimatedMid: 10, estimatedHigh: 14, comparableCount: 6,
      confidence: "medium", calculatedAt: "2026-10-01T00:00:00Z", expiresAt: "2026-10-15T00:00:00Z", stale: true },
  ],
  comparables: [],
};

describe.each(["", "true"])("v1 market-value endpoints (MARKET_VALUATION_V2_ENABLED=%j)", flag => {
  beforeEach(() => {
    vi.stubEnv("MARKET_VALUATION_V2_ENABLED", flag);
    v1.getMarketValueForPin.mockReset().mockResolvedValue(RESULT);
    v1.getLatestValuesForPins.mockReset().mockResolvedValue({ "PHUK-00000001": { marketplace: "EBAY_GB", currency: "GBP", mid: 10 } });
    v1.refreshMarketValueForPin.mockReset().mockResolvedValue(RESULT);
    v1.ebayConfigured.mockReturnValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("GET /pins/:pinId/market-value returns the v1 shape, without sign-in", async () => {
    const res = await request(app).get("/api/pins/PHUK-00000001/market-value");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...RESULT, ebayConfigured: true });
    expect(v1.getMarketValueForPin).toHaveBeenCalledWith("PHUK-00000001");
  });

  it("GET /pins/:pinId/market-value 404s for an unknown pin", async () => {
    v1.getMarketValueForPin.mockResolvedValue(null);
    const res = await request(app).get("/api/pins/PHUK-00000009/market-value");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Pin not found" });
  });

  it("GET /pins/market-values batch is unchanged", async () => {
    expect((await request(app).get("/api/pins/market-values")).status).toBe(400);
    const res = await request(app).get("/api/pins/market-values?ids=PHUK-00000001");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ values: { "PHUK-00000001": { marketplace: "EBAY_GB", currency: "GBP", mid: 10 } } });
  });

  it("POST refresh still requires sign-in and returns the v1 shape", async () => {
    expect((await request(app).post("/api/pins/PHUK-00000001/market-value/refresh")).status).toBe(401);
    expect(
      (await request(app).post("/api/pins/PHUK-00000001/market-value/refresh").set("Authorization", "Bearer bad")).status,
    ).toBe(401);
    expect(v1.refreshMarketValueForPin).not.toHaveBeenCalled();
    const pin = `PHUK-${flag ? "1" : "2"}${Date.now()}`; // fresh pin: the route has a per-pin cooldown
    const res = await request(app).post(`/api/pins/${pin}/market-value/refresh`).set("Authorization", "Bearer good-token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...RESULT, ebayConfigured: true });
  });
});
