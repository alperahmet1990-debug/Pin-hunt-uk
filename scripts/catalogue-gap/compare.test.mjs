import test from "node:test";
import assert from "node:assert/strict";
import { compare, fieldDiff, parseCsv, parseImageUrl, parseJsonExport, renderMarkdown, renderReviewCsv, rightsCheck } from "./lib.mjs";

const S = "ssssssssssssssssssss";
const P = "pppppppppppppppppppp";
const url = (ref, p) => `https://${ref}.supabase.co/storage/v1/object/public/pin-catalogue/${p}`;
const content = (o) => JSON.stringify({ title: "x", collection: "c", ...o });
const pin = (o) => ({ verification_status: "verified", is_searchable: "true", catalogue_status: "active", collection: "Wishables", release_year: "2024", external_ids: null, image_url: null, back_image_url: null, content_md5: o.content_md5 ?? o.content ?? "m", content: content({ title: o.title }), ...o });
const side = (env, pins, images = [], extra = {}) => ({
  summary: { environment: env, generated_at: "t", pins: { total: pins.length }, pin_images: [{ count: images.length }],
    catalogue_sources: [
      { id: "ok", public_display_allowed: true, storage_allowed: true, exact_license_variant: "CC BY 4.0" },
      { id: "pending", public_display_allowed: true, storage_allowed: true, exact_license_variant: "pending confirmation" },
    ], ...extra.summary },
  pins, images, storage: extra.storage ?? null, work: extra.work ?? null,
});

test("parseCsv handles quotes, commas and newlines", () => {
  const rows = parseCsv('a,b\n"x, ""y""","line1\nline2"\n,z\n');
  assert.deepEqual(rows, [{ a: 'x, "y"', b: "line1\nline2" }, { a: null, b: "z" }]);
});

