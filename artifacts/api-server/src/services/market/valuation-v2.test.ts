/**
 * Valuation v2 rules (SG-05, #408) on fixed synthetic fixtures. Pure: no
 * network, no database, a fixed clock.
 */
import { describe, expect, it } from "vitest";
import {
  VALUATION_V2_METHOD_VERSION,
  basisForCounts,
  computeMarketValuation,
  computePinValuations,
  primaryMarket,
  recencyWeight,
  weightedQuantile,
  type MarketValuationV2,
  type ValuationEvidence,
} from "./valuation-v2";

const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const SOURCES = {
  UK: { sold: "soldgraph:ebay_gb_sold", active: "soldgraph:vinted_gb_active", currency: "GBP" },
  FR: { sold: "soldgraph:ebay_fr_sold", active: "soldgraph:vinted_fr_active", currency: "EUR" },
  US: { sold: "soldgraph:ebay_us_sold", active: "soldgraph:whatnot_us_active", currency: "USD" },
} as const;

type M = keyof typeof SOURCES;

function sold(price: number | null, age = 10, over: Partial<ValuationEvidence> & { market?: M } = {}): ValuationEvidence {
  const market = over.market ?? "UK";
  return {
    sourceId: SOURCES[market].sold,
    market,
    evidenceType: "sold",
    priceKind: "sold",
    price,
    currency: SOURCES[market].currency,
    soldDate: daysAgo(age),
    bestOfferAccepted: false,
    matchScore: 100,
    // Fetched with the domestic filter (#450): region-verified eBay sold evidence.
    locationFilter: "domestic",
    ...over,
  };
}

/** Best Offer status not reported: a sale that may have been an accepted offer. */
const possibleOffer = (price: number, age = 10, over: Partial<ValuationEvidence> = {}) =>
  sold(price, age, { priceKind: "sold_possible_offer", bestOfferAccepted: null, ...over });

/** An accepted Best Offer: the adapter stores no sale price for these. */
const bestOffer = (over: Partial<ValuationEvidence> = {}) =>
  sold(null, 10, { priceKind: "sold_possible_offer", bestOfferAccepted: true, ...over });

function active(price: number, over: Partial<ValuationEvidence> & { market?: M } = {}): ValuationEvidence {
  const market = over.market ?? "UK";
  return {
    sourceId: SOURCES[market].active,
    market,
    evidenceType: "active",
    priceKind: "active",
    price,
    currency: SOURCES[market].currency,
    soldDate: null,
    bestOfferAccepted: null,
    matchScore: 100,
    seenAt: daysAgo(1),
    ...over,
  };
}

const value = (market: M, ev: ValuationEvidence[]) => computeMarketValuation(market, ev, { now: NOW });

function expectConsistent(v: MarketValuationV2) {
  if (v.low !== null && v.fair !== null) expect(v.low).toBeLessThanOrEqual(v.fair);
  if (v.fair !== null && v.high !== null) expect(v.fair).toBeLessThanOrEqual(v.high);
  expect(v.confidence.score).toBeGreaterThanOrEqual(0);
  expect(v.confidence.score).toBeLessThanOrEqual(100);
  // The score is exactly the sum of its reasons.
  expect(v.confidence.reasons.reduce((s, r) => s + r.points, 0)).toBe(v.confidence.score);
  for (const s of v.sources) expect(Object.keys(s).sort()).toEqual(["count", "latest_date", "source_id"]);
  expect(v.methodVersion).toBe(VALUATION_V2_METHOD_VERSION);
}

describe("helpers", () => {
  it("weights sales 1.0 to 90 days, tapering to 0.4 at 365, unused after", () => {
    expect(recencyWeight(0)).toBe(1);
    expect(recencyWeight(90)).toBe(1);
    expect(recencyWeight(227.5)).toBeCloseTo(0.7, 10);
    expect(recencyWeight(365)).toBeCloseTo(0.4, 10);
    expect(recencyWeight(366)).toBeNull();
  });

  it("weighted quantiles match the ordinary median with equal weights", () => {
    const eq = [1, 2, 3, 4].map(v => ({ value: v, weight: 1 }));
    expect(weightedQuantile(eq, 0.5)).toBe(2.5);
    expect(weightedQuantile(eq, 0)).toBe(1);
    expect(weightedQuantile(eq, 1)).toBe(4);
  });

  it("derives the basis from stored counts the same way the engine does", () => {
    expect(basisForCounts(0, 0)).toBe("none");
    expect(basisForCounts(2, 3)).toBe("listings");
    expect(basisForCounts(2, 0)).toBe("sold");
    expect(basisForCounts(3, 0)).toBe("sold");
  });
});

