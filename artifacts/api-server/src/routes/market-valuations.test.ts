import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Contract tests for GET /api/pins/:pinId/market-valuations (SG-05, #408).
// Supabase is mocked: no network, no real database.
const PIN_UUID = "3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f";

const sb = vi.hoisted(() => ({
  pin: { data: { id: "" } as unknown, error: null as unknown },
  valuations: { data: [] as unknown, error: null as unknown },
  created: [] as Array<{ key: string; headers?: Record<string, string> }>,
  tables: [] as string[],
  columns: [] as string[],
  writes: 0,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string, opts?: { global?: { headers?: Record<string, string> } }) => {
    sb.created.push({ key, headers: opts?.global?.headers });
    const write = () => {
      sb.writes += 1;
      return Promise.resolve({ error: null });
    };
    return {
      auth: {
        getUser: async (token: string) =>
          token === "good-token"
            ? { data: { user: { id: "user-1" } }, error: null }
            : { data: { user: null }, error: { message: "bad jwt" } },
      },
      from: (table: string) => {
        sb.tables.push(table);
        return {
          select: (columns: string) => ({
            eq: () => {
              sb.columns.push(columns);
              const res = table === "pins" ? sb.pin : sb.valuations;
              return { maybeSingle: async () => res, then: (ok: (r: unknown) => unknown) => Promise.resolve(res).then(ok) };
            },
          }),
          insert: write,
          upsert: write,
          update: write,
          delete: write,
        };
      },
    };
  },
}));

import app from "../app";

const row = (over: Record<string, unknown> = {}) => ({
  pin_id: PIN_UUID,
  market: "UK",
  currency: "GBP",
  low: "8.50",
  fair: "12.00",
  high: "15.25",
  sold_count: 9,
  active_count: 0,
  confidence_score: 72,
  confidence_band: "high",
  sources: [{ source_id: "soldgraph:ebay_gb_sold", count: 9, latest_date: "2026-10-01" }],
  method_version: "v2.1",
  calculated_at: "2026-10-18T12:00:00.000Z",
  expires_at: "2099-01-01T00:00:00.000Z",
  ...over,
});

const get = (id = "PHUK-00000001", token: string | null = "good-token") => {
  const r = request(app).get(`/api/pins/${id}/market-valuations`);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};

