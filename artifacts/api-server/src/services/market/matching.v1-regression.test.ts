/**
 * v1 regression (#407): pins down scoreListing behaviour for eBay Browse
 * active listings. The expected values were captured from valuation.ts
 * before matching moved to services/market/matching.ts. They must never
 * change: v2 matching is opt-in and v1 callers keep v1 results.
 */
import { describe, expect, it } from "vitest";
import { scoreListing } from "../valuation";
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
});
