import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { CataloguePin, PinRepository } from "@workspace/pin-repository";
import { matchBand, matchPhoto, parseBox, type BulkMatchResult } from "./match";
import { cleanItem, cropToBox, matchItem, processBatch, releaseStaleClaims, BUCKET } from "./pipeline";
import { publishItem, PublishBlockedError } from "./publish";
import { createFakeDb } from "./fakeDb.test-helper";

vi.mock("../watermark", () => ({ watermarkPinPhoto: async (b: Buffer) => b }));

const pin = (id: string, extra: Partial<CataloguePin> = {}): CataloguePin => ({
  id, title: `Pin ${id}`, brand: "Disneyland Paris", collection: "Test Set", characters: ["Mickey Mouse"],
  categories: [], ...extra,
} as CataloguePin);

function fakeOpenAI(responses: string[]) {
  const calls: unknown[] = [];
  return {
    calls,
    client: {
      chat: {
        completions: {
          create: vi.fn(async (body: unknown) => {
            calls.push(body);
            return { choices: [{ message: { content: responses.shift() ?? "" } }] };
          }),
        },
      },
    } as never,
  };
}

function repoWith(pins: CataloguePin[]): PinRepository {
  return { searchPins: vi.fn(async () => pins) } as unknown as PinRepository;
}

const photo = async () => sharp({ create: { width: 40, height: 40, channels: 3, background: "#f00" } }).jpeg().toBuffer();

// ── match.ts ────────────────────────────────────────────────────────────────

describe("matchBand", () => {
  it("is confident only when a reference image confirmed a clear winner", () => {
    expect(matchBand([{ confidence: 92 }, { confidence: 40 }], true)).toBe("confident");
    expect(matchBand([{ confidence: 92 }, { confidence: 40 }], false)).toBe("possible");
    expect(matchBand([{ confidence: 92 }, { confidence: 85 }], true)).toBe("possible");
    expect(matchBand([{ confidence: 30 }], true)).toBe("uncertain");
    expect(matchBand([{ confidence: 10 }], true)).toBe("none");
    expect(matchBand([], false)).toBe("none");
  });
});

describe("matchPhoto", () => {
  it("describes, retrieves a bounded candidate list, ranks, and compares with Pin & Pop references", async () => {
    const ai = fakeOpenAI([
      JSON.stringify({ characters: ["Mickey Mouse"], keywords: ["castle"], text: "DLP 2026" }),
      JSON.stringify([
        { pinId: "PHUK-00000002", confidence: 70, reasoning: "a" },
        { pinId: "PHUK-00000001", confidence: 65, reasoning: "b" },
        { pinId: "PHUK-99999999", confidence: 99, reasoning: "not in candidates — dropped" },
      ]),
      JSON.stringify([
        { pinId: "PHUK-00000001", confidence: 95, reasoning: "reference matches" },
        { pinId: "PHUK-00000002", confidence: 20, reasoning: "different colours" },
      ]),
    ]);
    const referenceImages = vi.fn(async () => ({ "PHUK-00000001": "https://pinandpop.example/1.jpg" }));
    const result = await matchPhoto(await photo(), {
      openai: ai.client, model: "m", repository: repoWith([pin("PHUK-00000001"), pin("PHUK-00000002")]),
      referenceImages,
    });
    expect(ai.calls).toHaveLength(3);
    expect(result.candidates.map((c) => c.pinhuntId)).toEqual(["PHUK-00000001", "PHUK-00000002"]);
    expect(result.verified).toBe(true);
    expect(result.band).toBe("confident");
    // Reference URLs are used for matching only — never returned in candidates.
    expect(JSON.stringify(result.candidates)).not.toContain("pinandpop");
  });

  it("never claims confidence without a reference image", async () => {
    const ai = fakeOpenAI([
      JSON.stringify({ characters: [], keywords: ["star"] }),
      JSON.stringify([{ pinId: "PHUK-00000001", confidence: 97, reasoning: "x" }]),
    ]);
    const result = await matchPhoto(await photo(), {
      openai: ai.client, model: "m", repository: repoWith([pin("PHUK-00000001")]),
    });
    expect(ai.calls).toHaveLength(2);
    expect(result.verified).toBe(false);
    expect(result.band).toBe("possible");
  });

  it("returns no candidates when retrieval finds nothing, without a ranking call", async () => {
    const ai = fakeOpenAI([JSON.stringify({ characters: [], keywords: [] })]);
    const result = await matchPhoto(await photo(), { openai: ai.client, model: "m", repository: repoWith([]) });
    expect(result.band).toBe("none");
    expect(ai.calls).toHaveLength(1);
  });
});

