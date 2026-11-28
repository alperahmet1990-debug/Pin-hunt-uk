import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { cleanSetList, learnBatchSet, readStats, rematchUndecided } from "./batchStats";
import { checkBatchAccuracy } from "./accuracy";
import { matchItem, BUCKET } from "./pipeline";
import type { BulkMatchResult } from "./match";
import { createFakeDb } from "./fakeDb.test-helper";

const photo = async () => sharp({ create: { width: 40, height: 40, channels: 3, background: "#0a0" } }).jpeg().toBuffer();

const result = (ids: string[]): BulkMatchResult => ({
  candidates: ids.map((id, n) => ({
    pinhuntId: id, title: `Pin ${id}`, collection: "c", brand: "b", edition: null, characters: [], imageUrl: null,
    confidence: 90 - n * 10, reasoning: "r",
  })),
  description: { characters: [], keywords: [] }, topConfidence: 90, band: "possible", verified: false, aiCalls: 3,
});

describe("batch sets", () => {
  it("cleans typed sets: trimmed, no repeats, at most 5", () => {
    expect(cleanSetList(["  Tails  of Friendship ", "tails of friendship", "x", "A", "B set", "C set", "D set", "E set", "F set"]))
      .toEqual(["Tails of Friendship", "B set", "C set", "D set", "E set"]);
    expect(cleanSetList("Beauty and the Beast, Lumiere set")).toEqual(["Beauty and the Beast", "Lumiere set"]);
    expect(cleanSetList(undefined)).toEqual([]);
  });

  it("learns a set on the second confirmed photo from it, then re-matches the undecided ones", async () => {
    const fake = createFakeDb({
      bulk_image_batches: [{ id: "B", stats: {} }],
      bulk_image_items: [
        { id: "a", batch_id: "B", status: "confirmed" },
        { id: "b", batch_id: "B", status: "confirmed" },
        { id: "c", batch_id: "B", status: "suggested", match_attempts: 1 },
        { id: "d", batch_id: "B", status: "unmatched", match_attempts: 1 },
        { id: "e", batch_id: "B", status: "flagged" },
      ],
    });
    // One confirmation isn't enough: a batch can mix sets.
    expect(await learnBatchSet(fake.db, "B", "Beauty and the Beast", "a")).toEqual({ learned: null, rematching: 0 });
    expect(readStats(fake.tables.bulk_image_batches[0].stats).setHints).toBeUndefined();
    // The same photo confirmed again doesn't count twice.
    expect((await learnBatchSet(fake.db, "B", "Beauty and the Beast", "a")).learned).toBeNull();
    // A second photo from the same set: learned, and the two undecided photos go back to be matched.
    expect(await learnBatchSet(fake.db, "B", "beauty and the beast", "b")).toEqual({ learned: "beauty and the beast", rematching: 2 });
    expect(readStats(fake.tables.bulk_image_batches[0].stats).setHints).toEqual(["beauty and the beast"]);
    expect(fake.tables.bulk_image_items.map((i) => i.status)).toEqual(["confirmed", "confirmed", "uploaded", "uploaded", "flagged"]);
    // Already known: nothing more happens.
    expect(await learnBatchSet(fake.db, "B", "Beauty and the Beast", "c")).toEqual({ learned: null, rematching: 0 });
  });

  it("re-matching leaves the photo just confirmed alone", async () => {
    const fake = createFakeDb({ bulk_image_items: [
      { id: "a", batch_id: "B", status: "suggested" }, { id: "b", batch_id: "B", status: "suggested" },
    ] });
    expect(await rematchUndecided(fake.db, "B", "a")).toBe(1);
    expect(fake.tables.bulk_image_items.map((i) => i.status)).toEqual(["suggested", "uploaded"]);
  });

  it("matching searches the batch's sets first", async () => {
    const fake = createFakeDb({ bulk_image_items: [{ id: "a", batch_id: "B", status: "uploaded", original_path: "B/a/original.jpg", match_attempts: 0 }] });
    await fake.db.storage.from(BUCKET).upload("B/a/original.jpg", await photo());
    const match = vi.fn(async () => result(["PHUK-1"]));
    await matchItem({ id: "a", original_path: "B/a/original.jpg", match_attempts: 0 }, { db: fake.db, match, clean: vi.fn() }, ["Beauty and the Beast"]);
    expect(match).toHaveBeenCalledWith(expect.any(Buffer), { sets: ["Beauty and the Beast"] });
  });
});

describe("batch accuracy check", () => {
  it("re-matches confirmed photos without changing them and reports right first, top 5 and the misses", async () => {
    const fake = createFakeDb({
      bulk_image_batches: [{ id: "B", stats: { setHints: ["Beauty and the Beast"] } }],
      bulk_image_items: [
        { id: "a", batch_id: "B", status: "confirmed", original_path: "B/a.jpg", original_filename: "a.jpg", matched_pinhunt_id: "PHUK-1", candidates: [], created_at: "1" },
        { id: "b", batch_id: "B", status: "published", original_path: "B/b.jpg", original_filename: "b.jpg", matched_pinhunt_id: "PHUK-2", candidates: [{ pinhuntId: "PHUK-2", title: "Wardrobe" }], created_at: "2" },
        { id: "c", batch_id: "B", status: "cleaned", original_path: "B/c.jpg", original_filename: "c.jpg", matched_pinhunt_id: "PHUK-3", candidates: [], created_at: "3" },
        { id: "d", batch_id: "B", status: "suggested", original_path: "B/d.jpg", original_filename: "d.jpg", matched_pinhunt_id: null, candidates: [], created_at: "4" },
        { id: "e", batch_id: "B", status: "confirmed", original_path: "B/missing.jpg", original_filename: "e.jpg", matched_pinhunt_id: "PHUK-5", candidates: [], created_at: "5" },
      ],
    });
    for (const p of ["B/a.jpg", "B/b.jpg", "B/c.jpg"]) await fake.db.storage.from(BUCKET).upload(p, await photo());
    const answers = [result(["PHUK-1", "PHUK-9"]), result(["PHUK-9", "PHUK-2"]), result(["PHUK-8"])];
    let n = 0;
    const match = vi.fn(async () => answers[n++]);
    const before = JSON.stringify(fake.tables.bulk_image_items);
    const report = await checkBatchAccuracy("B", { db: fake.db, match });
    // a: right first; b: 2nd; c: not in the top 5; d: no answer (not checked); e: photo missing (an error).
    expect(report).toMatchObject({ checked: 3, top1: 1, top5: 2, errors: 1 });
    expect(report.misses).toEqual([
      { itemId: "b", filename: "b.jpg", expected: { pinhuntId: "PHUK-2", title: "Wardrobe" }, got: { pinhuntId: "PHUK-9", title: "Pin PHUK-9", confidence: 90 }, rank: 2 },
      { itemId: "c", filename: "c.jpg", expected: { pinhuntId: "PHUK-3", title: null }, got: { pinhuntId: "PHUK-8", title: "Pin PHUK-8", confidence: 90 }, rank: null },
    ]);
    // The batch's sets were searched first, and nothing about the photos changed.
    expect(match).toHaveBeenCalledWith(expect.any(Buffer), { sets: ["Beauty and the Beast"] });
    expect(JSON.stringify(fake.tables.bulk_image_items)).toBe(before);
    // Saved on the batch, next to its sets.
    expect(readStats(fake.tables.bulk_image_batches[0].stats)).toMatchObject({ setHints: ["Beauty and the Beast"], accuracy: { checked: 3, top1: 1 } });
  });
});