describe("GET /api/pins/:pinId/market-valuations", () => {
  beforeEach(() => {
    vi.stubEnv("MARKET_VALUATION_V2_ENABLED", "true");
    vi.stubEnv("MARKET_VALUATION_PUBLISHED_MARKETS", "UK,FR,US");
    vi.stubEnv("MARKET_COMPS_PUBLIC_ENABLED", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-should-not-be-used");
    sb.pin = { data: { id: PIN_UUID }, error: null };
    sb.valuations = { data: [row()], error: null };
    sb.created = [];
    sb.tables = [];
    sb.columns = [];
    sb.writes = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects a missing token", async () => {
    const res = await get("PHUK-00000001", null);
    expect(res.status).toBe(401);
    expect(sb.tables).toEqual([]);
  });

  it("rejects an invalid token", async () => {
    const res = await get("PHUK-00000001", "bad-token");
    expect(res.status).toBe(401);
    expect(sb.tables).toEqual([]);
  });

  it("is hidden (404) while the feature flag is off", async () => {
    vi.stubEnv("MARKET_VALUATION_V2_ENABLED", "");
    const res = await get();
    expect(res.status).toBe(404);
    expect(sb.tables).toEqual([]);
  });

  it("returns per-market values, confidence, attribution and method version from a whitelist", async () => {
    sb.valuations = {
      data: [
        row({ market: "US", currency: "USD", fair: 20, low: 15, high: 25, sold_count: 1, active_count: 3, confidence_band: "low", confidence_score: 30,
          sources: [{ source_id: "soldgraph:whatnot_us_active", count: 3, latest_date: "2026-10-17T09:00:00Z" }] }),
        row({
          // Raw fields that must never pass through, even if a row carried them.
          title: "Hatbox Ghost LE 2000", listing_url: "https://www.ebay.co.uk/itm/1", image_url: "https://i.ebayimg.com/x.jpg",
          seller: "someone", external_id: "123",
          sources: [
            { source_id: "soldgraph:ebay_gb_sold", count: 9, latest_date: "2026-10-01", title: "x", listing_url: "https://x" },
            { source_id: "Bad Source!", count: 1, latest_date: "2026-10-01" },
          ],
        }),
        row({ market: "FR", currency: "EUR", low: null, fair: null, high: null, sold_count: 0, active_count: 0,
          confidence_band: "insufficient", confidence_score: 0, sources: [], expires_at: "2020-01-01T00:00:00Z" }),
      ],
      error: null,
    };
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pinId: "PHUK-00000001",
      primaryMarket: "UK",
      valuations: [
        {
          market: "UK", currency: "GBP", basis: "sold", low: 8.5, fair: 12, high: 15.25, soldCount: 9, activeCount: 0,
          confidence: { score: 72, band: "high" },
          sources: [{ sourceId: "soldgraph:ebay_gb_sold", count: 9, latestDate: "2026-10-01" }],
          sourceSummaries: [],
          methodVersion: "v2.1", calculatedAt: "2026-10-18T12:00:00.000Z", stale: false,
        },
        {
          market: "FR", currency: "EUR", basis: "none", low: null, fair: null, high: null, soldCount: 0, activeCount: 0,
          confidence: { score: 0, band: "insufficient" }, sources: [], sourceSummaries: [],
          methodVersion: "v2.1", calculatedAt: "2026-10-18T12:00:00.000Z", stale: true,
        },
        {
          market: "US", currency: "USD", basis: "listings", low: 15, fair: 20, high: 25, soldCount: 1, activeCount: 3,
          confidence: { score: 30, band: "low" },
          sources: [{ sourceId: "soldgraph:whatnot_us_active", count: 3, latestDate: "2026-10-17" }],
          sourceSummaries: [],
          methodVersion: "v2.1", calculatedAt: "2026-10-18T12:00:00.000Z", stale: false,
        },
      ],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/ebay\.co\.uk|ebayimg|someone|Hatbox|external_id|pin_id|expires/);
  });

  it("reads as the caller (RLS applies), never with the service role key, and writes nothing", async () => {
    await get();
    expect(sb.created.some(c => c.key === "service-role-key-should-not-be-used")).toBe(false);
    expect(sb.created).toContainEqual({ key: "test-anon-key", headers: { Authorization: "Bearer good-token" } });
    expect(sb.tables).toEqual(["pins", "market_valuations"]);
    expect(sb.writes).toBe(0);
  });

  it("falls back to FR then US for the primary market", async () => {
    sb.valuations = { data: [row({ market: "US", currency: "USD" }), row({ market: "FR", currency: "EUR" })], error: null };
    expect((await get()).body.primaryMarket).toBe("FR");
    sb.valuations = { data: [], error: null };
    expect((await get()).body).toEqual({ pinId: "PHUK-00000001", primaryMarket: null, valuations: [] });
  });

  it("404s for an unknown or malformed pin id", async () => {
    sb.pin = { data: null, error: null };
    expect((await get()).status).toBe(404);
    expect((await get("not%20an%20id")).status).toBe(404);
  });

  it("returns a generic 500 without database detail", async () => {
    sb.valuations = { data: null, error: { code: "57014", message: "statement timeout on market_valuations secret" } };
    const res = await get();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to load market valuations" });
    sb.pin = { data: null, error: { message: "pins secret detail" } };
    const res2 = await get();
    expect(res2.status).toBe(500);
    expect(JSON.stringify(res2.body)).not.toContain("secret");
  });

  it("returns only markets in MARKET_VALUATION_PUBLISHED_MARKETS (default: none)", async () => {
    sb.valuations = {
      data: [row(), row({ market: "FR", currency: "EUR" }), row({ market: "US", currency: "USD" })],
      error: null,
    };
    vi.stubEnv("MARKET_VALUATION_PUBLISHED_MARKETS", "");
    expect((await get()).body).toEqual({ pinId: "PHUK-00000001", primaryMarket: null, valuations: [] });

    vi.stubEnv("MARKET_VALUATION_PUBLISHED_MARKETS", " uk , DE,");
    const uk = await get();
    expect(uk.body.valuations.map((v: { market: string }) => v.market)).toEqual(["UK"]);
    expect(uk.body.primaryMarket).toBe("UK");

    vi.stubEnv("MARKET_VALUATION_PUBLISHED_MARKETS", "US");
    const us = await get();
    expect(us.body.valuations.map((v: { market: string }) => v.market)).toEqual(["US"]);
    expect(us.body.primaryMarket).toBe("US");
  });

  it("never returns values built before region provenance (older method versions)", async () => {
    sb.valuations = {
      data: [row({ method_version: "v2.0" }), row({ market: "FR", currency: "EUR", method_version: "v2.1" }), row({ market: "US", currency: "USD", method_version: "" })],
      error: null,
    };
    const res = await get();
    expect(res.body.valuations.map((v: { market: string }) => v.market)).toEqual(["FR"]);
    expect(res.body.primaryMarket).toBe("FR");
  });

  it("returns per-source summaries from a whitelist, one per source, never merging providers", async () => {
    sb.valuations = {
      data: [row({
        source_summaries: [
          { source_id: "soldgraph:ebay_gb_sold", provider: "soldgraph", evidence_type: "sold", count: 9, latest_date: "2026-10-01T10:00:00Z", median: 12,
            title: "Hatbox Ghost", listing_url: "https://www.ebay.co.uk/itm/1", seller: "someone" },
          { source_id: "soldgraph:vinted_gb_active", provider: "soldgraph", evidence_type: "active", count: 4, latest_date: "2026-10-17", median: 14, low: 10, high: 20 },
          { source_id: "ebay_browse:ebay_gb_active", provider: "ebay_browse", evidence_type: "active", count: 2, latest_date: "2026-10-16", median: 16, low: 15, high: 17 },
          // Rejected: provider does not match the source id, duplicate source, bad id, unknown type.
          { source_id: "ebay_browse:ebay_gb_sold", provider: "soldgraph", evidence_type: "sold", count: 1, median: 1 },
          { source_id: "soldgraph:ebay_gb_sold", provider: "soldgraph", evidence_type: "sold", count: 99, median: 99 },
          { source_id: "Bad Source!", provider: "Bad Source!", evidence_type: "sold", count: 1 },
          { source_id: "x:y", provider: "x", evidence_type: "listing", count: 1 },
        ],
      })],
      error: null,
    };
    const res = await get();
    expect(res.status).toBe(200);
    expect(sb.columns).toEqual(["id", expect.stringContaining("source_summaries")]);
    expect(sb.columns.join(",")).not.toContain("*");
    expect(res.body.valuations[0].sourceSummaries).toEqual([
      { sourceId: "soldgraph:ebay_gb_sold", provider: "soldgraph", evidenceType: "sold", count: 9, latestSoldDate: "2026-10-01", median: 12 },
      { sourceId: "soldgraph:vinted_gb_active", provider: "soldgraph", evidenceType: "active", count: 4, latestSeenDate: "2026-10-17", low: 10, high: 20, median: 14 },
      { sourceId: "ebay_browse:ebay_gb_active", provider: "ebay_browse", evidenceType: "active", count: 2, latestSeenDate: "2026-10-16", low: 15, high: 17, median: 16 },
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/ebay\.co\.uk|someone|Hatbox|listing_url|title/);
  });

  it("never returns listing rows or links with valuations on and comps off", async () => {
    vi.stubEnv("MARKET_COMPS_PUBLIC_ENABLED", "");
    const res = await get();
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/https?:|listing|comps/i);
    const comps = await request(app).get("/api/pins/PHUK-00000001/market-comps?market=UK").set("Authorization", "Bearer good-token");
    expect(comps.status).toBe(404);
  });

  it("offers no way to trigger a refresh", async () => {
    for (const path of ["/api/pins/PHUK-00000001/market-valuations", "/api/pins/PHUK-00000001/market-valuations/refresh"]) {
      const res = await request(app).post(path).set("Authorization", "Bearer good-token");
      expect(res.status).toBe(404);
    }
    expect(sb.writes).toBe(0);
  });
});
