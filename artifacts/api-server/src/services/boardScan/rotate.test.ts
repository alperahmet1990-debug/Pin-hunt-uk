import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Turning a cleaned photo during review (pipeline.rotateCleaned) against an
// in-memory store: every turn starts from the un-turned clean-up, the
// previous turned file is removed, the shared base never is, and nothing
// changes once the photo has been approved or rejected.

const mem = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  removed: [] as string[],
  item: null as null | Record<string, unknown>,
  /** When set, the conditional update finds the photo no longer under review. */
  raceLost: false,
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({ isAiConfigured: () => true, getOpenAIClient: () => ({}) }));
vi.mock("../pixian", () => ({ pixianConfigured: () => true, PixianTimeoutError: class extends Error {}, normalizePinPhoto: async (b: Buffer) => b }));
vi.mock("./store", async (importOriginal) => {
  const real = await importOriginal<typeof import("./store")>();
  return {
    ...real,
    downloadObject: async (_b: string, p: string) => {
      const o = mem.objects.get(p);
      if (!o) throw new Error(`missing ${p}`);
      return o;
    },
    uploadObject: async (_b: string, p: string, body: Buffer) => { mem.objects.set(p, body); },
    removeObject: async (_b: string, p: string) => { mem.removed.push(p); mem.objects.delete(p); },
    updateItemIf: async (_id: string, where: Record<string, unknown>, patch: Record<string, unknown>) => {
      if (mem.raceLost || Object.entries(where).some(([k, v]) => mem.item![k] !== v)) return null;
      Object.assign(mem.item!, patch);
      return { ...mem.item };
    },
  };
});

import { parseTurnedPath, rotateCleaned, turnedPath, ReviewError } from "./pipeline";
import { estimateTilt } from "./straighten";
import type { BoardScan, BoardScanItem } from "./store";

const card = (deg: number) => sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#fff"/><g transform="rotate(${deg} 300 300)"><rect x="190" y="130" width="220" height="340" rx="10" fill="#c9a227"/></g></svg>`,
)).jpeg({ quality: 95 }).toBuffer();

const BASE = "user-1/board-scan-1/crop-a.jpg";
const scan = { id: "scan-1", created_by: "user-1" } as BoardScan;
const item = () => mem.item as unknown as BoardScanItem;

beforeEach(async () => {
  mem.objects.clear();
  mem.removed = [];
  mem.raceLost = false;
  mem.objects.set(BASE, await card(8));
  mem.item = { id: "item-1", cleanup_status: "done", cleaned_path: BASE, image_review: "none" };
});

describe("rotateCleaned", () => {
  it("names turned files by base, item and total angle", () => {
    const p = turnedPath(BASE, "item-1", -4.5);
    expect(p).toBe("user-1/board-scan-1/crop-a.turn.item-1.-4.5.jpg");
    expect(parseTurnedPath(p)).toEqual({ base: BASE, itemId: "item-1", degrees: -4.5 });
    expect(parseTurnedPath(BASE)).toBeNull();
  });

  it("turns by hand from the un-turned photo each time, removing only its own previous turn", async () => {
    await rotateCleaned(scan, item(), 3);
    const first = item().cleaned_path!;
    expect(parseTurnedPath(first)).toMatchObject({ base: BASE, degrees: 3 });

    await rotateCleaned(scan, item(), 3);
    expect(parseTurnedPath(item().cleaned_path!)).toMatchObject({ base: BASE, degrees: 6 });
    expect(mem.removed).toEqual([first]);
    expect(mem.objects.has(BASE)).toBe(true);

    // Turning back to zero goes back to the shared base, not a new file.
    await rotateCleaned(scan, item(), -6);
    expect(item().cleaned_path).toBe(BASE);
    expect(mem.objects.has(BASE)).toBe(true);
  });

  it("straightens automatically, then reports it's already straight", async () => {
    await rotateCleaned(scan, item(), "auto");
    const straight = mem.objects.get(item().cleaned_path!)!;
    expect((await estimateTilt(straight)).reason).toBe("already_straight");
    await expect(rotateCleaned(scan, item(), "auto")).rejects.toMatchObject({ status: 422, message: "It already looks straight." });
  });

  it("says when it can't find straight edges", async () => {
    mem.objects.set(BASE, await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#fff"/><circle cx="300" cy="300" r="180" fill="#c33"/></svg>`,
    )).jpeg().toBuffer());
    await expect(rotateCleaned(scan, item(), "auto")).rejects.toMatchObject({ status: 422 });
    expect(item().cleaned_path).toBe(BASE);
  });

  it("refuses photos that aren't cleaned, are published or were rejected", async () => {
    for (const patch of [{ cleanup_status: "none", cleaned_path: null }, { image_review: "approved" }, { image_review: "rejected" }]) {
      mem.item = { id: "item-1", cleanup_status: "done", cleaned_path: BASE, image_review: "none", ...patch };
      await expect(rotateCleaned(scan, item(), 3)).rejects.toBeInstanceOf(ReviewError);
      expect(mem.item.cleaned_path).toBe(patch.cleaned_path === null ? null : BASE);
    }
  });

  it("doesn't change a photo approved while it was being turned, and tidies up", async () => {
    mem.raceLost = true;
    await expect(rotateCleaned(scan, item(), 3)).rejects.toMatchObject({ status: 409 });
    expect(item().cleaned_path).toBe(BASE);
    expect([...mem.objects.keys()]).toEqual([BASE]);
  });

  it("won't turn past 45 degrees in total", async () => {
    mem.item!.cleaned_path = turnedPath(BASE, "item-1", 44);
    mem.objects.set(mem.item!.cleaned_path as string, await card(0));
    await expect(rotateCleaned(scan, item(), 3)).rejects.toBeInstanceOf(ReviewError);
  });
});
