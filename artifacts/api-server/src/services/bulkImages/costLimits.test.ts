import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { BUDGET_SPENT, BUDGET_UNAVAILABLE, CALLS_PER_MATCH, reserveAiCalls } from "./aiBudget";
import { batchAccuracyRunning, checkBatchAccuracy, startBatchAccuracyCheck, ACCURACY_COOLDOWN_MS } from "./accuracy";
import { cleanSetList, MAX_REMATCH, rematchUndecided, SetInputError, updateBatchStats } from "./batchStats";
import { matchItem, processBatch, BUCKET } from "./pipeline";
import type { BulkMatchResult } from "./match";
import { createFakeDb } from "./fakeDb.test-helper";

// Security review of #762: every match, re-match and accuracy-check match is
// counted in a daily AI budget; inputs and repeats are bounded.

const photo = async () => sharp({ create: { width: 40, height: 40, channels: 3, background: "#00a" } }).jpeg().toBuffer();
const ok: BulkMatchResult = {
  candidates: [{ pinhuntId: "PHUK-1", title: "t", collection: "c", brand: "b", edition: null, characters: [], imageUrl: null, confidence: 80, reasoning: "r" }],
  description: { characters: [], keywords: [] }, topConfidence: 80, band: "possible", verified: false, aiCalls: 3,
};

describe("daily AI budget", () => {
  it("reserves calls until the limit, then refuses; fails closed when it can't check", async () => {
    const fake = createFakeDb();
    const env = { BULK_AI_DAILY_CALLS: "7" };
    expect(await reserveAiCalls(fake.db, 3, env)).toMatchObject({ allowed: true, used: 3 });
    expect(await reserveAiCalls(fake.db, 3, env)).toMatchObject({ allowed: true, used: 6 });
    expect(await reserveAiCalls(fake.db, 3, env)).toMatchObject({ allowed: false, reason: BUDGET_SPENT });
    const broken = { rpc: async () => ({ data: null, error: { message: "function not found" } }) } as never;
    expect(await reserveAiCalls(broken, 3, env)).toMatchObject({ allowed: false, reason: BUDGET_UNAVAILABLE });
  });

  it("a photo isn't matched when the budget is spent: it goes back to waiting, and the batch says why", async () => {
    const fake = createFakeDb({ bulk_image_items: [
      { id: "a", batch_id: "B", status: "uploaded", original_path: "B/a.jpg", match_attempts: 0, created_at: "1" },
      { id: "b", batch_id: "B", status: "uploaded", original_path: "B/b.jpg", match_attempts: 0, created_at: "2" },
    ] });
    for (const p of ["B/a.jpg", "B/b.jpg"]) await fake.db.storage.from(BUCKET).upload(p, await photo());
    const match = vi.fn(async () => ok);
    // Room for one photo's calls only.
    const env = { BULK_AI_DAILY_CALLS: String(CALLS_PER_MATCH) };
    const { done } = await processBatch("B", { db: fake.db, match, clean: vi.fn(), env }, ["match"]);
    await done;
    expect(match).toHaveBeenCalledTimes(1);
    expect(fake.tables.bulk_image_items.map((i) => i.status).sort()).toEqual(["suggested", "uploaded"]);
    // The one not matched keeps its attempt count (it wasn't tried).
    expect(fake.tables.bulk_image_items.find((i) => i.status === "uploaded")!.match_attempts).toBe(0);
  });

  it("counts re-matches too: the same photo matched twice in a day costs twice", async () => {
    const fake = createFakeDb({ bulk_image_items: [{ id: "a", batch_id: "B", status: "uploaded", original_path: "B/a.jpg", match_attempts: 0 }] });
    await fake.db.storage.from(BUCKET).upload("B/a.jpg", await photo());
    const deps = { db: fake.db, match: vi.fn(async () => ok), clean: vi.fn() };
    await matchItem({ id: "a", original_path: "B/a.jpg", match_attempts: 0 }, deps);
    fake.tables.bulk_image_items[0].status = "uploaded"; // a set change sent it back
    await matchItem({ id: "a", original_path: "B/a.jpg", match_attempts: 1 }, deps);
    expect(fake.ai.used).toBe(2 * CALLS_PER_MATCH);
  });
});

