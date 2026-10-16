// Catalogue image clean-up (#367). Pixian, Supabase and the disk are all
// fakes here: nothing leaves the process.
import { describe, expect, it, vi } from "vitest";
import {
  licenceAllowsEdits, matchPinSources, parseArgs, parseIdsFile, planPublish, redact,
  renderReviewHtml, reviewTemplate, runClean, runFetch, runPublish, runRevert, selectToClean, sourceAllows,
} from "./catalogue-image-clean.mjs";

const CONFIRMED = { id: "ok_source", exact_license_variant: "CC BY 4.0", storage_allowed: true, public_display_allowed: true, app_use_allowed: true };
const CPT = { id: "collectible_pintrader", exact_license_variant: "pending confirmation", storage_allowed: true, public_display_allowed: true, app_use_allowed: true };
const PNP = { id: "pin_and_pop", exact_license_variant: null, storage_allowed: false, public_display_allowed: false, app_use_allowed: false };

const entry = (id, extra = {}) => ({
  pinId: `uuid-${id}`, pinhuntId: id, title: `Pin ${id}`, source: "ok_source", sourceRecordId: "9",
  originalUrl: `https://img.test/${id}.jpg`, originalFile: `originals/${id}.jpg`, originalType: "image/jpeg",
  cleanedFile: null, cleanedTest: null, cleanedAt: null, ...extra,
});
const log = () => {};

describe("parseArgs", () => {
  it("reads commands and flags", () => {
    expect(parseArgs(["fetch", "--pinhunt-ids", "PHUK-1, PHUK-2", "--limit", "3", "--dir", "out"]))
      .toMatchObject({ command: "fetch", pinhuntIds: ["PHUK-1", "PHUK-2"], limit: 3, dir: "out" });
    expect(parseArgs(["publish"])).toMatchObject({ apply: false, limit: 10 });
    expect(parseArgs(["publish", "--apply"]).apply).toBe(true);
    expect(parseArgs(["fetch", "--all"]).limit).toBe(Infinity);
  });

  it("makes clean choose test or paid explicitly", () => {
    expect(() => parseArgs(["clean"])).toThrow(/--test.*--paid/);
    expect(() => parseArgs(["clean", "--test", "--paid"])).toThrow();
    expect(parseArgs(["clean", "--test"]).test).toBe(true);
    expect(parseArgs(["clean", "--paid"]).paid).toBe(true);
  });

  it("rejects bad input", () => {
    expect(() => parseArgs([])).toThrow(/Unknown command/);
    expect(() => parseArgs(["fetch", "--limit", "0"])).toThrow(/--limit/);
    expect(() => parseArgs(["fetch", "--limit"])).toThrow(/needs a value/);
    expect(() => parseArgs(["fetch", "--nope"])).toThrow(/Unknown flag/);
  });

  it("reads an IDs file", () => {
    expect(parseIdsFile("PHUK-1\n\n# note\nPHUK-2 # trailing\r\n")).toEqual(["PHUK-1", "PHUK-2"]);
  });
});

describe("rights", () => {
  it("only allows edits once the licence is confirmed and isn't no-derivatives", () => {
    for (const v of [null, "", "pending confirmation", "CC BY-ND 4.0", "CC BY-NC-ND", "NoDerivatives"]) {
      expect(licenceAllowsEdits(v)).toBe(false);
    }
    for (const v of ["CC BY 4.0", "CC BY-SA 4.0", "CC0", "Written permission incl. edits"]) {
      expect(licenceAllowsEdits(v)).toBe(true);
    }
  });

  it("lets a source be cleaned locally before its licence is confirmed, but not published", () => {
    expect(sourceAllows(CPT, "clean").ok).toBe(true);
    expect(sourceAllows(CPT, "publish")).toMatchObject({ ok: false, reason: expect.stringMatching(/licence/) });
    expect(sourceAllows(CONFIRMED, "publish").ok).toBe(true);
    expect(sourceAllows(PNP, "clean").ok).toBe(false);
    expect(sourceAllows(null, "clean").ok).toBe(false);
  });

  it("finds each pin's source from the pin_images row matching its current image", () => {
    const pins = [{ id: "a", image_url: "u1" }, { id: "b", image_url: "u2" }, { id: "c", image_url: "u3" }];
    const images = [
      { pin_id: "a", image_url: "u1", source: "collectible_pintrader", source_record_id: "7" },
      { pin_id: "b", image_url: "other", source: "collectible_pintrader" },
      { pin_id: "c", image_url: "u3", source: null },
    ];
    const out = matchPinSources(pins, images);
    expect(out.get("a")).toEqual({ source: "collectible_pintrader", sourceRecordId: "7" });
    expect(out.get("b")).toBeNull();
    expect(out.get("c")).toBeNull();
  });
});

