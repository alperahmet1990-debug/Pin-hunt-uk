import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkDecision, checkSourceUrl, validateResearchRun } from "./research-run";

const enginePayload = JSON.parse(readFileSync(new URL("./__fixtures__/research-run.pilot.json", import.meta.url), "utf8"));
const clone = () => JSON.parse(JSON.stringify(enginePayload));

describe("validateResearchRun", () => {
  it("accepts the research engine's real output (28-pin pilot: 28 pins, 4 sets)", () => {
    const r = validateResearchRun(enginePayload);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.counts.pins).toBe(28);
    expect(r.run.counts.sets).toBe(4);
    expect(r.run.counts.engineVerified).toBe(28);
  });

  it("rejects evidence from excluded databases or marketplaces, even if hand-edited in", () => {
    const p = clone();
    p.candidates[0].evidence.push({ field: "characters", value: ["X"], source_url: "https://pinandpop.com/pins/1", source_class: "fan", method: "search_snippet" });
    p.candidates[1].evidence.push({ field: "characters", value: ["X"], source_url: "https://www.ebay.co.uk/itm/1", source_class: "fan", method: "search_snippet" });
    const r = validateResearchRun(p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join("\n")).toMatch(/excluded source/);
    expect(r.errors.join("\n")).toMatch(/marketplace/);
  });

  it("rejects malformed keys, wrong format, bad commits and oversized values", () => {
    const p = clone();
    p.candidates[0].research_key = "../etc/passwd";
    p.candidates[2].evidence[0].value = "x".repeat(700);
    expect(validateResearchRun(p).ok).toBe(false);
    expect(validateResearchRun({ ...clone(), format: "other" }).ok).toBe(false);
    expect(validateResearchRun({ ...clone(), git_commit: "not-a-commit" }).ok).toBe(false);
    expect(validateResearchRun(null).ok).toBe(false);
  });

  it("never marks a set as engine-verified", () => {
    const p = clone();
    const set = p.candidates.find((c: { entity_type: string }) => c.entity_type === "set");
    set.engine_verified = true;
    const r = validateResearchRun(p);
    expect(r.ok && r.run.candidates.find(c => c.research_key === set.research_key)?.engine_verified).toBe(false);
  });
});

describe("checkSourceUrl", () => {
  it.each([
    ["https://www.disneystore.co.uk/x", null],
    ["javascript:alert(1)", "source URL must be http(s)"],
    ["https://www.pinpics.com/pin/1", "excluded source (Pin & Pop / PinPics / PinTradingDB)"],
    ["not a url", "source URL invalid"],
  ])("%s", (url, expected) => expect(checkSourceUrl(url)).toBe(expected));
});

describe("checkDecision", () => {
  const base = { entity_type: "pin", status: "direct_verified", record_confidence: "High", review_reasons: [], warnings: [], direct_verified_by: "u1" };
  it("approves a directly verified, confident, conflict-free pin", () => {
    expect(checkDecision({ decision: "approve", notes: null, candidate: base })).toBeNull();
  });
  it("requires a human direct check first", () => {
    expect(checkDecision({ decision: "approve", notes: null, candidate: { ...base, status: "needs_direct_verification", direct_verified_by: null } }))
      .toMatch(/confirm the pin's identity/);
  });
  it("blocks low confidence, conflicts, sets and finished candidates", () => {
    expect(checkDecision({ decision: "approve", notes: null, candidate: { ...base, record_confidence: "Low" } })).toMatch(/too low/);
    expect(checkDecision({ decision: "approve", notes: null, candidate: { ...base, review_reasons: ["conflict: edition_size"] } })).toMatch(/conflicting/);
    expect(checkDecision({ decision: "approve", notes: null, candidate: { ...base, entity_type: "set" } })).toMatch(/Sets/);
    expect(checkDecision({ decision: "reject", notes: "dup", candidate: { ...base, status: "imported" } })).toMatch(/no longer/);
  });
  it("needs a note for variants, rejections and more-research", () => {
    expect(checkDecision({ decision: "approve", notes: null, candidate: { ...base, warnings: ["variants: release_date"] } })).toMatch(/note/);
    expect(checkDecision({ decision: "approve", notes: "UK listing: 2 June", candidate: { ...base, warnings: ["variants: release_date"] } })).toBeNull();
    expect(checkDecision({ decision: "reject", notes: "", candidate: base })).toMatch(/note/);
    expect(checkDecision({ decision: "needs_more_research", notes: "single source", candidate: base })).toBeNull();
  });
});