// ── pipeline.ts ─────────────────────────────────────────────────────────────

async function seededBatch(items: Array<Record<string, unknown>>) {
  const fake = createFakeDb({ bulk_image_items: items });
  const bytes = await photo();
  for (const it of items) await fake.db.storage.from(BUCKET).upload(String(it.original_path), bytes);
  return fake;
}

const okMatch: BulkMatchResult = {
  candidates: [{
    pinhuntId: "PHUK-00000001", title: "t", collection: "c", brand: "b", edition: null, characters: [],
    imageUrl: null, confidence: 80, reasoning: "r",
  }],
  description: { characters: [], keywords: [] }, topConfidence: 80, band: "possible", verified: false, aiCalls: 2,
};

describe("pipeline", () => {
  it("matches uploaded items, and an item can't be claimed twice", async () => {
    const fake = await seededBatch([
      { id: "a", batch_id: "B", status: "uploaded", original_path: "B/a/original.jpg", match_attempts: 0, created_at: "1" },
    ]);
    const match = vi.fn(async () => okMatch);
    const deps = { db: fake.db, match, clean: vi.fn() };
    const item = { id: "a", original_path: "B/a/original.jpg", match_attempts: 0 };
    expect(await matchItem(item, deps)).toBe("suggested");
    expect(await matchItem(item, deps)).toBe("skipped");
    expect(match).toHaveBeenCalledTimes(1);
    const row = fake.tables.bulk_image_items[0];
    expect(row).toMatchObject({ status: "suggested", match_band: "possible", match_attempts: 1, top_confidence: 80 });
  });

  it("marks a failed match with its stage so only matching is retried", async () => {
    const fake = await seededBatch([
      { id: "a", batch_id: "B", status: "uploaded", original_path: "B/a/original.jpg", match_attempts: 0 },
    ]);
    const deps = { db: fake.db, match: vi.fn(async () => { throw new Error("rate limited"); }), clean: vi.fn() };
    expect(await matchItem({ id: "a", original_path: "B/a/original.jpg", match_attempts: 0 }, deps)).toBe("failed");
    expect(fake.tables.bulk_image_items[0]).toMatchObject({ status: "failed", failed_stage: "match", error: "rate limited" });
  });

  it("cleans once and reuses the cleaned photo when the match changes", async () => {
    const fake = await seededBatch([
      { id: "a", batch_id: "B", status: "confirmed", original_path: "B/a/original.jpg", cleaned_path: null, pixian_calls: 0 },
    ]);
    const clean = vi.fn(async (b: Buffer) => b);
    const deps = { db: fake.db, match: vi.fn(), clean };
    const row = fake.tables.bulk_image_items[0];
    expect(await cleanItem({ ...(row as Record<string, unknown>) } as never, deps)).toBe("cleaned");
    expect(row).toMatchObject({ status: "cleaned", pixian_calls: 1, cleaned_path: "B/a/cleaned-1.jpg" });

    // Re-confirmed with another pin → back through the clean stage, no new Pixian call.
    row.status = "confirmed";
    expect(await cleanItem({ ...(row as Record<string, unknown>) } as never, deps)).toBe("cleaned");
    expect(clean).toHaveBeenCalledTimes(1);
  });

  it("stops calling Pixian for a photo after the per-item limit", async () => {
    const fake = await seededBatch([
      { id: "a", batch_id: "B", status: "confirmed", original_path: "B/a/original.jpg", cleaned_path: null, pixian_calls: 4 },
    ]);
    const clean = vi.fn();
    const result = await cleanItem({ ...fake.tables.bulk_image_items[0] } as never, { db: fake.db, match: vi.fn(), clean });
    expect(result).toBe("failed");
    expect(clean).not.toHaveBeenCalled();
    expect(fake.tables.bulk_image_items[0]).toMatchObject({ failed_stage: "clean" });
  });

  it("counts a failed Pixian call (it may still be charged)", async () => {
    const fake = await seededBatch([
      { id: "a", batch_id: "B", status: "confirmed", original_path: "B/a/original.jpg", cleaned_path: null, pixian_calls: 0 },
    ]);
    await cleanItem({ ...fake.tables.bulk_image_items[0] } as never, {
      db: fake.db, match: vi.fn(), clean: vi.fn(async () => { throw new Error("timeout"); }),
    });
    expect(fake.tables.bulk_image_items[0]).toMatchObject({ status: "failed", failed_stage: "clean", pixian_calls: 1 });
  });

  it("processes a whole batch and respects the daily matching limit", async () => {
    const items = ["a", "b", "c"].map((id, i) => ({
      id, batch_id: "B2", status: "uploaded", original_path: `B2/${id}/original.jpg`, match_attempts: 0, created_at: String(i),
    }));
    const fake = await seededBatch(items);
    const match = vi.fn(async () => okMatch);
    const { done } = await processBatch("B2", {
      db: fake.db, match, clean: vi.fn(), env: { BULK_MATCH_DAILY_LIMIT: "2" },
    }, ["match"]);
    await done;
    expect(match).toHaveBeenCalledTimes(2);
    expect(fake.tables.bulk_image_items.map((r) => r.status)).toEqual(["suggested", "suggested", "uploaded"]);
  });

  it("returns items abandoned mid-step to the start of that step", async () => {
    const old = new Date(Date.now() - 60 * 60_000).toISOString();
    const fake = createFakeDb({ bulk_image_items: [
      { id: "a", batch_id: "B3", status: "matching", matching_started_at: old },
      { id: "b", batch_id: "B3", status: "cleaning", cleaning_started_at: old },
      { id: "c", batch_id: "B3", status: "matching", matching_started_at: new Date().toISOString() },
    ] });
    await releaseStaleClaims("B3", { db: fake.db, match: vi.fn(), clean: vi.fn() });
    expect(fake.tables.bulk_image_items.map((r) => r.status)).toEqual(["uploaded", "confirmed", "matching"]);
  });
});

