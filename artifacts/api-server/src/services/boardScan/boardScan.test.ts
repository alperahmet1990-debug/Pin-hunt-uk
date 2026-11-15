import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { dedupeDetections, parseDetection, sortReadingOrder, type DetectedPin } from "./detect";
import { assessCrop, boxToPixels, differenceHash, hammingDistance, laplacianVariance, normaliseBoardPhoto, touchesEdge } from "./quality";
import { boardMetrics, bulkApproveBlock, cleanupBlock, itemPriority } from "./rules";
import type { BoardScanItem } from "./store";
import { parseMatches } from "../pinRank";

const pin = (x: number, y: number, w = 0.1, h = 0.1, extra: Partial<DetectedPin> = {}): DetectedPin => ({
  box: { x, y, w, h }, characters: [], keywords: [], text: "", occluded: false, partial: false, ...extra,
});

function item(extra: Partial<BoardScanItem> = {}): BoardScanItem {
  return {
    id: "i1", board_scan_id: "s1", position: 1, origin: "detected", box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
    crop_path: "s1/crops/001.jpg", crop_sha256: "abc", crop_dhash: "0", detection: null,
    quality: { widthPx: 600, heightPx: 600, sharpness: 300, glare: 0, touchesEdge: false, occluded: false, partial: false, score: 90, suitable: true, reasons: [] },
    match_status: "suggested", candidates: [], suggested_pin_id: "PHUK-1", match_confidence: 90, pin_has_image: false,
    decision: "undecided", decided_pin_id: null, exclude_reason: null, priority: 0,
    cleanup_status: "none", cleanup_note: null, cleaned_path: null, image_review: "none", pin_image_id: null,
    attempts: 1, error: null, created_at: "", updated_at: "", ...extra,
  };
}

describe("parseDetection", () => {
  it("reads 0–1000 boxes as fractions and drops malformed entries", () => {
    const raw = 'Here you go: {"pins":[{"box":[100,200,300,400],"characters":["Grogu"],"keywords":["Mandalorian"],"text":"THIS IS THE WAY","occluded":true,"glare":true},' +
      '{"box":[1,2,3]},{"box":[0,0,1000,1000]},{"box":[500,500,503,503]},{"box":[900,900,800,800],"partial":true}]}';
    const pins = parseDetection(raw);
    expect(pins).toHaveLength(2);
    expect(pins[0].box).toEqual({ x: 0.1, y: 0.2, w: expect.closeTo(0.2), h: expect.closeTo(0.2) });
    expect(pins[0]).toMatchObject({ characters: ["Grogu"], text: "THIS IS THE WAY", occluded: true, partial: false, glare: true });
    // Swapped corners are put right.
    expect(pins[1].box.x).toBeCloseTo(0.8);
    expect(pins[1].partial).toBe(true);
  });

  it("returns [] for junk", () => {
    expect(parseDetection("")).toEqual([]);
    expect(parseDetection("{not json}")).toEqual([]);
    expect(parseDetection('{"pins":"x"}')).toEqual([]);
  });
});

describe("dedupeDetections", () => {
  it("merges overlapping and contained boxes, keeping the larger un-cut one", () => {
    const kept = dedupeDetections([
      pin(0.1, 0.1, 0.2, 0.2),
      pin(0.11, 0.11, 0.19, 0.19), // same pin
      pin(0.15, 0.15, 0.05, 0.05, { partial: true }), // inside the first
      pin(0.5, 0.1),
    ]);
    expect(kept).toHaveLength(2);
    expect(kept[0].box.w).toBeCloseTo(0.2);
  });

  it("keeps neighbouring pins that only touch", () => {
    expect(dedupeDetections([pin(0.1, 0.1), pin(0.2, 0.1), pin(0.1, 0.2)])).toHaveLength(3);
  });
});

