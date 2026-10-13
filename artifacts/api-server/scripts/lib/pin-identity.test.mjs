import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkPinIdentity, guardIdMatch, identityConflictMessage, isPlaceholder, sameWord } from "./pin-identity.mjs";

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

  it("explains a refusal and points corrections at the pin editor, never at a blank id", () => {
    const msg = identityConflictMessage("PHUK-00000331", "Mickey Mouse – Animated Cutie");
    expect(msg).toMatch(/PHUK-00000331 already belongs to a different pin \("Mickey Mouse – Animated Cutie"\)/);
    expect(msg).toMatch(/Admin → Catalogue/);
    expect(msg).not.toMatch(/blank/i);
  });

  it.each([
    ["typo fix, no characters", { title: "Cinderela Castle", collection: "Castles", characters: "" }, { title: "Cinderella Castle", collection: "Castles", characters: [] }],
    ["typo fix + extra word, no characters", { title: "Stich Hula", collection: "Hula", characters: "" }, { title: "Stitch Hula Dancer", collection: "Hula", characters: [] }],
    ["character short name", { title: "Winnie the Pooh Hunny Pot", collection: "Pooh Friends", characters: "Winnie the Pooh" }, { title: "Pooh Hunny Pot", collection: "Pooh Friends", characters: ["Pooh"] }],
    ["second character added", { title: "Mickey Kiss", collection: "Valentines 2026", characters: "Mickey Mouse" }, { title: "Mickey & Minnie Kiss", collection: "Valentines 2026", characters: ["Mickey Mouse", "Minnie Mouse"] }],
    ["title reworded, same character and set", { title: "Mickey – Animated Cutie", collection: "Animated Cuties", characters: "Mickey Mouse" }, { title: "Animated Cuties Mickey Mouse", collection: "Animated Cuties", characters: ["Mickey Mouse"] }],
    ["set name gains its year", { title: "Hatbox Ghost", collection: "Haunted Mansion", characters: "Hatbox Ghost" }, { title: "Hatbox Ghost window", collection: "Haunted Mansion 2026", characters: ["Hatbox Ghost"] }],
  ])("accepts legitimate corrections: %s", (_label, existing, incoming) => {
    expect(checkPinIdentity(existing, incoming).ok).toBe(true);
  });

  it.each([
    ["Mickey Paintbrush", "Mickey Mouse", "Minnie Paintbrush", "Minnie Mouse", "Brush of Magic Series 1"],
    ["Mickey Ice Cream Bar", "Mickey Mouse", "Minnie Ice Cream Bar", "Minnie Mouse", "Ice Cream Bar Mystery Collection"],
    ["Ice Cream Bar Minnie", "Minnie Mouse", "Ice Cream Bar Mickey", "Mickey Mouse", "Sweet Treats"],
    ["Halloween Mickey", "Mickey Mouse", "Halloween Minnie", "Minnie Mouse", "Halloween 2026"],
    ["Donald Duck – Classic", "Donald Duck", "Daisy Duck – Classic", "Daisy Duck", "Classics"],
    ["Lilo Surf", "Lilo", "Milo Surf", "Milo", "Surf"],
  ])("refuses a sibling swap within one set: %s → %s", (t1, c1, t2, c2, coll) => {
    expect(checkPinIdentity({ title: t1, collection: coll, characters: c1 }, { title: t2, collection: coll, characters: [c2] }).ok).toBe(false);
  });

  it.each([["lilo", "milo"], ["anna", "hanna"], ["pluto", "plato"], ["goofy", "goody"], ["mickey", "minnie"]])(
    "treats %s and %s as different words", (a, b) => expect(sameWord(a, b)).toBe(false));
  it.each([["stich", "stitch"], ["cinderela", "cinderella"], ["rapunzle", "rapunzel"]])(
    "treats %s and %s as a typo of the same word", (a, b) => expect(sameWord(a, b)).toBe(true));

  it.each([
    ["same character, same set, different design", { title: "Stitch Surf", collection: "Summer 2024", characters: "Stitch" }, { title: "Stitch Ski", collection: "Summer 2024", characters: ["Stitch"] }],
    ["moved to another set (holiday)", { title: "Stitch Halloween", collection: "Halloween 2024", characters: "Stitch" }, { title: "Stitch Christmas", collection: "Christmas 2024", characters: ["Stitch"] }],
    ["different design words", { title: "Mickey Ice Cream", collection: "Treats", characters: "Mickey Mouse" }, { title: "Mickey Pumpkin", collection: "Treats", characters: ["Mickey Mouse"] }],
    ["next year's set", { title: "Halloween Mickey", collection: "Halloween 2024", characters: "Mickey Mouse" }, { title: "Halloween Mickey", collection: "Halloween 2025", characters: ["Mickey Mouse"] }],
    ["incoming drops characters and swaps the title", { title: "Mickey Ice Cream Bar", collection: "Ice Cream Bar", characters: "Mickey Mouse" }, { title: "Minnie Ice Cream Bar", collection: "Ice Cream Bar", characters: [] }],
    ["existing has no characters, incoming swaps", { title: "Mickey Ice Cream Bar", collection: "Ice Cream Bar", characters: "" }, { title: "Minnie Ice Cream Bar", collection: "Ice Cream Bar", characters: ["Minnie Mouse"] }],
    ["duo swap sharing one character", { title: "Mickey & Minnie Kiss", collection: "Valentines 2026", characters: "Mickey Mouse; Minnie Mouse" }, { title: "Mickey & Pluto Kiss", collection: "Valentines 2026", characters: ["Mickey Mouse", "Pluto"] }],
    ["duo swap, Chip & Dale → Chip & Clarice", { title: "Chip & Dale Acorn", collection: "Autumn", characters: "Chip; Dale" }, { title: "Chip & Clarice Acorn", collection: "Autumn", characters: ["Chip", "Clarice"] }],
    ["sets sharing one word", { title: "Hearts", collection: "Valentines Day", characters: "Minnie Mouse" }, { title: "Shamrock", collection: "St Patricks Day", characters: ["Minnie Mouse"] }],
  ])("refuses: %s", (_label, existing, incoming) => {
    expect(checkPinIdentity(existing, incoming).ok).toBe(false);
  });

  it("refuses a word swap in the title when nothing else identifies the pin", () => {
    expect(checkPinIdentity({ title: "Mickey Ice Cream Bar", collection: "", characters: "" }, { title: "Minnie Ice Cream Bar", collection: "", characters: "" }).ok).toBe(false);
  });

  it("still refuses a complete rename with nothing in common", () => {
    expect(checkPinIdentity({ title: "Haunted Mansion", collection: "Windows", characters: "" }, { title: "Space Mountain", collection: "Rockets", characters: [] }).ok).toBe(false);
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