describe("runFetch", () => {
  const pins = [
    { id: "p1", pinhunt_id: "PHUK-1", title: "One", image_url: "https://img.test/1.jpg" },
    { id: "p2", pinhunt_id: "PHUK-2", title: "Two", image_url: "https://img.test/2.jpg" },
    { id: "p3", pinhunt_id: "PHUK-3", title: "Three", image_url: "https://img.test/3.jpg" },
    { id: "p4", pinhunt_id: "../evil", title: "Bad", image_url: "https://img.test/4.jpg" },
  ];
  const images = [
    { pin_id: "p1", image_url: "https://img.test/1.jpg", source: "ok_source" },
    { pin_id: "p2", image_url: "https://img.test/2.jpg", source: "pin_and_pop" },
    { pin_id: "p4", image_url: "https://img.test/4.jpg", source: "ok_source" },
  ];
  const deps = () => ({
    loadPins: async () => pins,
    loadPinImages: async () => images,
    loadSources: async () => [CONFIRMED, PNP],
    download: vi.fn(async () => ({ buffer: Buffer.from("img"), contentType: "image/jpeg" })),
    writeFile: vi.fn(async () => {}),
    log,
  });

  it("downloads only pins whose source allows it, and says why the rest were skipped", async () => {
    const d = deps();
    const { manifest, downloaded, skipped } = await runFetch({ limit: 10, source: null }, { pins: [] }, d);
    expect(downloaded).toBe(1);
    expect(d.writeFile).toHaveBeenCalledWith("originals/PHUK-1.jpg", expect.any(Buffer));
    expect(manifest.pins).toEqual([expect.objectContaining({ pinhuntId: "PHUK-1", source: "ok_source", originalUrl: "https://img.test/1.jpg" })]);
    expect(skipped.map((s) => s.pinhuntId)).toEqual(["PHUK-2", "PHUK-3", "../evil"]);
    expect(skipped[1].reason).toMatch(/unknown/);
  });

  it("skips pins it already has and stops at the limit", async () => {
    const d = deps();
    const again = await runFetch({ limit: 10, source: null }, { pins: [entry("PHUK-1", { originalUrl: "https://img.test/1.jpg" })] }, d);
    expect(again.downloaded).toBe(0);
    expect(d.download).not.toHaveBeenCalled();

    const many = deps();
    images.push({ pin_id: "p3", image_url: "https://img.test/3.jpg", source: "ok_source" });
    const limited = await runFetch({ limit: 1, source: null }, { pins: [] }, many);
    images.pop();
    expect(limited.downloaded).toBe(1);
    expect(many.download).toHaveBeenCalledTimes(1);
  });

  it("rejects downloads that aren't images", async () => {
    const d = { ...deps(), download: async () => ({ buffer: Buffer.from("<html>"), contentType: "text/html" }) };
    const { downloaded, skipped } = await runFetch({ limit: 10, source: null }, { pins: [] }, d);
    expect(downloaded).toBe(0);
    expect(skipped[0].reason).toMatch(/not an image/);
  });
});

