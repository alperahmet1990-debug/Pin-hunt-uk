import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Contract tests for GET /api/pins/:pinId/market-comps (SG-12, #446).
// Supabase is mocked: no network, no real database.
const PIN_UUID = "3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f";
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString();

const sb = vi.hoisted(() => ({
  pin: { data: { id: "" } as unknown, error: null as unknown },
  sources: { data: [] as unknown, error: null as unknown },
  listings: { data: [] as unknown, error: null as unknown },
  calls: [] as Array<{ key: string; table: string; op: string; args: unknown[] }>,
  writes: 0,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string) => {
    const from = (table: string) => {
      const result = () => (table === "pins" ? sb.pin : table === "market_sources" ? sb.sources : sb.listings);
      const b: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "gte", "gt", "order", "limit", "or"]) {
        b[op] = (...args: unknown[]) => {
          sb.calls.push({ key, table, op, args });
          return b;
        };
      }
      b.maybeSingle = async () => result();
      b.then = (ok: (r: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
      for (const op of ["insert", "upsert", "update", "delete"]) {
        b[op] = () => {
          sb.writes += 1;
          return Promise.resolve({ error: null });
        };
      }
      return b;
    };
    return {
      auth: {
        getUser: async (token: string) =>
          token === "good-token"
            ? { data: { user: { id: "user-1" } }, error: null }
            : { data: { user: null }, error: { message: "bad jwt" } },
      },
      from,
      rpc: () => {
        sb.writes += 1;
        return Promise.resolve({ data: null, error: null });
      },
    };
  },
}));

import app from "../app";
import { sanitiseListingLink } from "../services/market/publication";

const SOURCES = [
  { id: "soldgraph:ebay_gb_sold", provider: "soldgraph", marketplace: "ebay", market: "UK", evidence_type: "sold", enabled: true },
  { id: "soldgraph:ebay_fr_sold", provider: "soldgraph", marketplace: "ebay", market: "FR", evidence_type: "sold", enabled: true },
  { id: "soldgraph:ebay_us_sold", provider: "soldgraph", marketplace: "ebay", market: "US", evidence_type: "sold", enabled: false },
];

const listing = (over: Record<string, unknown> = {}) => ({
  source_id: "soldgraph:ebay_gb_sold",
  external_id: "item-1",
  price: "24.99",
  currency: "GBP",
  sold_date: daysAgo(3),
  price_kind: "sold",
  best_offer_accepted: false,
  listing_url: "https://www.ebay.co.uk/itm/123456?hash=abc&_trksid=SELLER_SENTINEL#frag",
  location_filter: "domestic",
  item_country: "GB",
  price_is_converted: null,
  // Columns that must never pass through, even if a row carried them.
  title: "Hatbox Ghost LE 2000 TITLE_SENTINEL",
  image_url: "https://i.ebayimg.com/x.jpg",
  seller: "SELLER_SENTINEL",
  location_text: "London, United Kingdom",
  ...over,
});

const get = (query = "?market=UK", token: string | null = "good-token", id = "PHUK-00000001") => {
  const r = request(app).get(`/api/pins/${id}/market-comps${query}`);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};