describe("sold only", () => {
  const ev = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(p => sold(p));
  const v = value("UK", ev);

  it("fair = weighted median, low = p20, high = p80", () => {
    expect(v).toMatchObject({ market: "UK", currency: "GBP", basis: "sold", low: 11.5, fair: 14.5, high: 17.5 });
    expect(v.soldCount).toBe(10);
    expect(v.activeCount).toBe(0);
    expectConsistent(v);
  });

  it("scores high confidence and explains every point", () => {
    expect(v.confidence).toEqual({
      score: 94,
      band: "high",
      reasons: [
        { code: "sold_evidence", points: 40, value: 10 },
        { code: "recency", points: 20, value: 1 },
        { code: "spread", points: 14, value: 0.31 },
        { code: "match_quality", points: 20, value: 1 },
      ],
    });
  });

  it("attributes the source with count and latest date only", () => {
    expect(v.sources).toEqual([{ source_id: "soldgraph:ebay_gb_sold", count: 10, latest_date: daysAgo(10).slice(0, 10) }]);
  });

  it("ignores active listings once there are 3 or more sales", () => {
    const withActive = value("UK", [...ev, active(99), active(98), active(97)]);
    expect(withActive).toMatchObject({ basis: "sold", fair: 14.5, activeCount: 0 });
    expect(withActive.sources.map(s => s.source_id)).toEqual(["soldgraph:ebay_gb_sold"]);
  });
});

describe("sold plus Best Offer", () => {
  it("excludes accepted Best Offers and rows with no sale price from Low/Fair/High", () => {
    const v = value("UK", [sold(10), sold(12), sold(14), bestOffer(), bestOffer(), bestOffer({ price: 50 }), sold(null)]);
    expect(v).toMatchObject({ basis: "sold", fair: 12, soldCount: 3 });
    expect(v.excluded).toEqual({ best_offer: 3, no_sale_price: 1 });
    expectConsistent(v);
  });

  it("lets a possible Best Offer set Fair but never lift High above Fair, and lowers confidence", () => {
    const verified = [10, 12, 14, 16].map(p => sold(p));
    const asVerified = value("UK", [...verified, sold(20)]);
    const asPossible = value("UK", [...verified, possibleOffer(20)]);
    expect(asVerified).toMatchObject({ fair: 14, high: 18 });
    expect(asPossible).toMatchObject({ fair: 14, high: 15 });
    expect(asPossible.confidence.reasons).toContainEqual({ code: "possible_offer", points: -2, value: 0.2 });
    expect(asPossible.confidence.score).toBeLessThan(asVerified.confidence.score);
    expectConsistent(asPossible);
  });

  it("uses median_excluding_best_offer as the sold anchor when every sale was a Best Offer", () => {
    const v = value("UK", [
      bestOffer({ medianExcludingBestOffer: 9 }),
      bestOffer({ medianExcludingBestOffer: 9 }),
      active(20),
      active(22),
      active(24),
    ]);
    expect(v.basis).toBe("listings");
    expect(v.soldCount).toBe(0);
    expect(v.fair).toBe(10.35); // 9 × 1.15
    expectConsistent(v);
  });
});

describe("active only", () => {
  it("builds the range from listings, labelled as listings, band capped at low", () => {
    const v = value("UK", [active(8), active(10), active(12)]);
    expect(v).toMatchObject({ basis: "listings", low: 8.2, fair: 10, high: 11.8, soldCount: 0, activeCount: 3 });
    expect(v.confidence.band).toBe("low");
    expect(v.confidence.score).toBeLessThanOrEqual(44);
    expect(v.sources).toEqual([{ source_id: "soldgraph:vinted_gb_active", count: 3, latest_date: daysAgo(1).slice(0, 10) }]);
    expectConsistent(v);
  });
});

describe("mixed sold and active", () => {
  it("fills in with listings when fewer than 3 sales, never lifting Fair more than 15% above the sold median", () => {
    const v = value("UK", [sold(10), active(20), active(22), active(24)]);
    expect(v).toMatchObject({ basis: "listings", fair: 11.5, low: 10, soldCount: 1, activeCount: 3 });
    expect(v.confidence.band).toBe("low");
    expect(v.sources.map(s => s.source_id)).toEqual(["soldgraph:ebay_gb_sold", "soldgraph:vinted_gb_active"]);
    expectConsistent(v);
  });

  it("does not cap Fair when listings agree with sales", () => {
    const v = value("UK", [sold(10), sold(10), active(10), active(11), active(12)]);
    expect(v.fair).toBe(10);
    expectConsistent(v);
  });
});

