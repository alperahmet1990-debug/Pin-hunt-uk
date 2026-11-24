import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The accuracy check against an in-memory board: re-match the pins the
// reviewer answered, never change them, and report right-first / top-5 and
// the misses.

const mem = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  updates: [] as Array<[string, Record<string, unknown>]>,
  itemWrites: 0,
}));

vi.mock("./store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store")>()),
  listItems: async () => mem.items,
  updateScan: async (id: string, patch: Record<string, unknown>) => { mem.updates.push([id, patch]); },
  updateItem: async () => { mem.itemWrites++; },
}));

import { accuracyRunning, answeredItems, checkAccuracy, startAccuracyCheck } from "./accuracy";
import type { BoardScan, BoardScanItem } from "./store";
import type { CropMatch } from "./match";

const scan = { id: "s1", stats: { setHints: ["Tails of Friendship"] } } as unknown as BoardScan;
const item = (n: number, patch: Record<string, unknown>) => ({
  id: `i${n}`, position: n, crop_path: `s1/crops/${n}.jpg`, decision: "confirmed", suggested_pin_id: `PHUK-${n}`, decided_pin_id: null,
  detection: { characters: ["Meeko"], keywords: [], text: "" },
  candidates: [{ pinId: `PHUK-${n}`, title: `Pin ${n}`, collection: "", imageUrl: null, confidence: 90, reasoning: "" }],
  ...patch,
});
const cand = (pinId: string, confidence = 80) => ({ pinId, title: `Title ${pinId}`, collection: "", imageUrl: null, confidence, reasoning: "" });

let picture: Buffer;
beforeEach(async () => {
  picture = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#c33" } }).jpeg().toBuffer();
  mem.updates = [];
  mem.itemWrites = 0;
  mem.items = [
    item(1, {}), // right first time
    item(2, {}), // right pin second
    item(3, { decision: "corrected", decided_pin_id: "PHUK-30" }), // not found at all
    item(4, { decision: "undecided" }), // no answer: not checked
    item(5, { decision: "excluded" }), // not a pin: not checked
    item(6, {}), // its crop can't be read
  ];
});

const answers: Record<string, CropMatch> = {
  "s1/crops/1.jpg": { status: "suggested", verified: true, candidates: [cand("PHUK-1"), cand("PHUK-9")] },
  "s1/crops/2.jpg": { status: "suggested", verified: true, candidates: [cand("PHUK-9", 70), cand("PHUK-2", 60)] },
  "s1/crops/3.jpg": { status: "unmatched", verified: false, candidates: [cand("PHUK-8", 20)] },
};

function deps() {
  // Each crop is its own buffer, so the fake match knows which pin it was given.
  const byBuffer = new Map<Buffer, string>();
  return {
    matchDeps: () => ({}) as never,
    download: async (p: string) => {
      if (p.endsWith("6.jpg")) throw new Error("missing");
      const b = Buffer.from(picture);
      byBuffer.set(b, p);
      return b;
    },
    match: vi.fn(async (crop: Buffer, _d: unknown, _m: unknown, _u: unknown, opts?: { sets?: string[] }) => {
      expect(opts?.sets).toEqual(["Tails of Friendship"]);
      return answers[byBuffer.get(crop)!];
    }),
  };
}

describe("accuracy check", () => {
  it("checks only pins with the reviewer's answer and a crop", () => {
    expect(answeredItems(mem.items as unknown as BoardScanItem[]).map((i) => i.id)).toEqual(["i1", "i2", "i3", "i6"]);
  });

  it("reports right first time, in the top 5, and the misses, without changing any pin", async () => {
    const report = await checkAccuracy(scan, deps());
    expect(report).toMatchObject({ checked: 3, top1: 1, top5: 2, errors: 1 });
    expect(report.misses).toEqual([
      { itemId: "i2", position: 2, expected: { pinId: "PHUK-2", title: "Pin 2" }, got: { pinId: "PHUK-9", title: "Title PHUK-9", confidence: 70 }, rank: 2 },
      { itemId: "i3", position: 3, expected: { pinId: "PHUK-30", title: null }, got: { pinId: "PHUK-8", title: "Title PHUK-8", confidence: 20 }, rank: null },
    ]);
    expect(mem.updates).toEqual([["s1", { stats: { accuracy: report } }]]);
    expect(mem.itemWrites).toBe(0);
  });

  it("runs one check per board at a time, in the background", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slow = { matchDeps: () => ({}) as never, download: async () => { await gate; return picture; }, match: async () => answers["s1/crops/1.jpg"] };
    expect(startAccuracyCheck(scan, slow)).toBe(true);
    expect(accuracyRunning("s1")).toBe(true);
    expect(startAccuracyCheck(scan, slow)).toBe(false);
    release();
    await vi.waitFor(() => expect(accuracyRunning("s1")).toBe(false));
    expect(mem.updates).toHaveLength(1);
  });
});
