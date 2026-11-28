import { describe, expect, it } from "vitest";
import { applyConfidenceRules, scanTextTerms } from "./scan";

describe("applyConfidenceRules", () => {
  const m = (pinId: string, confidence: number) => ({ pinId, confidence, reasoning: "r" });

  it("caps matches no picture checked at 60%, and re-sorts after the caps", () => {
    const r = applyConfidenceRules([m("A", 92), m("B", 80)], { verified: true, pictured: new Set(["B"]), formatMismatch: new Set() });
    // A wasn't pictured: 92 becomes 60 and drops below the checked 80.
    expect(r.matches.map((x) => [x.pinId, x.confidence, x.verified])).toEqual([["B", 80, true], ["A", 60, false]]);
    expect(r.status).toBe("suggested");
  });

  it("with no picture check at all, nothing is checked and the top is at most 60%", () => {
    const r = applyConfidenceRules([m("A", 95)], { verified: false, pictured: new Set(["A"]), formatMismatch: new Set() });
    expect(r.matches[0]).toMatchObject({ confidence: 60, verified: false });
    expect(r.status).toBe("suggested");
  });

  it("a checked match under 40% is not identified; unchecked under 25% neither", () => {
    expect(applyConfidenceRules([m("A", 38)], { verified: true, pictured: new Set(["A"]), formatMismatch: new Set() }).status).toBe("unmatched");
    expect(applyConfidenceRules([m("A", 24)], { verified: false, pictured: new Set(), formatMismatch: new Set() }).status).toBe("unmatched");
    expect(applyConfidenceRules([], { verified: false, pictured: new Set(), formatMismatch: new Set() }).status).toBe("unmatched");
  });

  it("a different format is capped at 35% even when the art matched", () => {
    const r = applyConfidenceRules([m("A", 98)], { verified: true, pictured: new Set(["A"]), formatMismatch: new Set(["A"]) });
    expect(r.matches[0].confidence).toBe(35);
    expect(r.status).toBe("unmatched");
  });

  it("cleans odd confidences", () => {
    const r = applyConfidenceRules([{ pinId: "A", confidence: "x" as unknown as number, reasoning: "" }, m("B", 140)], { verified: true, pictured: new Set(["A", "B"]), formatMismatch: new Set() });
    expect(r.matches.map((x) => x.confidence)).toEqual([100, 0]);
  });
});

describe("scanTextTerms", () => {
  it("puts printed text first, then Vision's OCR lines, then its other terms, without repeats", () => {
    expect(scanTextTerms("ALOHA 2026", { ocrLines: ["aloha 2026", "Disneyland Paris", "extra line"] }, ["Stitch", "Disneyland Paris"]))
      .toEqual(["ALOHA 2026", "Disneyland Paris", "Stitch"]);
    expect(scanTextTerms("", null, ["Stitch"])).toEqual(["Stitch"]);
  });
});

import { referencePlan, shouldCompare } from "../services/scanVerify";

describe("app-scan PR 2: compare more, within the time", () => {
  it("compares confident rankings too unless SCAN_ALWAYS_COMPARE=false; never implausible ones", () => {
    expect(shouldCompare("compare", {})).toBe(true);
    expect(shouldCompare("confident", {})).toBe(true);
    expect(shouldCompare("confident", { SCAN_ALWAYS_COMPARE: "false" })).toBe(false);
    expect(shouldCompare("implausible", {})).toBe(false);
  });

  it("shows 5 pictures (best 3 at high detail) with 14 s or more left; otherwise the old 3 at low detail", () => {
    expect(referencePlan(20_000, {})).toEqual({ count: 5, highDetail: 3 });
    expect(referencePlan(14_000, {})).toEqual({ count: 5, highDetail: 3 });
    expect(referencePlan(13_999, {})).toEqual({ count: 3, highDetail: 0 });
    expect(referencePlan(20_000, { SCAN_MAX_REFERENCES: "8" })).toEqual({ count: 8, highDetail: 3 });
    expect(referencePlan(20_000, { SCAN_MAX_REFERENCES: "2" })).toEqual({ count: 2, highDetail: 2 });
    expect(referencePlan(20_000, { SCAN_MAX_REFERENCES: "50" }).count).toBe(8);
  });
});