describe("runClean", () => {
  const deps = () => ({
    readFile: async () => Buffer.from("orig"),
    writeFile: vi.fn(async () => {}),
    normalize: vi.fn(async () => Buffer.from("clean")),
    now: () => "2026-10-16T00:00:00.000Z",
    log,
  });

  it("skips pins already cleaned; a test result is redone by a paid run", () => {
    const m = { pins: [entry("A"), entry("B", { cleanedFile: "cleaned/B.jpg", cleanedTest: false }), entry("C", { cleanedFile: "cleaned-test/C.jpg", cleanedTest: true })] };
    expect(selectToClean(m, { test: true, limit: 10 }).map((e) => e.pinhuntId)).toEqual(["A"]);
    expect(selectToClean(m, { test: false, limit: 10 }).map((e) => e.pinhuntId)).toEqual(["A", "C"]);
    expect(selectToClean(m, { test: false, limit: 1 }).map((e) => e.pinhuntId)).toEqual(["A"]);
  });

  it("keeps test and paid results apart and records failures", async () => {
    const d = deps();
    d.normalize.mockRejectedValueOnce(new Error("Pixian request failed (402)"));
    const m = { pins: [entry("A"), entry("B")] };
    const { cleaned, failed } = await runClean({ test: true, limit: 10 }, m, d);
    expect(cleaned).toBe(1);
    expect(failed).toEqual([{ pinhuntId: "A", reason: "Pixian request failed (402)" }]);
    expect(m.pins[1]).toMatchObject({ cleanedFile: "cleaned-test/B.jpg", cleanedTest: true });
    expect(d.writeFile).toHaveBeenCalledWith("cleaned-test/B.jpg", expect.any(Buffer));
  });
});

describe("review", () => {
  it("keeps earlier decisions and starts new pins unapproved", () => {
    const m = { pins: [entry("A", { cleanedFile: "cleaned/A.jpg" }), entry("B", { cleanedFile: "cleaned/B.jpg" }), entry("C")] };
    expect(reviewTemplate(m, { A: true, Z: true })).toEqual({ A: true, B: false });
  });

  it("shows before and after, escapes titles, and flags test results", () => {
    const m = { pins: [entry("A", { title: '<b>"Mickey"</b>', cleanedFile: "cleaned-test/A.jpg", cleanedTest: true })] };
    const html = renderReviewHtml(m, { A: true });
    expect(html).toContain('src="originals/A.jpg"');
    expect(html).toContain('src="cleaned-test/A.jpg"');
    expect(html).toContain("&lt;b&gt;&quot;Mickey&quot;&lt;/b&gt;");
    expect(html).not.toContain("<b>\"Mickey\"");
    expect(html).toContain("can’t be published");
    expect(html).toMatch(/data-id="A" checked/);
  });
});