describe("outliers", () => {
  it("trims prices outside 1.5×IQR before any figure is taken", () => {
    const v = value("UK", [10, 11, 12, 13, 14, 100].map(p => sold(p)));
    expect(v.excluded).toEqual({ outlier: 1 });
    expect(v.soldCount).toBe(5);
    expect(v.fair).toBe(12);
    expect(v.high).toBeLessThan(15);
    expectConsistent(v);
  });
});

describe("stale data", () => {
  it("drops sales older than 365 days", () => {
    const v = value("UK", [sold(10, 400), sold(12, 500)]);
    expect(v).toMatchObject({ basis: "none", fair: null, soldCount: 0 });
    expect(v.excluded).toEqual({ too_old: 2 });
    expect(v.confidence.band).toBe("insufficient");
  });

  it("gives older sales less weight and less recency confidence", () => {
    const v = value("UK", [sold(10), sold(10), sold(10), sold(30, 300), sold(30, 300), sold(30, 300)]);
    expect(v.fair).toBe(10); // the unweighted median would be 20
    const recency = v.confidence.reasons.find(r => r.code === "recency");
    expect(recency?.points).toBeLessThan(20);
    expectConsistent(v);
  });
});

describe("single listing", () => {
  it("one sale: Fair only, no range, band low", () => {
    const v = value("UK", [sold(12)]);
    expect(v).toMatchObject({ basis: "sold", low: null, fair: 12, high: null, soldCount: 1 });
    expect(v.confidence.band).toBe("low");
    expect(v.confidence.reasons.map(r => r.code)).toEqual(["sold_evidence", "recency", "spread", "match_quality"]);
    expectConsistent(v);
  });

  it("one listing: Fair only, based on listings", () => {
    const v = value("UK", [active(15)]);
    expect(v).toMatchObject({ basis: "listings", low: null, fair: 15, high: null, activeCount: 1 });
    expect(v.confidence.band).toBe("low");
  });
});

describe("no data", () => {
  it("is insufficient with no figures and no sources", () => {
    const v = value("UK", []);
    expect(v).toMatchObject({ basis: "none", low: null, fair: null, high: null, soldCount: 0, activeCount: 0, sources: [] });
    expect(v.confidence).toEqual({ score: 0, band: "insufficient", reasons: [{ code: "no_evidence", points: 0 }] });
  });
});

describe("each market separately", () => {
  const ev = [
    ...[10, 11, 12].map(p => sold(p, 5, { market: "UK" })),
    ...[20, 21, 22].map(p => sold(p, 5, { market: "FR" })),
    ...[30, 31, 32].map(p => sold(p, 5, { market: "US" })),
    sold(999, 5, { market: "FR", currency: "GBP" }),
  ];
  const all = computePinValuations(ev, { now: NOW });

  it("values UK, FR and US each in its own currency, in priority order", () => {
    expect(all.map(v => [v.market, v.currency, v.fair])).toEqual([
      ["UK", "GBP", 11],
      ["FR", "EUR", 21],
      ["US", "USD", 31],
    ]);
    all.forEach(expectConsistent);
  });

  it("never converts currency: a GBP row tagged FR is dropped", () => {
    expect(all[1].excluded).toEqual({ currency_mismatch: 1 });
  });

  it("primary market is UK, then FR, then US", () => {
    expect(primaryMarket(all)).toBe("UK");
    expect(primaryMarket(computePinValuations(ev.filter(e => e.market !== "UK"), { now: NOW }))).toBe("FR");
    expect(primaryMarket(computePinValuations(ev.filter(e => e.market === "US"), { now: NOW }))).toBe("US");
    expect(primaryMarket(computePinValuations([], { now: NOW }))).toBeNull();
  });
});

describe("confidence", () => {
  it("is deterministic: the same evidence in any order gives the same result", () => {
    const ev = [sold(10), sold(12, 120), possibleOffer(14), sold(16, 30, { matchScore: 55 }), active(18)];
    const a = value("UK", ev);
    const b = value("UK", [...ev].reverse());
    expect(b).toEqual(a);
    expect(value("UK", ev)).toEqual(a);
  });

  it("lower match quality lowers confidence", () => {
    const strong = value("UK", [10, 11, 12, 13, 14].map(p => sold(p)));
    const weak = value("UK", [10, 11, 12, 13, 14].map(p => sold(p, 10, { matchScore: 45 })));
    expect(weak.confidence.score).toBeLessThan(strong.confidence.score);
  });

  it("caps the band at medium below 5 sales", () => {
    const v = value("UK", [10, 10, 10, 10].map(p => sold(p)));
    expect(v.confidence.band).toBe("medium");
    expect(v.confidence.score).toBe(69);
    expect(v.confidence.reasons.at(-1)?.code).toBe("cap_few_sales");
    expectConsistent(v);
  });
});
