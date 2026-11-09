import { describe, expect, it } from "vitest";
import { isScanId, outcomeFor } from "./scan-outcomes";

describe("outcomeFor (#113)", () => {
  const matches = [{ pinId: "a" }, { pinId: "b" }, { pinId: "c" }];
  it("rank 1 is confirmed", () => expect(outcomeFor(matches, "a")).toEqual({ outcome: "confirmed", rank: 1 }));
  it("ranks 2 and 3 are alternatives", () => {
    expect(outcomeFor(matches, "b")).toEqual({ outcome: "picked_alternative", rank: 2 });
    expect(outcomeFor(matches, "c")).toEqual({ outcome: "picked_alternative", rank: 3 });
  });
  it("null is none of these", () => expect(outcomeFor(matches, null)).toEqual({ outcome: "none", rank: null }));
  it("a pin outside the matches is refused", () => expect(outcomeFor(matches, "z")).toBeNull());
  it("no matches: only none is possible", () => {
    expect(outcomeFor([], "a")).toBeNull();
    expect(outcomeFor([], null)).toEqual({ outcome: "none", rank: null });
  });
});

describe("isScanId", () => {
  it("accepts a UUID only", () => {
    expect(isScanId("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(isScanId("1")).toBe(false);
    expect(isScanId(null)).toBe(false);
  });
});
