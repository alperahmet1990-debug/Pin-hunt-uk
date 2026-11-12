import { describe, expect, it } from "vitest";
import { charactersForPin, findCharacters } from "./pinandpop-characters.mjs";
import { fillCharacters } from "./pinandpop.mjs";

const all = (name, series) => charactersForPin(name, series)?.all_characters ?? null;

describe("findCharacters: real Pin & Pop names", () => {
  it.each([
    ["The Mark Twain Riverboat - Minnie Mouse", "Minnie Mouse"],
    ["Rapunzel (SUPER CHASER)", "Rapunzel"],
    ["Mickey and Minnie Kissing Booth", "Mickey Mouse, Minnie Mouse"],
    ["Toulouse, Marie and Berlioz in cat flap", "Toulouse, Marie, Berlioz"],
    ["Logo - Chip & Dale", "Chip, Dale"],
    ["Chip 'n' Dale", "Chip, Dale"],
    ["Lady and the Tramp 70th Anniversary", "Lady, Tramp"],
    ["Jack and Sally On Spiral Hill Frame", "Jack Skellington, Sally"],
    ["Stitch and Angel", "Stitch, Angel"],
    ["Dumbo and Timothy Mouse", "Dumbo, Timothy Q. Mouse"],
    ["Leia", "Princess Leia"],
    ["Magic Kingdom - Tinkerbell", "Tinker Bell"],
    ['"I\'m So Rumbly in My Tummy..." Pooh', "Winnie the Pooh"],
    ["Rocket Raccoon & Groot Set", "Rocket Raccoon, Groot"],
    ["Génie", "Genie"],
  ])("%s → %s", (name, expected) => {
    expect(findCharacters(name).join(", ")).toBe(expected);
  });

  it("prefers the longer name inside a shorter one", () => {
    expect(findCharacters("Minnie Mouse")).toEqual(["Minnie Mouse"]);
    expect(findCharacters("Lady Tremaine")).toEqual(["Lady Tremaine"]);
    expect(findCharacters("Captain Hook and Smee")).toEqual(["Captain Hook", "Mr. Smee"]);
  });

  it("doesn't tag everyday words, events, programmes or artists", () => {
    for (const name of [
      "Flower & Garden Festival 2024", "Christmas Eve", "Happy Holidays", "Boo to You", "Animal Kingdom icons",
      "Sleepy Hollow", "Mickey's Not-So-Scary Halloween Party 2019 Logo", "Parasol Lady",
      "MM 016 - Triste (Sad)", "T-Rex", "Lightning Bolt", "Timothy Loucks - Today: Draw Mickey Mouse",
    ]) {
      expect([name, findCharacters(name).filter((c) => c !== "Mickey Mouse")]).toEqual([name, []]);
    }
    expect(findCharacters("2009 Hidden Mickey - Alphabet")).toEqual([]);
  });
});

describe("charactersForPin", () => {
  it("uses only the pin's own name, not its set name", () => {
    expect(charactersForPin("The Muses", "BoxLunch - Hercules Character Vases Blind Box")).toBeNull();
    expect(charactersForPin("MM 016 - Triste (Sad)", "One Hundred Mickeys by Eric Robison Art Series")).toBeNull();
  });

  it("tells same-named characters apart by their set", () => {
    expect(all("Mrs. Potts and Chip", "Beauty and the Beast Pin Set")).toBe("Mrs. Potts, Chip Potts");
    expect(all("Chip", "Beauty and the Beast 30th Anniversary Mystery Collection")).toBe("Chip Potts");
    expect(all("Chip", "(PTD) Pin Trader's Delight Series")).toBe("Chip");
    expect(all("Lightning McQueen & Sally", "Holiday Snow Globe 2007")).toBe("Lightning McQueen, Sally Carrera");
    expect(all("Sally", "The Nightmare Before Christmas")).toBe("Sally");
  });

  it("returns the column values, comma-separated, marked automatic", () => {
    expect(charactersForPin("Kanga and Roo", null)).toEqual({
      main_character: "Kanga", all_characters: "Kanga, Roo", character_confidence: "name", character_review_status: "auto_matched",
    });
  });
});

describe("fillCharacters", () => {
  function fakeSupabase(rows) {
    const upserts = [];
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder, in: () => builder,
      range: async () => ({ data: rows, error: null }),
      then: (resolve) => resolve({ data: rows, error: null }),
    };
    return {
      upserts,
      from: () => ({ ...builder, upsert: async (part) => { upserts.push(...part); return { error: null }; } }),
    };
  }

  it("fills blank and automatic pins, never a person's edits", async () => {
    const sb = fakeSupabase([
      { pinhunt_id: "PHUK-10000001", title: "Minnie Mouse", brand: "Disney", collection: "S", main_character: null, all_characters: null, character_review_status: null },
      { pinhunt_id: "PHUK-10000002", title: "Goofy", brand: "Disney", collection: "S", main_character: "Pluto", all_characters: "Pluto", character_review_status: "auto_matched" },
      { pinhunt_id: "PHUK-10000003", title: "Goofy", brand: "Disney", collection: "S", main_character: "Max Goof", all_characters: "Max Goof", character_review_status: "reviewed" },
      { pinhunt_id: "PHUK-10000004", title: "Goofy", brand: "Disney", collection: "S", main_character: "Max Goof", all_characters: "Max Goof", character_review_status: null },
      { pinhunt_id: "PHUK-10000005", title: "Castle Logo", brand: "Disney", collection: "S", main_character: null, all_characters: null, character_review_status: null },
    ]);
    const stats = await fillCharacters(sb);
    expect(stats).toEqual({ checked: 5, matched: 2, changed: 2, skippedManual: 2 });
    expect(sb.upserts.map((u) => [u.pinhunt_id, u.all_characters])).toEqual([["PHUK-10000001", "Minnie Mouse"], ["PHUK-10000002", "Goofy"]]);
    expect(sb.upserts[0]).toMatchObject({ title: "Minnie Mouse", brand: "Disney", collection: "S" }); // NOT NULL columns ride along
  });

  it("writes nothing on a dry run", async () => {
    const sb = fakeSupabase([{ pinhunt_id: "PHUK-10000001", title: "Minnie", brand: "Disney", collection: "S", character_review_status: null }]);
    const stats = await fillCharacters(sb, { apply: false });
    expect(stats.changed).toBe(1);
    expect(sb.upserts).toHaveLength(0);
  });
});
