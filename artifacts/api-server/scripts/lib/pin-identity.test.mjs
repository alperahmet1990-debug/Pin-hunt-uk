import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkPinIdentity, guardIdMatch, identityConflictMessage, isPlaceholder } from "./pin-identity.mjs";

const vectors = JSON.parse(readFileSync(new URL("./pin-identity.vectors.json", import.meta.url), "utf8"));

describe("checkPinIdentity — the July 2026 trusted import (182 real id pairs)", () => {
  it.each(vectors.cases.map((c) => [c.id, c.classification, c]))("%s (%s)", (_id, _cls, c) => {
    expect(checkPinIdentity(c.existing, c.incoming).ok).toBe(c.expect_ok);
  });

  it("refuses all 86 repurposed ids and accepts the 96 legitimate refinements", () => {
    const results = vectors.cases.map((c) => checkPinIdentity(c.existing, c.incoming).ok);
    expect(results.filter((ok) => !ok)).toHaveLength(86);
    expect(results.filter(Boolean)).toHaveLength(96);
  });
});

describe("checkPinIdentity — rules", () => {
  it("accepts the same pin with refined metadata", () => {
    expect(checkPinIdentity(
      { title: "Haunted Mansion", collection: "Windows of Attraction", characters: "Hatbox Ghost" },
      { title: "Haunted Mansion – Windows of Attraction", collection: "Windows of Attraction Series", characters: ["Hatbox Ghost"] },
    ).ok).toBe(true);
  });

  it("does not let shared set words make two siblings look the same", () => {
    expect(checkPinIdentity(
      { title: "Ice Cream Bar Minnie", collection: "Ice Cream Bar Mystery Collection", characters: "Minnie Mouse" },
      { title: "Ice Cream Bar Stitch", collection: "Ice Cream Bar Mystery Collection", characters: ["Stitch"] },
    ).ok).toBe(false);
  });

  it("refuses the same character moved into a different set", () => {
    expect(checkPinIdentity(
      { title: "Mickey Mouse – Animated Cutie", collection: "Animated Cuties", characters: "Mickey Mouse" },
      { title: "Mickey on Animator's Desk", collection: "Brush of Magic", characters: ["Mickey Mouse"] },
    ).ok).toBe(false);
  });

  it("lets a month placeholder resolve to the real pin in its own set only", () => {
    const placeholder = { title: "July 2026 – Enchanted Doors", collection: "2026 Enchanted Doors Pin Series", characters: "Unknown" };
    expect(isPlaceholder(placeholder)).toBe(true);
    expect(checkPinIdentity(placeholder, { title: "Evil Queen door", collection: "Enchanted Doors", characters: ["Evil Queen"] }).ok).toBe(true);
    expect(checkPinIdentity(placeholder, { title: "Stitch", collection: "Ducks of Disney", characters: ["Stitch"] }).ok).toBe(false);
  });

  it("explains a refusal without leaking anything but the pin title", () => {
    expect(identityConflictMessage("PHUK-00000331", "Mickey Mouse – Animated Cutie"))
      .toMatch(/PHUK-00000331 already belongs to a different pin \("Mickey Mouse – Animated Cutie"\)/);
  });
});

describe("guardIdMatch — trusted-catalogue script", () => {
  const seedRow = { title: "Mickey Paintbrush", collection: "Brush of Magic Series 1 Mystery Pin Collection", main_character: "Mickey Paintbrush", all_characters: "Mickey Paintbrush" };
  const incoming = { title: "Dopey", collection: "Brush of Magic Mystery Series 1", characters: ["Dopey"] };

  it("refuses a pinhunt_id match that changes the pin (the July failure)", () => {
    const r = guardIdMatch({ target: seedRow, matchedBy: "pinhunt_id", pinhuntId: "PHUK-00000625", incoming });
    expect(r).toMatchObject({ pinhunt_id: "PHUK-00000625", existing_title: "Mickey Paintbrush", incoming_title: "Dopey" });
  });

  it("does not second-guess external-id or normalised matches, or inserts", () => {
    expect(guardIdMatch({ target: seedRow, matchedBy: "external_id", pinhuntId: "PHUK-00000625", incoming })).toBeNull();
    expect(guardIdMatch({ target: null, matchedBy: null, pinhuntId: "PHUK-00000625", incoming })).toBeNull();
  });

  it("is wired into the trusted import script and fails the run safe", () => {
    const src = readFileSync(new URL("../import-trusted-catalogue.mjs", import.meta.url), "utf8");
    expect(src).toMatch(/guardIdMatch\(\{ target, matchedBy, pinhuntId: pid/);
    expect(src).toMatch(/log\.errors\.push\(refusal\.message\)/);
  });
});
