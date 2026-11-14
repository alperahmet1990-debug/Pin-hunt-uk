/**
 * GET /pins/market-values reads getLatestValuesForPins. Lists show a
 * "UK asking ~£x" chip only for well-supported UK values (WP1 step 3), so the
 * batch carries each value's confidence, and still prefers UK over US.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const tables: Record<string, unknown[]> = {};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      const chain = () => query;
      Object.assign(query, {
        select: chain, in: chain, not: chain,
        then: (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null }),
      });
      return query;
    },
  }),
}));

process.env.SUPABASE_URL = "https://example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";

const { getLatestValuesForPins } = await import("./valuation");

beforeEach(() => {
  tables.pins = [{ id: "u1", pinhunt_id: "PHUK-1" }, { id: "u2", pinhunt_id: "PHUK-2" }];
  tables.pin_market_estimates = [
    { pin_id: "u1", marketplace: "EBAY_US", currency: "USD", estimated_mid: 20, confidence: "high", calculated_at: "2026-11-01T00:00:00Z", expires_at: "2999-01-01T00:00:00Z" },
    { pin_id: "u1", marketplace: "EBAY_GB", currency: "GBP", estimated_mid: 14.6, confidence: "medium", calculated_at: "2026-11-01T00:00:00Z", expires_at: "2000-01-01T00:00:00Z" },
    { pin_id: "u2", marketplace: "EBAY_US", currency: "USD", estimated_mid: 9, confidence: "low", calculated_at: "2026-11-01T00:00:00Z", expires_at: "2999-01-01T00:00:00Z" },
  ];
});

describe("getLatestValuesForPins", () => {
  it("prefers the UK value and returns its confidence", async () => {
    const values = await getLatestValuesForPins(["PHUK-1", "PHUK-2"]);
    expect(values["PHUK-1"]).toMatchObject({ marketplace: "EBAY_GB", currency: "GBP", mid: 14.6, confidence: "medium", stale: true });
    expect(values["PHUK-2"]).toMatchObject({ marketplace: "EBAY_US", confidence: "low", stale: false });
  });
});
