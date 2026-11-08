import { describe, expect, it } from "vitest";
import { verifyDecision, VERIFY_MAX_REFERENCES } from "./scanVerify";

const m = (...scores: unknown[]) => scores.map((confidence) => ({ confidence }));

describe("when to compare against catalogue photos", () => {
  it("compares against at most 3 catalogue photos", () => {
    expect(VERIFY_MAX_REFERENCES).toBe(3);
  });

  it("compares when the ranking is unsure between plausible pins", () => {
    expect(verifyDecision(m(70, 40))).toBe("compare");
    expect(verifyDecision(m(90, 80))).toBe("compare"); // sure, but not clearly ahead
    expect(verifyDecision(m(26))).toBe("compare");
  });

  it("skips when the top match is clear", () => {
    expect(verifyDecision(m(92, 40))).toBe("confident");
    expect(verifyDecision(m(85, 65))).toBe("confident");
    expect(verifyDecision(m(88))).toBe("confident");
  });

  it("skips when nothing is plausible (pin probably not in the catalogue)", () => {
    expect(verifyDecision(m(20, 15, 10))).toBe("implausible");
    expect(verifyDecision([])).toBe("implausible");
  });

  it("reads scores sent as text, and ignores junk", () => {
    expect(verifyDecision(m("92", "30"))).toBe("confident");
    expect(verifyDecision(m("n/a", 50))).toBe("compare");
  });
});
