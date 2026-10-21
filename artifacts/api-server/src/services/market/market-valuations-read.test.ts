// Tests for the lib/pin-repository market_valuations read path (#404,
// migration 049). They run here because lib/pin-repository has no test runner.
import { describe, expect, it, vi } from "vitest";
import {
  MARKET_VALUATION_COLUMNS,
  MARKET_VALUATION_COLUMNS_WITH_SUMMARIES,
  getMarketValuations,
  mapMarketValuationRow,
  type MarketValuationsClient,
} from "@workspace/pin-repository";

const PIN = "3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f";

const row = (over: Record<string, unknown> = {}) => ({
  pin_id: PIN,
  market: "UK",
  currency: "GBP",
  low: "8.50",
  fair: 12,
  high: 15.25,
  sold_count: 9,
  active_count: 3,
  confidence_score: 72,
  confidence_band: "medium",
  sources: [{ source_id: "soldgraph:ebay_gb_sold", count: 9, latest_date: "2026-10-01" }],
  method_version: "v2.0",
  calculated_at: "2026-10-18T12:00:00Z",
  expires_at: "2026-10-25T12:00:00Z",
  ...over,
});

function mockClient(result: { data: unknown; error: unknown }) {
  const eq = vi.fn(async () => result);
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as MarketValuationsClient, from, select, eq };
}

describe("market valuations read (pin-repository)", () => {
  it("maps a row to camelCase with numeric values", () => {
    expect(mapMarketValuationRow(row())).toEqual({
      pinId: PIN,
      market: "UK",
      currency: "GBP",
      low: 8.5,
      fair: 12,
      high: 15.25,
      soldCount: 9,
      activeCount: 3,
      confidenceScore: 72,
      confidenceBand: "medium",
      sources: [{ sourceId: "soldgraph:ebay_gb_sold", count: 9, latestDate: "2026-10-01" }],
      methodVersion: "v2.0",
      calculatedAt: "2026-10-18T12:00:00Z",
      expiresAt: "2026-10-25T12:00:00Z",
    });
  });

  it("omits null price points and drops rows with an unknown market or band", () => {
    const v = mapMarketValuationRow(row({ low: null, fair: null, high: null, confidence_band: "insufficient" }));
    expect(v).not.toBeNull();
    expect(v).not.toHaveProperty("low");
    expect(v).not.toHaveProperty("fair");
    expect(mapMarketValuationRow(row({ market: "DE" }))).toBeNull();
    expect(mapMarketValuationRow(row({ confidence_band: "great" }))).toBeNull();
  });

  it("keeps only source id, count and latest date from sources", () => {
    const v = mapMarketValuationRow(
      row({ sources: [{ source_id: "a:b", count: "2", title: "x", listing_url: "https://x" }, { count: 1 }, "junk"] }),
    );
    expect(v?.sources).toEqual([{ sourceId: "a:b", count: 2 }]);
  });

  it("selects explicit columns for one pin and orders UK, FR, US", async () => {
    const { client, from, select, eq } = mockClient({
      data: [row({ market: "US", currency: "USD" }), row({ market: "FR", currency: "EUR" }), row()],
      error: null,
    });
    const out = await getMarketValuations(client, PIN);
    expect(from).toHaveBeenCalledWith("market_valuations");
    expect(select).toHaveBeenCalledWith(MARKET_VALUATION_COLUMNS);
    expect(MARKET_VALUATION_COLUMNS).not.toContain("*");
    expect(eq).toHaveBeenCalledWith("pin_id", PIN);
    expect(out.map((v) => v.market)).toEqual(["UK", "FR", "US"]);
  });

  it("maps per-source summaries (055) key by key, keeping low/high for asking-price sources only", () => {
    const v = mapMarketValuationRow(row({
      source_summaries: [
        { source_id: "soldgraph:ebay_gb_sold", provider: "soldgraph", evidence_type: "sold", count: "3", latest_date: "2026-10-01", median: "12", low: 1, high: 2, title: "x" },
        { source_id: "ebay_browse:ebay_gb_active", provider: "ebay_browse", evidence_type: "active", count: 2, median: 16, low: 15, high: 17 },
        { source_id: "x:y", provider: "x", evidence_type: "other", count: 1 },
        { source_id: "x:z", evidence_type: "sold", count: 1 },
        "junk",
      ],
    }));
    expect(v?.sourceSummaries).toEqual([
      { sourceId: "soldgraph:ebay_gb_sold", provider: "soldgraph", evidenceType: "sold", count: 3, latestDate: "2026-10-01", median: 12 },
      { sourceId: "ebay_browse:ebay_gb_active", provider: "ebay_browse", evidenceType: "active", count: 2, median: 16, low: 15, high: 17 },
    ]);
    expect(mapMarketValuationRow(row())).not.toHaveProperty("sourceSummaries");
  });

  it("reads source_summaries when asked, and falls back without them before 055 is applied", async () => {
    const ok = mockClient({ data: [row({ source_summaries: [] })], error: null });
    expect((await getMarketValuations(ok.client, PIN, { withSummaries: true }))[0].sourceSummaries).toEqual([]);
    expect(ok.select).toHaveBeenCalledWith(MARKET_VALUATION_COLUMNS_WITH_SUMMARIES);
    expect(MARKET_VALUATION_COLUMNS_WITH_SUMMARIES).not.toContain("*");

    let n = 0;
    const eq = vi.fn(async () => (n++ === 0 ? { data: null, error: { code: "42703", message: "column does not exist" } } : { data: [row()], error: null }));
    const select = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ select })) } as unknown as MarketValuationsClient;
    const out = await getMarketValuations(client, PIN, { withSummaries: true });
    expect(select.mock.calls.map(c => (c as unknown[])[0])).toEqual([MARKET_VALUATION_COLUMNS_WITH_SUMMARIES, MARKET_VALUATION_COLUMNS]);
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty("sourceSummaries");
  });

  it("returns [] for a non-uuid id without querying", async () => {
    const { client, from } = mockClient({ data: [], error: null });
    expect(await getMarketValuations(client, "PHUK-00000001")).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns [] before migration 049 is applied, and throws a generic error otherwise", async () => {
    const missing = mockClient({ data: null, error: { code: "PGRST205", message: "Could not find the table" } });
    expect(await getMarketValuations(missing.client, PIN)).toEqual([]);
    const failing = mockClient({ data: null, error: { code: "57014", message: "statement timeout on market_valuations" } });
    await expect(getMarketValuations(failing.client, PIN)).rejects.toThrow("Could not load market valuations");
  });
});