test("parseJsonExport accepts raw JSON and a one-cell CSV", () => {
  assert.deepEqual(parseJsonExport('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonExport('summary\n"{""a"":1}"\n'), { a: 1 });
});

test("parseImageUrl extracts project ref, bucket and path", () => {
  assert.deepEqual(parseImageUrl(url(S, "cleaned/PHUK-1/a%20b.jpg")), { ref: S, bucket: "pin-catalogue", path: "cleaned/PHUK-1/a b.jpg" });
  assert.equal(parseImageUrl("https://example.com/x.jpg").ref, null);
});

test("fieldDiff ignores columns only one project has unless they hold a value", () => {
  assert.deepEqual(fieldDiff({ a: 1, newcol: null }, { a: 1 }), []);
  assert.equal(fieldDiff({ a: 1, newcol: "v" }, { a: 1 })[0].schemaOnly, true);
  assert.deepEqual(fieldDiff({ a: 2 }, { a: 1 }).map((d) => d.field), ["a"]);
});

test("rightsCheck: Pin & Pop never; pending licence blocks edited photos only", () => {
  const src = side("production", []).summary.catalogue_sources;
  assert.equal(rightsCheck("pin_and_pop", src).ok, false);
  assert.equal(rightsCheck("Pin-And-Pop", src).ok, false);
  assert.equal(rightsCheck("pending", src).ok, true);
  assert.equal(rightsCheck("pending", src, { edited: true }).ok, false);
  assert.equal(rightsCheck("missing", src).ok, false);
  assert.equal(rightsCheck(null, src).ok, false);
});

test("classification never merges records on ID or title alone", () => {
  const prod = side("production", [
    pin({ id: "p1", pinhunt_id: "PHUK-1", title: "Mickey", content_md5: "a" }),
    pin({ id: "p5", pinhunt_id: "PHUK-5", title: "Pluto Glow", collection: "Glow", release_year: "2025" }),
    pin({ id: "p3", pinhunt_id: "PHUK-3", title: "Goofy", image_url: url(S, "g.jpg") }),
  ]);
  const stg = side("staging", [
    pin({ id: "p1", pinhunt_id: "PHUK-1", title: "Mickey", content_md5: "a" }),
    pin({ id: "s5", pinhunt_id: "PHUK-5", title: "Daisy" }),
    pin({ id: "s7", pinhunt_id: "PHUK-7", title: "pluto  GLOW", collection: "glow", release_year: "2025" }),
    pin({ id: "s8", pinhunt_id: "PHUK-8", title: "Brand new" }),
  ]);
  const r = compare(stg, prod, { stagingRef: S, productionRef: P });
  assert.equal(r.pins.same, 1);
  assert.equal(r.pins.collisions.length, 1, "same PinHunt ID, different record → collision for review");
  const dup = r.pins.stagingOnly.find((x) => x.s.id === "s7");
  assert.equal(dup.possible[0].m.id, "p5", "same title+series+year → possible duplicate, not merged");
  assert.ok(r.review.some((x) => x.category === "possible_duplicate" && x.severity === "review"));
  assert.ok(r.review.some((x) => x.category === "new_pin" && x.staging_id === "s8"));
  assert.equal(r.photos.dependsOnStaging.length, 1);
  assert.equal(r.review.filter((x) => x.severity === "critical").length, 1);
  assert.equal(r.checks.length, 0);
});

test("field changes on the same record are listed per field", () => {
  const prod = side("production", [pin({ id: "p2", pinhunt_id: "PHUK-2", content_md5: "a", content: content({ title: "Minnie" }) })]);
  const stg = side("staging", [pin({ id: "p2", pinhunt_id: "PHUK-2", content_md5: "b", content: content({ title: "Minnie Mouse" }) })]);
  const r = compare(stg, prod, { stagingRef: S, productionRef: P });
  assert.equal(r.pins.changed.length, 1);
  assert.deepEqual(r.pins.changed[0].diffs.map((d) => d.field), ["title"]);
});

test("approved staging photos: ready, would-replace, blocked, pin-first, already there", () => {
  const prodPins = [
    pin({ id: "p1", pinhunt_id: "PHUK-1", title: "A" }),
    pin({ id: "p2", pinhunt_id: "PHUK-2", title: "B", image_url: url(P, "b.jpg") }),
    pin({ id: "p3", pinhunt_id: "PHUK-3", title: "C" }),
    pin({ id: "p4", pinhunt_id: "PHUK-4", title: "D" }),
  ];
  const stgPins = [...prodPins.map((p) => ({ ...p })), pin({ id: "s9", pinhunt_id: "PHUK-9", title: "New" })];
  const img = (id, pin_id, src, path, o = {}) => ({ id, pin_id, source: src, status: "approved", image_url: url(S, path), content_hash: id, is_pin_front_photo: "true", ...o });
  const prodImgs = [{ id: "i4", pin_id: "p4", source: "ok", status: "approved", image_url: url(P, "d.jpg"), content_hash: "i4" }];
  const stgImgs = [
    img("i1", "p1", "ok", "a.jpg"),
    img("i2", "p2", "ok", "b2.jpg"),
    img("i3", "p3", "pending", "cleaned/PHUK-3/c.jpg"),
    img("i4", "p4", "ok", "d-copy.jpg"),
    img("i9", "s9", "ok", "n.jpg"),
    img("ipnp", "p1", "pin_and_pop", "x.jpg"),
    img("ipend", "p1", "ok", "y.jpg", { status: "pending" }),
  ];
  const r = compare(side("staging", stgPins, stgImgs), side("production", prodPins, prodImgs), { stagingRef: S, productionRef: P });
  assert.deepEqual(r.photos.ready.map((x) => x.i.id).sort(), ["i1", "i2"]);
  assert.ok(r.photos.ready.find((x) => x.i.id === "i2").replaces, "production already has a photo → explicit choice");
  assert.deepEqual(r.photos.blocked.map((x) => x.i.id), ["i3"]);
  assert.deepEqual(r.photos.needsPinDecision.map((x) => x.i.id), ["i9"]);
  assert.equal(r.photos.alreadyThere, 1, "same content hash already in production");
  assert.deepEqual(r.photos.pendingInStaging.map((x) => x.id), ["ipend"]);
  assert.ok(!JSON.stringify(r.review).includes("ipnp"), "Pin & Pop rows never appear");
});

test("truncated exports and swapped folders are reported as errors", () => {
  const prod = side("staging", [pin({ id: "p1", pinhunt_id: "PHUK-1" })]);
  prod.summary.pins.total = 5000;
  const r = compare(side("staging", []), prod, { stagingRef: S, productionRef: P });
  const errs = r.checks.filter((c) => c.level === "error").map((c) => c.text).join(" ");
  assert.match(errs, /swapped/);
  assert.match(errs, /cut short/);
});

test("report and review CSV render", () => {
  const stg = side("staging", [pin({ id: "s8", pinhunt_id: "PHUK-8", title: 'Comma, "quote"' })], [], {
    work: { pin_submissions: { draft_count: 0, items: [] }, board_scans: { boards: [], items: [] }, bulk_images: { batches: [], items: [] } },
  });
  const prod = side("production", []);
  const r = compare(stg, prod, { stagingRef: S, productionRef: P });
  const md = renderMarkdown(r, { staging: stg, production: prod });
  assert.match(md, /Pins only in staging/);
  const csv = renderReviewCsv(r.review);
  assert.equal(parseCsv(csv)[0].staging_title, 'Comma, "quote"');
});
