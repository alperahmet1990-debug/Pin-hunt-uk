import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PRICE-01 (#705): flag, freshness cache and per-user daily cap on the
// collector refresh route. The valuation service and eBay are mocked.
const svc = vi.hoisted(() => ({
  getMarketValueForPin: vi.fn(),
  getLatestValuesForPins: vi.fn(),
  refreshMarketValueForPin: vi.fn(),
  ebayConfigured: vi.fn(() => true),
}));

vi.mock("../services/valuation", () => ({ ...svc }));
vi.mock("../services/ebay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/ebay")>()),
  ebayConfigured: svc.ebayConfigured,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (t: string) =>
        t.startsWith("token-")
          ? { data: { user: { id: t } }, error: null }
          : { data: { user: null }, error: {} },
    },
  }),
}));

import app from "../app";
import { resetRefreshLimits } from "../services/market/refresh-limits";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const result = (calculatedAt: string) => ({
  pinId: "PHUK-00000001",
  estimates: [{ marketplace: "EBAY_GB", currency: "GBP", estimatedMid: 10, calculatedAt }],
  comparables: [],
});

let n = 0;
const post = (token = "token-a") =>
  request(app)
    .post(`/api/pins/PHUK-9${++n}/market-value/refresh`) // fresh pin each time: per-pin cooldown
    .set("Authorization", `Bearer ${token}`);

describe("POST market-value/refresh controls", () => {
  beforeEach(() => {
    resetRefreshLimits();
    vi.stubEnv("MARKET_VALUE_REFRESH_ENABLED", "true");
    svc.getMarketValueForPin.mockReset().mockResolvedValue(result(hoursAgo(48)));
    svc.refreshMarketValueForPin.mockReset().mockResolvedValue(result(new Date().toISOString()));
    svc.ebayConfigured.mockReturnValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("flag off: 404 and no eBay call, even when signed in", async () => {
    vi.stubEnv("MARKET_VALUE_REFRESH_ENABLED", "");
    expect((await post()).status).toBe(404);
    expect((await request(app).post("/api/pins/PHUK-1/market-value/refresh")).status).toBe(404);
    expect(svc.refreshMarketValueForPin).not.toHaveBeenCalled();
    expect(svc.getMarketValueForPin).not.toHaveBeenCalled();
  });

  it("unauthenticated request still gets 401 with the flag on", async () => {
    expect((await request(app).post("/api/pins/PHUK-1/market-value/refresh")).status).toBe(401);
    expect((await post("bad")).status).toBe(401);
    expect(svc.refreshMarketValueForPin).not.toHaveBeenCalled();
  });

  it("fresh stored value: 200 cached:true, no eBay call", async () => {
    svc.getMarketValueForPin.mockResolvedValue(result(hoursAgo(1)));
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(svc.refreshMarketValueForPin).not.toHaveBeenCalled();
  });

  it("stale value: calls eBay once and returns the new value", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(svc.refreshMarketValueForPin).toHaveBeenCalledTimes(1);
  });

  it("missing value: calls eBay once", async () => {
    svc.getMarketValueForPin.mockResolvedValue({ pinId: "PHUK-1", estimates: [], comparables: [] });
    expect((await post()).status).toBe(200);
    expect(svc.refreshMarketValueForPin).toHaveBeenCalledTimes(1);
  });

  it("the 21st eBay call in 24 h gets 429 daily_limit; cached answers don't count", async () => {
    // 5 cached answers first: they must not use the cap.
    svc.getMarketValueForPin.mockResolvedValue(result(hoursAgo(1)));
    for (let i = 0; i < 5; i++) expect((await post()).body.cached).toBe(true);
    svc.getMarketValueForPin.mockResolvedValue(result(hoursAgo(48)));
    for (let i = 0; i < 20; i++) expect((await post()).status).toBe(200);
    const over = await post();
    expect(over.status).toBe(429);
    expect(over.body).toEqual({ error: "daily_limit" });
    expect(svc.refreshMarketValueForPin).toHaveBeenCalledTimes(20);
    // another user is unaffected
    expect((await post("token-b")).status).toBe(200);
  });

  it("honours MARKET_VALUE_REFRESH_USER_DAILY", async () => {
    vi.stubEnv("MARKET_VALUE_REFRESH_USER_DAILY", "1");
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
  });

  it("keeps the 503 when eBay is not configured", async () => {
    svc.ebayConfigured.mockReturnValue(false);
    expect((await post()).status).toBe(503);
  });
});
