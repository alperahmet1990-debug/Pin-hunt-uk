/**
 * Golden set for listing matching v2 (#407): labelled EN + FR titles, sold
 * and active, covering correct matches, wrong pins, wrong years, wrong LE
 * sizes and editions, variants, bundles and complete sets.
 *
 * Acceptance: precision on accepted listings is at least 95%. Recall is
 * printed and held to a floor so a regression is noticed.
 */
import { describe, expect, it } from "vitest";
import { REJECTION_REASONS, matchListing, type MatchResult } from "./matching";
import { fixturePin, readFixture } from "./__fixtures__/load";

interface GoldenCase {
  id: string;
  pin: string;
  market: string;
  source: "sold" | "active";
  label: string;
  match: boolean;
  reason?: string;
  title: string;
}

const golden = readFixture<{ cases: GoldenCase[] }>("golden-set.json").cases;

function metrics(results: Array<{ c: GoldenCase; r: MatchResult }>) {
  const tp = results.filter(x => x.r.accepted && x.c.match).length;
  const fp = results.filter(x => x.r.accepted && !x.c.match).length;
  const fn = results.filter(x => !x.r.accepted && x.c.match).length;
  return {
    tp, fp, fn,
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 1 : tp / (tp + fn),
  };
}

const v2 = golden.map(c => ({ c, r: matchListing(fixturePin(c.pin), c.title, { mode: "v2" }) }));
const v1 = golden.map(c => ({ c, r: matchListing(fixturePin(c.pin), c.title, { mode: "v1" }) }));

describe("matching v2 golden set (#407)", () => {
  it("has at least 80 labelled titles covering every required category, EN and FR, sold and active", () => {
    expect(golden.length).toBeGreaterThanOrEqual(80);
    expect(new Set(golden.map(c => c.id)).size).toBe(golden.length);
    for (const label of ["correct", "wrong_pin", "wrong_year", "wrong_le", "variant", "bundle", "complete_set"]) {
      expect(golden.some(c => c.label === label), label).toBe(true);
    }
    expect(v2.some(x => x.r.parsed.lang === "fr")).toBe(true);
    expect(v2.some(x => x.r.parsed.lang === "en")).toBe(true);
    expect(golden.some(c => c.source === "sold")).toBe(true);
    expect(golden.some(c => c.source === "active")).toBe(true);
  });

  it("precision on accepted listings is at least 95%, and recall is recorded", () => {
    const m2 = metrics(v2);
    const m1 = metrics(v1);
    const fmt = (m: ReturnType<typeof metrics>) =>
      `precision ${(m.precision * 100).toFixed(1)}% recall ${(m.recall * 100).toFixed(1)}% (tp ${m.tp}, fp ${m.fp}, fn ${m.fn})`;
    // Recorded in the test output for the PR and the pilot report.
    console.log(`[golden-set] n=${golden.length} v2: ${fmt(m2)} | v1 baseline: ${fmt(m1)}`);
    const misses = v2.filter(x => x.r.accepted !== x.c.match)
      .map(x => `${x.c.id} expected ${x.c.match ? "accept" : "reject"}, got ${x.r.accepted ? "accept" : x.r.rejectionReason}`);
    if (misses.length) console.log(`[golden-set] v2 disagreements:\n  ${misses.join("\n  ")}`);

    expect(m2.precision).toBeGreaterThanOrEqual(0.95);
    expect(m2.recall).toBeGreaterThanOrEqual(0.85);
  });

  it("every v2 rejection has a stable reason; labelled reasons match", () => {
    for (const { c, r } of v2) {
      if (r.accepted) {
        expect(r.rejectionReason, c.id).toBeUndefined();
        continue;
      }
      expect(REJECTION_REASONS, c.id).toContain(r.rejectionReason);
      if (c.reason) expect(r.rejectionReason, `${c.id}: ${c.title}`).toBe(c.reason);
    }
  });

  it("rejections keep their parsed attributes for research leads", () => {
    const rejected = v2.filter(x => !x.r.accepted);
    expect(rejected.length).toBeGreaterThan(0);
    for (const { r } of rejected) {
      expect(r.parsed.normalised.length).toBeGreaterThan(0);
      expect(Array.isArray(r.parsed.variantTerms)).toBe(true);
      expect(Array.isArray(r.parsed.charactersGuess)).toBe(true);
      expect(typeof r.score).toBe("number");
    }
  });
});