// ── publish.ts ──────────────────────────────────────────────────────────────

describe("publishItem", () => {
  const item = {
    id: "item-1", batch_id: "B", status: "cleaned", matched_pinhunt_id: "PHUK-00000001",
    cleaned_path: "B/item-1/cleaned-1.jpg", cleaned_sha256: "abc",
  };
  const permitted = { permission_public_display: true, permission_recorded_at: "2026-11-12T00:00:00Z" };

  async function setup(imageUrl: string | null) {
    const fake = createFakeDb({ pins: [{ id: "uuid-1", pinhunt_id: "PHUK-00000001", image_url: imageUrl }], pin_images: [] });
    await fake.db.storage.from(BUCKET).upload(item.cleaned_path, await photo());
    const pinRepo = { updatePin: vi.fn(async () => ({})) } as unknown as PinRepository;
    return { fake, pinRepo };
  }

  it("refuses a batch without public display permission", async () => {
    const { fake, pinRepo } = await setup(null);
    await expect(publishItem(item, { ...permitted, permission_public_display: false }, "admin", {}, { db: fake.db, pinRepo }))
      .rejects.toMatchObject({ code: "no_permission" });
  });

  it("won't replace an existing catalogue photo without confirmation", async () => {
    const { fake, pinRepo } = await setup("https://cdn.test/existing.jpg");
    const err = await publishItem(item, permitted, "admin", {}, { db: fake.db, pinRepo }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishBlockedError);
    expect(err).toMatchObject({ code: "has_image", existingImageUrl: "https://cdn.test/existing.jpg" });
    expect(pinRepo.updatePin).not.toHaveBeenCalled();

    const ok = await publishItem(item, permitted, "admin", { replaceExisting: true }, { db: fake.db, pinRepo });
    expect(ok.replacedImageUrl).toBe("https://cdn.test/existing.jpg");
  });

  it("publishes with provenance and is safe to retry", async () => {
    const { fake, pinRepo } = await setup(null);
    const first = await publishItem(item, permitted, "admin", {}, { db: fake.db, pinRepo });
    expect(first.publicUrl).toContain("pin-catalogue/uuid-1/bulk-item-1.jpg");
    expect(pinRepo.updatePin).toHaveBeenCalledWith("PHUK-00000001", { imageUrl: first.publicUrl, needsFrontImage: false });
    expect(fake.tables.pin_images[0]).toMatchObject({
      pin_id: "uuid-1", source: "pinhunt_bulk_upload", source_record_id: "item-1", content_hash: "abc",
      status: "approved", public_display_allowed: true, contributor_consent_at: permitted.permission_recorded_at,
    });

    // The pin now shows our image; a retry doesn't need replaceExisting and adds no second row.
    fake.tables.pins[0].image_url = first.publicUrl;
    const again = await publishItem(item, permitted, "admin", {}, { db: fake.db, pinRepo });
    expect(again.pinImageId).toBe(first.pinImageId);
    expect(fake.tables.pin_images).toHaveLength(1);
  });
});

