import { describe, expect, it } from "vitest";
import type { CataloguePin, PinRepository } from "@workspace/pin-repository";
import { findBoardCandidates } from "./candidates";

// A 116k-style catalogue in miniature: a character on its own matches far
// more pins than the search returns, and so does a keyword on its own; only
// the two together find the pin on the board.

const pin = (id: string, title: string, characters: string[] = []): CataloguePin =>
  ({ id, title, brand: "Disney", collection: "", characters, mainCharacter: characters[0] } as unknown as CataloguePin);

const groguPins = Array.from({ length: 120 }, (_, i) => pin(`G-${i}`, `Grogu pin ${i}`, ["Grogu"]));
const podPins = Array.from({ length: 80 }, (_, i) => pin(`P-${i}`, `Pod racer ${i}`, ["Anakin"]));
const target = pin("PHUK-TARGET", "Grogu in Pod", ["Grogu"]);

function repo(calls: Array<{ q: string; character?: string }>): PinRepository {
  return {
    searchPins: async (q: string, f: { character?: string } = {}) => {
      calls.push({ q, character: f.character });
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (f.character === "Grogu" && words.join(" ") === "pod") return [target];
      if (!f.character && words.includes("grogu") && words.includes("pod")) return [target];
      if (f.character === "Grogu" && words.length === 0) return groguPins;
      if (words.join(" ") === "grogu") return groguPins;
      if (words.join(" ") === "pod") return podPins;
      return [];
    },
  } as unknown as PinRepository;
}

describe("findBoardCandidates", () => {
  it("puts the character + keyword matches first, within the cap", async () => {
    const calls: Array<{ q: string; character?: string }> = [];
    const out = await findBoardCandidates(repo(calls), { characters: ["Grogu"], keywords: ["pod", "Grogu"] }, [], 150);
    expect(out[0].id).toBe("PHUK-TARGET");
    expect(out.length).toBeLessThanOrEqual(150);
    // The character name isn't repeated as a "specific" keyword.
    expect(calls).toContainEqual({ q: "pod", character: "Grogu" });
    expect(calls).not.toContainEqual({ q: "Grogu", character: "Grogu" });
  });

  it("would have missed it with the broad search alone", async () => {
    // Same data through the scan's search order: 120 Grogu + 80 pod pins fill a 150 cap first.
    const out = await findBoardCandidates(repo([]), { characters: [], keywords: ["Grogu", "pod"] }, [], 150);
    expect(out.map((p) => p.id)).not.toContain("PHUK-TARGET");
  });

  it("searches printed text on its own, after the narrow matches and before the broad ones", async () => {
    const r = {
      searchPins: async (q: string, f: { character?: string } = {}) => {
        if (q === "GROGU 2022") return [pin("PHUK-TEXT", "Grogu 2022 limited")];
        if (q === "pod" && f.character === "Grogu") return [target];
        if (q === "Grogu pod") return [];
        return groguPins; // the broad searches
      },
    } as unknown as PinRepository;
    const out = await findBoardCandidates(r, { characters: ["Grogu"], keywords: ["pod"] }, ["GROGU 2022"], 150);
    expect(out.map((p) => p.id).slice(0, 2)).toEqual(["PHUK-TARGET", "PHUK-TEXT"]);
  });

  it("keeps going when searches fail", async () => {
    const r = { searchPins: () => { throw new Error("db down"); } } as unknown as PinRepository;
    await expect(findBoardCandidates(r, { characters: ["Grogu"], keywords: ["pod"] }, ["x y z"], 150)).resolves.toEqual([]);
  });

  it("searches the board's sets first, where a character-only title is enough", async () => {
    const meeko = pin("PHUK-10122801", "Meeko", ["Meeko"]);
    const otherMeekos = Array.from({ length: 200 }, (_, i) => pin(`M-${i}`, "Meeko", ["Meeko"]));
    const calls: string[] = [];
    const r = {
      searchPins: async (q: string, f: { character?: string } = {}) => {
        calls.push(`${q}|${f.character ?? ""}`);
        if (q === "Tails of Friendship Meeko") return [meeko];
        if (q === "Tails of Friendship" && f.character === "Meeko") return [meeko];
        if (q === "Tails of Friendship" && !f.character) return [meeko, pin("PHUK-NANA", "Nana - London Exclusive", ["Nana"])];
        return otherMeekos; // every other search: hundreds of pins titled "Meeko"
      },
    } as unknown as PinRepository;
    const out = await findBoardCandidates(r, { characters: ["Meeko"], keywords: ["silver frame"] }, [], 150, ["Tails of Friendship"]);
    expect(out.map((p) => p.id).slice(0, 2)).toEqual(["PHUK-10122801", "PHUK-NANA"]);
    // Without the set, the right one is lost among the same-titled pins.
    const without = await findBoardCandidates(r, { characters: ["Meeko"], keywords: ["silver frame"] }, [], 150);
    expect(without.map((p) => p.id)).not.toContain("PHUK-10122801");
  });
});