describe("sortReadingOrder", () => {
  it("orders row by row, left to right", () => {
    const sorted = sortReadingOrder([pin(0.5, 0.52), pin(0.1, 0.1), pin(0.1, 0.5), pin(0.5, 0.12)]);
    expect(sorted.map((p) => [p.box.x, p.box.y])).toEqual([[0.1, 0.1], [0.5, 0.12], [0.1, 0.5], [0.5, 0.52]]);
  });
});

describe("quality", () => {
  it("pads and clamps boxes to the image", () => {
    expect(boxToPixels({ x: 0, y: 0.5, w: 0.5, h: 0.5 }, 1000, 800, 0.1)).toEqual({ left: 0, top: 360, width: 550, height: 440 });
  });

  it("flags boxes at the photo edge", () => {
    expect(touchesEdge({ x: 0, y: 0.3, w: 0.1, h: 0.1 })).toBe(true);
    expect(touchesEdge({ x: 0.3, y: 0.3, w: 0.1, h: 0.1 })).toBe(false);
  });

  it("scores a flat image as blurred and a checkerboard as sharp", () => {
    const flat = new Uint8Array(100).fill(128);
    const checker = Uint8Array.from({ length: 100 }, (_, i) => ((i % 10) + Math.floor(i / 10)) % 2 ? 255 : 0);
    expect(laplacianVariance(flat, 10, 10)).toBe(0);
    expect(laplacianVariance(checker, 10, 10)).toBeGreaterThan(1000);
  });

  it("marks small, blurry or occluded crops unsuitable, with reasons", async () => {
    const blank = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#808080" } }).jpeg().toBuffer();
    const q = await assessCrop(blank, { x: 0.4, y: 0.4, w: 0.05, h: 0.05 }, 4000, 3000, { occluded: true });
    expect(q.suitable).toBe(false);
    expect(q.reasons).toEqual(expect.arrayContaining(["low_resolution", "blurry", "occluded"]));
  });

  it("treats glare reported by detection as glare, even when no pixel is blown out", async () => {
    const plain = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#e8b0a0" } }).jpeg().toBuffer();
    const q = await assessCrop(plain, { x: 0.4, y: 0.4, w: 0.05, h: 0.05 }, 4000, 3000, { glare: true });
    expect(q.glare).toBe(0);
    expect(q.reasons).toContain("glare");
  });

  it("gives a re-compressed crop a closer hash than a different pin", async () => {
    const draw = (shape: string) => sharp(Buffer.from(
      `<svg width="128" height="128"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>` +
      `<rect width="128" height="128" fill="url(#g)"/>${shape}</svg>`)).jpeg().toBuffer();
    const a = await draw('<circle cx="40" cy="60" r="30" fill="#c00"/>');
    const b = await sharp(a).jpeg({ quality: 50 }).toBuffer();
    const other = await draw('<rect x="60" y="10" width="60" height="100" fill="#fff"/>');
    const ha = await differenceHash(a);
    expect(hammingDistance(ha, await differenceHash(b))).toBeLessThan(hammingDistance(ha, await differenceHash(other)));
  });

  it("applies EXIF orientation and strips metadata", async () => {
    const rotated = await sharp({ create: { width: 300, height: 100, channels: 3, background: "#fff" } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await normaliseBoardPhoto(rotated);
    expect([out.width, out.height]).toEqual([100, 300]);
    expect((await sharp(out.image).metadata()).orientation).toBeUndefined();
  });
});

describe("rules", () => {
  const scan = { permission_public_display: true };

  it("puts pins with no catalogue photo first", () => {
    expect(itemPriority(item({ pin_has_image: false }))).toBeGreaterThan(itemPriority(item({ pin_has_image: true })));
    expect(itemPriority(item({ decision: "excluded" }))).toBeLessThan(0);
  });

  it("cleans a suitable, confident crop of a pin with no photo", () => {
    expect(cleanupBlock(scan, item(), [], { imageUrl: null, pendingImages: 0 })).toBeNull();
  });

  it("never cleans without public display permission, even when forced", () => {
    expect(cleanupBlock({ permission_public_display: false }, item(), [], undefined, true)).toBe("no_public_permission");
  });

  it("skips unsuitable, unconfident and already-photographed pins unless forced", () => {
    const poor = item({ quality: { ...item().quality!, suitable: false, reasons: ["blurry"] } });
    expect(cleanupBlock(scan, poor, [], undefined)).toBe("unsuitable");
    expect(cleanupBlock(scan, poor, [], undefined, true)).toBeNull();
    expect(cleanupBlock(scan, item({ match_confidence: 50 }), [], undefined)).toBe("low_confidence");
    expect(cleanupBlock(scan, item({ match_confidence: 50, decision: "confirmed", decided_pin_id: "PHUK-1" }), [], undefined)).toBeNull();
    expect(cleanupBlock(scan, item(), [], { imageUrl: "https://x/y.jpg", pendingImages: 0 })).toBe("pin_has_photo");
    expect(cleanupBlock(scan, item(), [], { imageUrl: null, pendingImages: 1 })).toBe("pin_has_pending_photo");
  });

  it("cleans only the best crop when a pin appears twice", () => {
    const better = item({ id: "i2", position: 2, quality: { ...item().quality!, score: 95 } });
    expect(cleanupBlock(scan, item(), [item(), better], undefined)).toBe("duplicate_of_better_crop");
    expect(cleanupBlock(scan, better, [item(), better], undefined)).toBeNull();
  });

  it("bulk-approves only cleaned, confident, unphotographed pins", () => {
    const ready = item({ cleanup_status: "done", cleaned_path: "u/board-s1/i1.jpg" });
    expect(bulkApproveBlock(scan, ready, { imageUrl: null, pendingImages: 0 })).toBeNull();
    expect(bulkApproveBlock(scan, { ...ready, match_confidence: 60 }, undefined)).toBe("match needs confirming");
    expect(bulkApproveBlock(scan, { ...ready, match_confidence: 60, decision: "corrected", decided_pin_id: "PHUK-2" }, undefined)).toBeNull();
    expect(bulkApproveBlock(scan, ready, { imageUrl: "https://x", pendingImages: 0 })).toBe("pin already has a photo");
    expect(bulkApproveBlock(scan, item(), undefined)).toBe("not cleaned");
  });

  it("derives detection and match accuracy from review decisions", () => {
    const items = [
      item({ id: "a", decision: "confirmed", decided_pin_id: "PHUK-1", cleanup_status: "done", image_review: "approved" }),
      item({ id: "b", decision: "corrected", decided_pin_id: "PHUK-9" }),
      item({ id: "c", decision: "excluded", exclude_reason: "not_a_pin" }),
      item({ id: "d", origin: "manual", decision: "confirmed", decided_pin_id: "PHUK-3", suggested_pin_id: null }),
    ];
    const m = boardMetrics({ stats: { pixianCalls: 1, totalMs: 61_000 } }, items);
    expect(m).toMatchObject({
      detected: 3, manualAdds: 1, falsePositives: 1, pinsOnBoard: 3,
      matchedCorrectly: 1, corrected: 1, matchAccuracy: 0.5, published: 1, manualCorrections: 3, pixianCalls: 1, totalSeconds: 61,
    });
    expect(m.detectionRate).toBeCloseTo(0.667, 2);
  });
});

describe("parseMatches", () => {
  it("keeps known, unique ids and clamps confidence", () => {
    const raw = '[{"pinId":"A","confidence":120,"reasoning":"x"},{"pinId":"A","confidence":5},{"pinId":"Z","confidence":50},{"pinId":"B","confidence":"40"}]';
    expect(parseMatches(raw, new Set(["A", "B"]))).toEqual([
      { pinId: "A", confidence: 100, reasoning: "x" },
      { pinId: "B", confidence: 40, reasoning: "" },
    ]);
    expect(parseMatches("nope", new Set(["A"]))).toEqual([]);
  });
});
