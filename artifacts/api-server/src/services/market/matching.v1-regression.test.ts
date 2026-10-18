/**
 * v1 regression (#407): pins down scoreListing behaviour for eBay Browse
 * active listings. The expected values were captured from valuation.ts
 * before matching moved to services/market/matching.ts. They must never
 * change: v2 matching is opt-in and v1 callers keep v1 results.
 */
import { describe, expect, it } from "vitest";
import { scoreListing, buildSearchQueries as valuationBuildSearchQueries } from "../valuation";
import {
  REJECTION_REASONS,
  buildSearchQueries,
  matchListing,
  scoreListing as matchingScoreListing,
} from "./matching";
import { fixturePin, readFixture } from "./__fixtures__/load";

interface V1Case { pin: string; title: string; expected: number | null }

const fixture = readFixture<{ cases: V1Case[] }>("v1-regression.json");

describe("v1 scoreListing regression (#407)", () => {
  it("has a representative fixture with both accepted and rejected titles", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(30);
    expect(fixture.cases.some(c => c.expected === null)).toBe(true);
    expect(fixture.cases.some(c => c.expected !== null)).toBe(true);
  });

  it.each(fixture.cases.map(c => [c.pin, c.title, c.expected] as const))(
    "valuation.scoreListing(%s, %j) === %s",
    (pinKey, title, expected) => {
      expect(scoreListing(fixturePin(pinKey), { itemId: "fixture", title })).toBe(expected);
    },
  );

  it.each(fixture.cases.map(c => [c.pin, c.title, c.expected] as const))(
    "matchListing default mode is v1 for (%s, %j)",
    (pinKey, title, expected) => {
      const r = matchListing(fixturePin(pinKey), title);
      expect(r.mode).toBe("v1");
      expect(r.accepted).toBe(expected !== null);
      expect(r.score).toBe(expected ?? r.score);
      if (expected === null) expect(REJECTION_REASONS).toContain(r.rejectionReason);
      else expect(r.rejectionReason).toBeUndefined();
    },
  );

  it("valuation.ts re-exports the matching module's v1 functions", () => {
    expect(scoreListing).toBe(matchingScoreListing);
    expect(valuationBuildSearchQueries).toBe(buildSearchQueries);
  });
});