describe("GET /api/pins/:pinId/market-comps", () => {
  beforeEach(() => {
    vi.stubEnv("MARKET_COMPS_PUBLIC_ENABLED", "true");
    vi.stubEnv("MARKET_VALUATION_PUBLISHED_MARKETS", "UK,FR");
    vi.stubEnv("MARKET_VALUATION_V2_ENABLED", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
    sb.pin = { data: { id: PIN_UUID }, error: null };
    sb.sources = { data: SOURCES, error: null };
    sb.listings = { data: [listing()], error: null };
    sb.calls = [];
    sb.writes = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is 404 for everyone while MARKET_COMPS_PUBLIC_ENABLED is off (the default), before authentication", async () => {
    for (const v of ["", "false", "1", "TRUE"]) {
      vi.stubEnv("MARKET_COMPS_PUBLIC_ENABLED", v);
      expect((await get()).status).toBe(404);
      expect((await get("?market=UK", null)).status).toBe(404);
    }
    expect(sb.calls).toEqual([]);
  });

  it("is not enabled by the valuation flags", async () => {
    vi.stubEnv("MARKET_COMPS_PUBLIC_ENABLED", "");
    vi.stubEnv("MARKET_VALUATION_V2_ENABLED", "true");
    vi.stubEnv("MARKET_VALUATION_PUBLISHED_MARKETS", "UK,FR,US");
    expect((await get()).status).toBe(404);
    expect(sb.calls).toEqual([]);
  });

  it("rejects a missing or invalid token when enabled", async () => {
    expect((await get("?market=UK", null)).status).toBe(401);
    expect((await get("?market=UK", "bad-token")).status).toBe(401);
    expect(sb.calls).toEqual([]);
  });

  it("is 404 for a market outside the publication allow-list, and 400 for a bad market or limit", async () => {
    expect((await get("?market=US")).status).toBe(404);
    vi.stubEnv("MARKET_VALUATION_PUBLISHED_MARKETS", "");
    expect((await get("?market=UK")).status).toBe(404);
    vi.stubEnv("MARKET_VALUATION_PUBLISHED_MARKETS", "UK");
    expect((await get("")).status).toBe(400);
    expect((await get("?market=DE")).status).toBe(400);
    for (const limit of ["0", "51", "abc", "-1", "1.5"]) expect((await get(`?market=UK&limit=${limit}`)).status).toBe(400);
    expect(sb.calls.filter(c => c.table === "market_listings")).toEqual([]);
  });

  it("returns only whitelisted fields, with a sanitised link on the marketplace's own website", async () => {
    const res = await get("?market=uk");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pinId: "PHUK-00000001",
      market: "UK",
      currency: "GBP",
      comps: [
        {
          soldDate: daysAgo(3).slice(0, 10),
          price: 24.99,
          currency: "GBP",
          marketplace: "ebay",
          sourceId: "soldgraph:ebay_gb_sold",
          provider: "soldgraph",
          link: "https://www.ebay.co.uk/itm/123456",
        },
      ],
    });
    expect(Object.keys(res.body.comps[0]).sort()).toEqual(["currency", "link", "marketplace", "price", "provider", "soldDate", "sourceId"]);
    expect(JSON.stringify(res.body)).not.toMatch(/SENTINEL|ebayimg|London|item-1|hash=|#frag|title|seller/i);
  });

  it("reads listings with explicit columns and the service role only after the caller is verified, and writes nothing", async () => {
    await get();
    const listingCalls = sb.calls.filter(c => c.table === "market_listings");
    expect(listingCalls.every(c => c.key === "service-role-test-key")).toBe(true);
    const select = listingCalls.find(c => c.op === "select")!.args[0] as string;
    expect(select).not.toMatch(/\*|title|image|seller|location_text/);
    expect(listingCalls).toContainEqual(expect.objectContaining({ op: "eq", args: ["accepted", true] }));
    expect(listingCalls).toContainEqual(expect.objectContaining({ op: "eq", args: ["pin_id", PIN_UUID] }));
    // The pin is resolved as the caller (RLS), not with the service role.
    expect(sb.calls.find(c => c.table === "pins")!.key).toBe("test-anon-key");
    expect(sb.writes).toBe(0);
  });

  it("excludes Best Offer, possibly-Best-Offer, unpriced, old and unaccepted-currency rows", async () => {
    sb.listings = {
      data: [
        listing({ external_id: "ok" }),
        listing({ external_id: "bo", best_offer_accepted: true, price: null, price_kind: "sold_possible_offer" }),
        listing({ external_id: "maybe-bo", best_offer_accepted: null, price_kind: "sold_possible_offer" }),
        listing({ external_id: "no-price", price: null }),
        listing({ external_id: "zero", price: "0" }),
        listing({ external_id: "old", sold_date: daysAgo(400) }),
        listing({ external_id: "eur", currency: "EUR" }),
        listing({ external_id: "active", price_kind: "active", sold_date: null }),
      ],
      error: null,
    };
    const res = await get();
    expect(res.body.comps).toHaveLength(1);
  });

  it("excludes rows without region provenance (054), converted prices and foreign items", async () => {
    sb.listings = {
      data: [
        listing({ external_id: "ok", sold_date: daysAgo(1) }),
        listing({ external_id: "legacy", location_filter: null, site: null }),
        listing({ external_id: "worldwide", location_filter: "worldwide" }),
        listing({ external_id: "converted", price_is_converted: true }),
        listing({ external_id: "us-seller", item_country: "US" }),
        listing({ external_id: "unknown-country", item_country: null, sold_date: daysAgo(2) }),
      ],
      error: null,
    };
    const res = await get();
    expect(res.body.comps.map((c: { soldDate: string }) => c.soldDate)).toEqual([daysAgo(1).slice(0, 10), daysAgo(2).slice(0, 10)]);
  });

  it("counts an item region-verified under two markets only in the market matching its country", async () => {
    sb.listings = {
      data: [
        listing({ external_id: "dup", item_country: "FR" }),
        listing({ external_id: "dup", source_id: "soldgraph:ebay_fr_sold", currency: "EUR", item_country: "FR",
          listing_url: "https://www.ebay.fr/itm/777" }),
      ],
      error: null,
    };
    expect((await get("?market=UK")).body.comps).toEqual([]);
    const fr = await get("?market=FR");
    expect(fr.body.comps).toEqual([expect.objectContaining({ sourceId: "soldgraph:ebay_fr_sold", currency: "EUR", link: "https://www.ebay.fr/itm/777" })]);
  });

  it("ignores rows from disabled or unknown sources and labels every comp with its own source", async () => {
    sb.sources = {
      data: [...SOURCES, { id: "ebay_browse:ebay_gb_sold", provider: "ebay_browse", marketplace: "ebay", market: "UK", evidence_type: "sold", enabled: true }],
      error: null,
    };
    sb.listings = {
      data: [
        listing({ external_id: "a", sold_date: daysAgo(1) }),
        listing({ external_id: "b", source_id: "ebay_browse:ebay_gb_sold", sold_date: daysAgo(2) }),
        listing({ external_id: "c", source_id: "soldgraph:unknown_sold" }),
      ],
      error: null,
    };
    const res = await get();
    expect(res.body.comps.map((c: { sourceId: string; provider: string }) => [c.sourceId, c.provider])).toEqual([
      ["soldgraph:ebay_gb_sold", "soldgraph"],
      ["ebay_browse:ebay_gb_sold", "ebay_browse"],
    ]);
  });

  it("applies the limit, newest first", async () => {
    sb.listings = {
      data: Array.from({ length: 30 }, (_, i) => listing({ external_id: `i${i}`, sold_date: daysAgo(i + 1) })),
      error: null,
    };
    expect((await get()).body.comps).toHaveLength(20);
    const five = (await get("?market=UK&limit=5")).body.comps as Array<{ soldDate: string }>;
    expect(five.map(c => c.soldDate)).toEqual([1, 2, 3, 4, 5].map(d => daysAgo(d).slice(0, 10)));
  });

  it("404s for an unknown pin and returns a generic 500 without database detail", async () => {
    sb.pin = { data: null, error: null };
    expect((await get()).status).toBe(404);
    sb.pin = { data: { id: PIN_UUID }, error: null };
    sb.listings = { data: null, error: { message: "market_listings secret detail" } };
    const res = await get();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to load comparable sales" });
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    sb.listings = { data: [listing()], error: null };
    const noKey = await get();
    expect(noKey.status).toBe(500);
    expect(JSON.stringify(noKey.body)).not.toMatch(/secret|SUPABASE/);
  });
});