// ── Cropping to the main pin (photos taken on a pin board) ───────────────────

describe("cropping to the main pin", () => {
  const board = () => sharp({ create: { width: 1000, height: 800, channels: 3, background: "#888" } }).jpeg().toBuffer();

  it("accepts only sensible boxes", () => {
    expect(parseBox([0.2, 0.1, 0.8, 0.9])).toEqual([0.2, 0.1, 0.8, 0.9]);
    expect(parseBox([0.8, 0.1, 0.2, 0.9])).toBeUndefined(); // inverted
    expect(parseBox([0.5, 0.5, 0.55, 0.9])).toBeUndefined(); // too thin
    expect(parseBox([-1, 0, 2, 1])).toEqual([0, 0, 1, 1]); // clamped
    expect(parseBox("nope")).toBeUndefined();
  });

  it("crops with a margin and never past the edges", async () => {
    const meta = async (b: Buffer) => sharp(b).metadata();
    const exact = await meta(await cropToBox(await board(), [0.25, 0.25, 0.75, 0.75], 0));
    expect([exact.width, exact.height]).toEqual([500, 400]);
    const padded = await meta(await cropToBox(await board(), [0.25, 0.25, 0.75, 0.75], 0.1));
    expect([padded.width, padded.height]).toEqual([600, 480]);
    const edge = await meta(await cropToBox(await board(), [0, 0, 0.5, 0.5], 0.2));
    expect([edge.width, edge.height]).toEqual([600, 480]);
  });

  it("the match step returns the main pin's box from the describe call (no extra AI call)", async () => {
    const ai = fakeOpenAI([
      JSON.stringify({ characters: ["Remy"], keywords: ["sign"], box: [0.3, 0.2, 0.7, 0.9] }),
      JSON.stringify([{ pinId: "PHUK-00000001", confidence: 60, reasoning: "x" }]),
    ]);
    const result = await matchPhoto(await photo(), { openai: ai.client, model: "m", repository: repoWith([pin("PHUK-00000001")]) });
    expect(result.description.box).toEqual([0.3, 0.2, 0.7, 0.9]);
    expect(ai.calls).toHaveLength(2);
  });

  it("sends only the main pin to Pixian when a box is known", async () => {
    const fake = createFakeDb({ bulk_image_items: [{
      id: "a", batch_id: "B", status: "confirmed", original_path: "B/a/original.jpg", cleaned_path: null, pixian_calls: 0,
      description: { box: [0.25, 0.25, 0.75, 0.75] },
    }] });
    await fake.db.storage.from(BUCKET).upload("B/a/original.jpg", await board());
    const sizes: number[] = [];
    const clean = vi.fn(async (b: Buffer) => { sizes.push((await sharp(b).metadata()).width!); return b; });
    await cleanItem({ ...fake.tables.bulk_image_items[0] } as never, { db: fake.db, match: vi.fn(), clean });
    expect(sizes[0]).toBe(580); // 500 px box + 8% margin each side

    // Turned off: the whole photo goes to Pixian.
    fake.tables.bulk_image_items[0].status = "confirmed";
    fake.tables.bulk_image_items[0].cleaned_path = null;
    await cleanItem({ ...fake.tables.bulk_image_items[0] } as never, { db: fake.db, match: vi.fn(), clean, env: { BULK_AUTO_CROP: "false" } });
    expect(sizes[1]).toBe(1000);
  });

  it("uses an admin's crop as-is", async () => {
    const fake = createFakeDb({ bulk_image_items: [{
      id: "a", batch_id: "B", status: "confirmed", original_path: "B/a/cropped-1731400000000.jpg", cleaned_path: null,
      pixian_calls: 2, description: { box: [0.25, 0.25, 0.75, 0.75] },
    }] });
    await fake.db.storage.from(BUCKET).upload("B/a/cropped-1731400000000.jpg", await board());
    const sizes: number[] = [];
    const clean = vi.fn(async (b: Buffer) => { sizes.push((await sharp(b).metadata()).width!); return b; });
    expect(await cleanItem({ ...fake.tables.bulk_image_items[0] } as never, { db: fake.db, match: vi.fn(), clean })).toBe("cleaned");
    expect(sizes).toEqual([1000]);
  });
});
