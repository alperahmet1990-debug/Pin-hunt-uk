import { describe, expect, it } from "vitest";
import type { CataloguePin, PinRepository } from "@workspace/pin-repository";
import { findCandidates, MAX_CANDIDATES } from "./scanCandidates";

const pin = (id: string) => ({ id, title: id }) as CataloguePin;

/** A repository whose searches resolve after `delayMs`, recording how many ran at once. */
function fakeRepo(results: (query: string, opts: { character?: string; limit?: number }) => CataloguePin[], delayMs = 20) {
  let running = 0;
  const stats = { calls: 0, maxConcurrent: 0 };
  const repo = {
    searchPins: async (query: string, opts: { character?: string; limit?: number }) => {
      stats.calls += 1;
      running += 1;
      stats.maxConcurrent = Math.max(stats.maxConcurrent, running);
      await new Promise((r) => setTimeout(r, delayMs));
      running -= 1;
      if (query === "boom") throw new Error("search failed");
      return results(query, opts);
    },
  } as unknown as PinRepository;
  return { repo, stats };
}

describe("findCandidates (#349)", () => {
  it("runs the searches at the same time instead of one after another", async () => {
    const { repo, stats } = fakeRepo(() => []);
    await findCandidates(repo, { characters: ["Mickey", "Minnie"], keywords: ["castle", "fireworks"] }, ["Paris"]);
    // 2 character searches + 5 term searches, all in flight together.
    expect(stats.maxConcurrent).toBeGreaterThan(1);
  });

  it("keeps the old priority order: character matches first, then terms in order", async () => {
    const { repo } = fakeRepo((query, opts) => (opts.character
      ? [pin(`char-${opts.character}`)]
      : [pin(`term-${query}`), pin("shared")]));
    const out = await findCandidates(repo, { characters: ["Mickey"], keywords: ["castle", "dumbo"] }, ["OCR text"]);
    expect(out.map((p) => p.id)).toEqual([
      "char-Mickey",
      "term-Mickey", "shared",
      "term-castle",
      "term-dumbo",
      "term-OCR text",
    ]);
  });

  it("skips failed searches and terms shorter than 3 letters", async () => {
    const { repo, stats } = fakeRepo((query) => [pin(`term-${query}`)]);
    const out = await findCandidates(repo, { characters: [], keywords: ["boom", "ok", "castle"] });
    expect(out.map((p) => p.id)).toEqual(["term-castle"]);
    expect(stats.calls).toBe(2); // "ok" is never searched
  });

  it(`caps the list at ${MAX_CANDIDATES} and falls back to a general search when nothing matched`, async () => {
    const many = Array.from({ length: 300 }, (_, i) => pin(`p${i}`));
    const { repo } = fakeRepo((query) => (query ? many.map((p) => pin(`${query}-${p.id}`)) : many));
    expect(await findCandidates(repo, { characters: [], keywords: ["aaa", "bbb"] })).toHaveLength(MAX_CANDIDATES);
    const { repo: empty } = fakeRepo((query) => (query ? [] : [pin("fallback")]));
    expect((await findCandidates(empty, { characters: [], keywords: ["zzz"] })).map((p) => p.id)).toEqual(["fallback"]);
  });
});