describe("publish", () => {
  const manifest = () => ({
    pins: [
      entry("OK", { cleanedFile: "cleaned/OK.jpg", cleanedTest: false }),
      entry("NOTAPPROVED", { cleanedFile: "cleaned/NOTAPPROVED.jpg", cleanedTest: false }),
      entry("TEST", { cleanedFile: "cleaned-test/TEST.jpg", cleanedTest: true }),
      entry("CPT", { source: "collectible_pintrader", cleanedFile: "cleaned/CPT.jpg", cleanedTest: false }),
      entry("RAW"),
    ],
  });
  const review = { OK: true, NOTAPPROVED: false, TEST: true, CPT: true, RAW: true };
  const deps = () => ({
    loadSources: async () => [CONFIRMED, CPT],
    readFile: async () => Buffer.from("cleaned bytes"),
    upload: vi.fn(async (p) => `https://cdn.test/${p}`),
    setPinImage: vi.fn(async () => true),
    insertPinImage: vi.fn(async () => {}),
    now: () => "2026-10-16T09:00:00.000Z",
    log,
  });

  it("only plans approved, paid results from sources that allow edits", () => {
    const { publish, skipped } = planPublish(manifest(), review, [CONFIRMED, CPT]);
    expect(publish.map((e) => e.pinhuntId)).toEqual(["OK"]);
    expect(Object.fromEntries(skipped.map((s) => [s.pinhuntId, s.reason]))).toEqual({
      TEST: expect.stringMatching(/watermarked/),
      CPT: expect.stringMatching(/licence/),
      RAW: "not cleaned",
    });
  });

  it("writes nothing without --apply", async () => {
    const d = deps();
    const result = await runPublish({ apply: false }, manifest(), review, d);
    expect(result).toMatchObject({ planned: 1, published: 0 });
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.setPinImage).not.toHaveBeenCalled();
    expect(d.insertPinImage).not.toHaveBeenCalled();
  });

  it("with --apply uploads a new object, switches the pin only if unchanged, and records the original", async () => {
    const d = deps();
    const m = manifest();
    const result = await runPublish({ apply: true }, m, review, d);
    expect(result.published).toBe(1);
    const [objectPath] = d.upload.mock.calls[0];
    expect(objectPath).toMatch(/^cleaned\/OK\/[0-9a-f]{16}\.jpg$/);
    expect(d.setPinImage).toHaveBeenCalledWith("uuid-OK", `https://cdn.test/${objectPath}`, "https://img.test/OK.jpg");
    expect(d.insertPinImage).toHaveBeenCalledWith(expect.objectContaining({
      pin_id: "uuid-OK", source: "ok_source", status: "approved", public_display_allowed: true, is_primary: false,
      description: "Cleaned with Pixian on 2026-10-16. Original: https://img.test/OK.jpg",
    }));
    expect(m.pins[0].publishedUrl).toBe(`https://cdn.test/${objectPath}`);

    // Running again doesn't publish twice.
    const again = await runPublish({ apply: true }, m, review, d);
    expect(again.published).toBe(0);
    expect(again.skipped.find((s) => s.pinhuntId === "OK").reason).toBe("already published");
  });

  it("leaves a pin alone when its image changed since fetch", async () => {
    const d = { ...deps(), setPinImage: vi.fn(async () => false) };
    const m = manifest();
    const result = await runPublish({ apply: true }, m, review, d);
    expect(result.published).toBe(0);
    expect(result.failed[0].reason).toMatch(/changed since fetch/);
    expect(d.insertPinImage).not.toHaveBeenCalled();
    expect(m.pins[0].publishedUrl).toBeUndefined();
  });

  it("keeps the pin revertable if only the provenance record fails", async () => {
    const d = { ...deps(), insertPinImage: vi.fn(async () => { throw new Error("rls"); }) };
    const m = manifest();
    const result = await runPublish({ apply: true }, m, review, d);
    expect(result.published).toBe(1);
    expect(m.pins[0].publishedUrl).toBeTruthy();
  });
});

describe("revert", () => {
  const m = () => ({ pins: [entry("A", { publishedUrl: "https://cdn.test/a" }), entry("B", { publishedUrl: "https://cdn.test/b" }), entry("C")] });

  it("is a dry run without --apply", async () => {
    const setPinImage = vi.fn(async () => true);
    await runRevert({ apply: false, pinhuntIds: [] }, m(), { setPinImage, log });
    expect(setPinImage).not.toHaveBeenCalled();
  });

  it("restores the original only where the cleaned copy is still showing", async () => {
    const setPinImage = vi.fn(async (pinId) => pinId === "uuid-A");
    const manifest = m();
    const { reverted } = await runRevert({ apply: true, pinhuntIds: [] }, manifest, { setPinImage, log });
    expect(reverted).toBe(1);
    expect(setPinImage).toHaveBeenCalledWith("uuid-A", "https://img.test/A.jpg", "https://cdn.test/a");
    expect(manifest.pins[0].publishedUrl).toBeNull();
    expect(manifest.pins[1].publishedUrl).toBe("https://cdn.test/b");
  });

  it("can revert just the IDs given", async () => {
    const setPinImage = vi.fn(async () => true);
    await runRevert({ apply: true, pinhuntIds: ["B"] }, m(), { setPinImage, log });
    expect(setPinImage).toHaveBeenCalledTimes(1);
    expect(setPinImage).toHaveBeenCalledWith("uuid-B", "https://img.test/B.jpg", "https://cdn.test/b");
  });
});

describe("redact", () => {
  it("removes secret values from output", () => {
    expect(redact("auth failed for key-abc123 and sec-xyz789", ["key-abc123", "sec-xyz789", undefined, ""]))
      .toBe("auth failed for [redacted] and [redacted]");
  });
});
