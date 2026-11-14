import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Contract tests for GET/POST /api/pins/:pinId/price-request ("Get a price").
// Supabase auth and the pin lookup are mocked; the service is replaced by a
// stub so each response maps one service outcome. Nothing reaches a network.
const PIN_UUID = "3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f";

const h = vi.hoisted(() => ({
  pin: { data: { id: "" } as unknown, error: null as unknown },
  deps: true,
  start: vi.fn(),
  status: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) =>
        token === "good-token"
          ? { data: { user: { id: "user-1" } }, error: null }
          : { data: { user: null }, error: { message: "bad jwt" } },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => h.pin }) }) }),
  }),
}));

vi.mock("../services/market/price-request/deps", () => ({
  createPriceRequestDeps: () => (h.deps ? { env: process.env } : null),
}));

vi.mock("../services/market/price-request/service", async (orig) => {
  const real = await orig<typeof import("../services/market/price-request/service")>();
  return { ...real, startPriceRequest: h.start, priceRequestStatus: h.status };
});

import app from "../app";
import { POSTS_PER_MINUTE, resetPriceRequestRateLimitsForTests } from "./price-request";

const post = (id = "PHUK-00000001", token: string | null = "good-token") => {
  const r = request(app).post(`/api/pins/${id}/price-request`);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};
const get = (id = "PHUK-00000001", token: string | null = "good-token") => {
  const r = request(app).get(`/api/pins/${id}/price-request`);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};

describe("price-request routes", () => {
  beforeEach(() => {
    vi.stubEnv("MARKET_PRICE_REQUEST_ENABLED", "true");
    vi.stubEnv("MARKET_VALUATION_V2_ENABLED", "true");
    vi.stubEnv("SUPABASE_URL", "https://example.test");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    h.pin = { data: { id: PIN_UUID }, error: null };
    h.deps = true;
    h.start.mockReset();
    h.status.mockReset();
    resetPriceRequestRateLimitsForTests();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is 404 for everyone when the flag is off, before any work (signed out included)", async () => {
    vi.stubEnv("MARKET_PRICE_REQUEST_ENABLED", "");
    expect((await post()).status).toBe(404);
    expect((await post("PHUK-00000001", null)).status).toBe(404);
    expect((await get("PHUK-00000001", null)).status).toBe(404);
    expect((await get()).status).toBe(404);
    vi.stubEnv("MARKET_PRICE_REQUEST_ENABLED", "true");
    vi.stubEnv("MARKET_VALUATION_V2_ENABLED", "");
    expect((await post()).status).toBe(404);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.status).not.toHaveBeenCalled();
  });

  it("needs a signed-in user", async () => {
    expect((await post("PHUK-00000001", null)).status).toBe(401);
    expect((await post("PHUK-00000001", "bad")).status).toBe(401);
    expect((await get("PHUK-00000001", null)).status).toBe(401);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("is 404 for a malformed id or a pin the caller can't see", async () => {
    expect((await post("bad id!")).status).toBe(404);
    h.pin = { data: null, error: null };
    expect((await post()).status).toBe(404);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("fails closed (503) without the service key", async () => {
    h.deps = false;
    expect((await post()).status).toBe(503);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("starts a request as the signed-in collector and answers 202 pending at once", async () => {
    h.start.mockResolvedValue({ kind: "started", requestId: "r1", worstCaseCredits: 2, done: new Promise(() => {}) });
    const res = await post();
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ pinId: "PHUK-00000001", state: "pending" });
    expect(h.start.mock.calls[0][0]).toEqual({ pinhuntId: "PHUK-00000001", origin: "user", userId: "user-1" });
  });

  it.each([
    [{ kind: "in_flight" }, 409, { state: "pending", error: "in_flight" }],
    [{ kind: "cached", outcome: "no_sales", checkedAt: "2026-10-18T12:00:00.000Z", nextRequestAt: "2026-11-17T12:00:00.000Z" }, 200,
      { state: "no_sales", checkedAt: "2026-10-18T12:00:00.000Z", nextRequestAt: "2026-11-17T12:00:00.000Z" }],
    [{ kind: "cached", outcome: "priced", checkedAt: "2026-10-18T12:00:00.000Z", nextRequestAt: null }, 200, { state: "priced" }],
    [{ kind: "capped", scope: "user", retryAfter: "2026-10-19T12:00:00.000Z" }, 429, { error: "daily_limit", retryAfter: "2026-10-19T12:00:00.000Z" }],
    [{ kind: "capped", scope: "global", retryAfter: "2026-10-19T12:00:00.000Z" }, 429, { error: "busy" }],
    [{ kind: "budget", remainingCredits: 1, worstCaseCredits: 2 }, 503, { error: "budget" }],
    [{ kind: "unavailable", reason: "provider_off" }, 503, { error: "unavailable" }],
    [{ kind: "unavailable", reason: "disabled" }, 404, {}],
    [{ kind: "not_found" }, 404, {}],
  ])("maps %o to %i", async (outcome, status, body) => {
    h.start.mockResolvedValue(outcome);
    const res = await post();
    expect(res.status).toBe(status);
    expect(res.body).toMatchObject(body);
    // Never budget figures or anything listing-shaped.
    expect(JSON.stringify(res.body)).not.toMatch(/remaining|worstCase|credits|title|url|price"/i);
  });

  it("never reveals other collectors' timing on the global cap", async () => {
    h.start.mockResolvedValue({ kind: "capped", scope: "global", retryAfter: "2026-10-19T12:00:00.000Z" });
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "busy" });
  });

  it("returns a generic 500 when the service throws", async () => {
    h.start.mockRejectedValue(new Error("db detail SECRET"));
    const res = await post();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("SECRET");
  });

  it("rate-limits one user's POSTs per minute, answering 429 before any planning", async () => {
    h.start.mockResolvedValue({ kind: "in_flight" });
    const codes: number[] = [];
    for (let i = 0; i < POSTS_PER_MINUTE + 2; i++) codes.push((await post()).status);
    expect(codes).toEqual([...Array(POSTS_PER_MINUTE).fill(409), 429, 429]);
    expect(h.start).toHaveBeenCalledTimes(POSTS_PER_MINUTE);
  });

  it("GET returns the pin's state from the request log", async () => {
    h.status.mockResolvedValue({ state: "pending", checkedAt: null, nextRequestAt: null, requestsOpen: true });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pinId: "PHUK-00000001", state: "pending", checkedAt: null, nextRequestAt: null, requestsOpen: true });
    expect(h.status.mock.calls[0][0]).toBe(PIN_UUID);
    expect(h.start).not.toHaveBeenCalled();
  });
});