describe("accuracy check limits", () => {
  const answered = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: `i${i}`, batch_id: "B", status: "confirmed", original_path: `B/${i}.jpg`, original_filename: `${i}.jpg`,
    matched_pinhunt_id: "PHUK-1", candidates: [], created_at: String(i),
  }));

  it("stops when the daily budget is spent, and says how many photos it didn't reach", async () => {
    const fake = createFakeDb({ bulk_image_batches: [{ id: "B", stats: {} }], bulk_image_items: answered(5) });
    for (let i = 0; i < 5; i++) await fake.db.storage.from(BUCKET).upload(`B/${i}.jpg`, await photo());
    const match = vi.fn(async () => ok);
    const report = await checkBatchAccuracy("B", { db: fake.db, match, env: { BULK_AI_DAILY_CALLS: String(2 * CALLS_PER_MATCH) } });
    expect(match).toHaveBeenCalledTimes(2);
    expect(report).toMatchObject({ checked: 2, stopped: BUDGET_SPENT });
    expect(report.notChecked).toBeGreaterThanOrEqual(3);
  });

  it("one check at a time on the server, and not again within the cooldown", async () => {
    const fake = createFakeDb({ bulk_image_batches: [{ id: "B1", stats: {} }, { id: "B2", stats: {} }], bulk_image_items: [] });
    const deps = { db: fake.db, match: vi.fn(async () => ok) };
    const now = Date.parse("2026-11-28T18:00:00Z");
    expect(startBatchAccuracyCheck("B1", deps, null, now)).toBe(true);
    expect(startBatchAccuracyCheck("B1", deps, null, now)).toBe("running_here");
    expect(startBatchAccuracyCheck("B2", deps, null, now)).toBe("running_elsewhere");
    await vi.waitFor(() => expect(batchAccuracyRunning("B1")).toBe(false));
    // Checked 5 minutes ago: wait. Checked 11 minutes ago: fine.
    expect(startBatchAccuracyCheck("B2", deps, new Date(now - ACCURACY_COOLDOWN_MS / 2).toISOString(), now)).toBe("cooldown");
    expect(startBatchAccuracyCheck("B2", deps, new Date(now - ACCURACY_COOLDOWN_MS - 1).toISOString(), now)).toBe(true);
    await vi.waitFor(() => expect(batchAccuracyRunning("B2")).toBe(false));
  });
});

describe("set input and re-match bounds", () => {
  it("refuses oversized or odd set input before processing it", () => {
    expect(() => cleanSetList("x".repeat(2001))).toThrow(SetInputError);
    expect(() => cleanSetList(Array.from({ length: 21 }, (_, i) => `Set ${i}`))).toThrow(SetInputError);
    expect(() => cleanSetList([{ name: "x" }])).toThrow(SetInputError);
    expect(() => cleanSetList(42)).toThrow(SetInputError);
    expect(cleanSetList(null)).toEqual([]);
    expect(cleanSetList("Beauty and the Beast")).toEqual(["Beauty and the Beast"]);
  });

  it("re-matches at most MAX_REMATCH photos per change, oldest first", async () => {
    const rows = Array.from({ length: MAX_REMATCH + 5 }, (_, i) => ({ id: `p${i}`, batch_id: "B", status: "suggested", created_at: String(1000 + i) }));
    const fake = createFakeDb({ bulk_image_items: rows });
    expect(await rematchUndecided(fake.db, "B")).toBe(MAX_REMATCH);
    expect(fake.tables.bulk_image_items.filter((r) => r.status === "uploaded")).toHaveLength(MAX_REMATCH);
    expect(fake.tables.bulk_image_items.at(-1)!.status).toBe("suggested");
  });

  it("merges stats keys in one step, keeping keys another save wrote meanwhile", async () => {
    const fake = createFakeDb({ bulk_image_batches: [{ id: "B", stats: { setHints: ["A set"] } }] });
    // Simulate another save landing between this save's read and its write.
    type Q = { maybeSingle: () => Promise<unknown> };
    const db = fake.db as unknown as { from: (t: string) => Q };
    const realFrom = db.from.bind(db);
    let once = true;
    db.from = (t: string) => {
      const q = realFrom(t);
      if (once && t === "bulk_image_batches") {
        once = false;
        const realMaybe = q.maybeSingle.bind(q);
        q.maybeSingle = async () => {
          const r = await realMaybe();
          (fake.tables.bulk_image_batches[0].stats as Record<string, unknown>).setVotes = { x: ["i1"] };
          return r;
        };
      }
      return q;
    };
    await updateBatchStats(fake.db, "B", () => ({ accuracy: { at: "now", checked: 1, top1: 1, top5: 1, errors: 0, misses: [] } }));
    expect(fake.tables.bulk_image_batches[0].stats).toMatchObject({ setHints: ["A set"], setVotes: { x: ["i1"] }, accuracy: { checked: 1 } });
  });
});