describe("sanitiseListingLink", () => {
  it("keeps https links on the market's own marketplace website, path only", () => {
    expect(sanitiseListingLink("https://www.ebay.co.uk/itm/123?x=1#y", "ebay", "UK")).toBe("https://www.ebay.co.uk/itm/123");
    expect(sanitiseListingLink("https://ebay.fr/itm/9", "ebay", "FR")).toBe("https://ebay.fr/itm/9");
    expect(sanitiseListingLink("https://www.ebay.com/itm/9", "ebay", "US")).toBe("https://www.ebay.com/itm/9");
  });

  it("rejects anything else", () => {
    for (const raw of [
      "http://www.ebay.co.uk/itm/1",
      "https://www.ebay.com/itm/1", // another market's website
      "https://ebay.co.uk.evil.example/itm/1",
      "https://evil.example/www.ebay.co.uk/itm/1",
      "https://user:pass@www.ebay.co.uk/itm/1",
      "https://www.ebay.co.uk:8443/itm/1",
      "https://www.ebay.co.uk/",
      "javascript:alert(1)",
      "not a url",
      "",
      null,
      42,
    ]) {
      expect(sanitiseListingLink(raw, "ebay", "UK")).toBeNull();
    }
    expect(sanitiseListingLink("https://www.vinted.co.uk/items/1", "vinted", "UK")).toBeNull();
  });
});
