/**
 * Catalogue image clean-up (#367) — the logic behind
 * scripts/clean-catalogue-images.mjs, kept free of network and disk side
 * effects so it can be tested. Every Supabase, Pixian and file call comes in
 * through `deps`.
 *
 * Steps: fetch → clean → review → publish (and revert). Only publish and
 * revert write to the database, and both are dry runs unless `apply` is set.
 */
import crypto from "node:crypto";

export const DEFAULT_LIMIT = 10;
export const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
export const STORAGE_BUCKET = "pin-catalogue";
const COMMANDS = ["fetch", "clean", "review", "publish", "revert"];

// ── arguments ───────────────────────────────────────────────────────────────

/** `clean --test --limit 5` → { command: 'clean', test: true, limit: 5, ... }. Throws on bad input. */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command)) {
    throw new Error(`Unknown command "${command ?? ""}". Use one of: ${COMMANDS.join(", ")}.`);
  }
  const out = { command, dir: "catalogue-image-clean", test: false, paid: false, apply: false, all: false, limit: DEFAULT_LIMIT, pinhuntIds: [], idsFile: null, source: null };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const value = () => {
      const v = rest[++i];
      if (v == null || v.startsWith("--")) throw new Error(`${flag} needs a value.`);
      return v;
    };
    if (flag === "--test") out.test = true;
    else if (flag === "--paid") out.paid = true;
    else if (flag === "--apply") out.apply = true;
    else if (flag === "--all") out.all = true;
    else if (flag === "--dir") out.dir = value();
    else if (flag === "--source") out.source = value();
    else if (flag === "--ids-file") out.idsFile = value();
    else if (flag === "--pinhunt-ids") out.pinhuntIds = value().split(",").map((s) => s.trim()).filter(Boolean);
    else if (flag === "--limit") {
      const n = Number(value());
      if (!Number.isInteger(n) || n < 1) throw new Error("--limit must be a whole number above 0.");
      out.limit = n;
    } else throw new Error(`Unknown flag ${flag}.`);
  }
  if (out.command === "clean" && out.test === out.paid) {
    throw new Error("clean needs exactly one of --test (free, watermarked) or --paid (uses Pixian credits).");
  }
  if (out.all) out.limit = Infinity;
  return out;
}

/** One PinHunt ID per line; blank lines and # comments ignored. */
export function parseIdsFile(text) {
  return text.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
}

// ── rights ──────────────────────────────────────────────────────────────────

/**
 * True only once the source's licence is confirmed and allows edited copies.
 * Unknown or "pending confirmation" means no; so does any no-derivatives
 * variant (CC BY-ND, BY-NC-ND).
 */
export function licenceAllowsEdits(variant) {
  const v = String(variant ?? "").trim();
  if (!v || /pending/i.test(v)) return false;
  return !/(^|[^a-z])nd([^a-z]|$)|no\s*-?\s*deriv/i.test(v);
}

/**
 * Whether a source's images may be cleaned (locally) or published (cleaned
 * copy shown in the app). Returns { ok, reason }.
 */
export function sourceAllows(source, stage) {
  if (!source) return { ok: false, reason: "image source unknown, so its rights can't be checked" };
  if (!source.storage_allowed || !source.public_display_allowed) {
    return { ok: false, reason: `${source.id} doesn't allow storing and showing its images` };
  }
  if (stage === "publish") {
    if (!source.app_use_allowed) return { ok: false, reason: `${source.id} doesn't allow app use` };
    if (!licenceAllowsEdits(source.exact_license_variant)) {
      return { ok: false, reason: `${source.id} licence not confirmed to allow edited images (catalogue_sources.exact_license_variant)` };
    }
  }
  return { ok: true, reason: null };
}

/**
 * Which source each pin's current image came from: the pin_images row whose
 * URL matches pins.image_url. No match → null (unknown, skipped).
 */
export function matchPinSources(pins, pinImages) {
  const byPin = new Map();
  for (const img of pinImages) {
    if (!img.source) continue;
    const list = byPin.get(img.pin_id) ?? [];
    list.push(img);
    byPin.set(img.pin_id, list);
  }
  const out = new Map();
  for (const pin of pins) {
    const hit = (byPin.get(pin.id) ?? []).find((img) => img.image_url === pin.image_url);
    out.set(pin.id, hit ? { source: hit.source, sourceRecordId: hit.source_record_id ?? null } : null);
  }
  return out;
}

// ── fetch ───────────────────────────────────────────────────────────────────

const extFor = (contentType) =>
  /png/i.test(contentType) ? "png" : /webp/i.test(contentType) ? "webp" : "jpg";

/**
 * Picks pins, checks rights, downloads originals, returns the new manifest.
 * deps: { loadPins(opts), loadPinImages(pinIds), loadSources(), download(url), writeFile(rel, buf), log }
 */
export async function runFetch(opts, manifest, deps) {
  const pins = await deps.loadPins(opts);
  const images = await deps.loadPinImages(pins.map((p) => p.id));
  const sources = new Map((await deps.loadSources()).map((s) => [s.id, s]));
  const sourceOf = matchPinSources(pins, images);
  const entries = new Map((manifest.pins ?? []).map((e) => [e.pinhuntId, e]));
  const skipped = [];
  let downloaded = 0;

  for (const pin of pins) {
    if (downloaded >= opts.limit) break;
    // Used in file names, so it must be a plain ID.
    if (!/^[A-Za-z0-9_-]+$/.test(String(pin.pinhunt_id ?? ""))) {
      skipped.push({ pinhuntId: String(pin.pinhunt_id ?? pin.id), reason: "no usable PinHunt ID" });
      continue;
    }
    const match = sourceOf.get(pin.id);
    if (opts.source && match?.source !== opts.source) continue;
    const rights = sourceAllows(match ? sources.get(match.source) ?? { id: match.source } : null, "clean");
    if (!rights.ok) { skipped.push({ pinhuntId: pin.pinhunt_id, reason: rights.reason }); continue; }

    const existing = entries.get(pin.pinhunt_id);
    if (existing?.originalUrl === pin.image_url && existing.originalFile) continue;
    try {
      const { buffer, contentType } = await deps.download(pin.image_url);
      if (!/^image\//i.test(contentType)) throw new Error(`not an image (${contentType || "no type"})`);
      if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error("larger than 15 MB");
      const originalFile = `originals/${pin.pinhunt_id}.${extFor(contentType)}`;
      await deps.writeFile(originalFile, buffer);
      entries.set(pin.pinhunt_id, {
        pinId: pin.id,
        pinhuntId: pin.pinhunt_id,
        title: pin.title ?? "",
        source: match.source,
        sourceRecordId: match.sourceRecordId,
        originalUrl: pin.image_url,
        originalFile,
        originalType: contentType,
        cleanedFile: null,
        cleanedTest: null,
        cleanedAt: null,
      });
      downloaded += 1;
    } catch (err) {
      skipped.push({ pinhuntId: pin.pinhunt_id, reason: `download failed: ${err.message}` });
    }
  }
  deps.log(`fetch: ${downloaded} downloaded, ${skipped.length} skipped.`);
  for (const s of skipped) deps.log(`  skipped ${s.pinhuntId}: ${s.reason}`);
  return { manifest: { ...manifest, pins: [...entries.values()] }, downloaded, skipped };
}

// ── clean ───────────────────────────────────────────────────────────────────

/** Pins still to clean. A paid result is final; a test result only counts for another test run. */
export function selectToClean(manifest, { test, limit }) {
  return (manifest.pins ?? [])
    .filter((e) => e.originalFile && (!e.cleanedFile || (e.cleanedTest && !test)))
    .slice(0, limit);
}

/**
 * Sends each selected original to Pixian. deps: { readFile(rel), writeFile(rel, buf), normalize(buf, type), now(), log }
 */
export async function runClean(opts, manifest, deps) {
  const todo = selectToClean(manifest, opts);
  const failed = [];
  let cleaned = 0;
  for (const entry of todo) {
    try {
      const out = await deps.normalize(await deps.readFile(entry.originalFile), entry.originalType ?? "image/jpeg");
      const cleanedFile = `${opts.test ? "cleaned-test" : "cleaned"}/${entry.pinhuntId}.jpg`;
      await deps.writeFile(cleanedFile, out);
      Object.assign(entry, { cleanedFile, cleanedTest: opts.test, cleanedAt: deps.now() });
      cleaned += 1;
    } catch (err) {
      failed.push({ pinhuntId: entry.pinhuntId, reason: err.message });
    }
  }
  deps.log(`clean (${opts.test ? "test mode, watermarked, no credits" : "paid"}): ${cleaned} cleaned, ${failed.length} failed.`);
  for (const f of failed) deps.log(`  failed ${f.pinhuntId}: ${f.reason}`);
  return { manifest, cleaned, failed };
}

// ── review ──────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** review.json: every cleaned pin, keeping earlier decisions; new ones start unapproved. */
export function reviewTemplate(manifest, existing = {}) {
  const out = {};
  for (const e of manifest.pins ?? []) if (e.cleanedFile) out[e.pinhuntId] = existing[e.pinhuntId] === true;
  return out;
}

/** A local before/after contact sheet. Ticking boxes and pressing the button downloads a new review.json. */
export function renderReviewHtml(manifest, review = {}) {
  const rows = (manifest.pins ?? []).filter((e) => e.cleanedFile).map((e) => `
  <figure>
    <div class="pair">
      <img src="${esc(e.originalFile)}" alt="Before: ${esc(e.title)}">
      <img src="${esc(e.cleanedFile)}" alt="After: ${esc(e.title)}">
    </div>
    <figcaption>
      <label><input type="checkbox" data-id="${esc(e.pinhuntId)}"${review[e.pinhuntId] === true ? " checked" : ""}> Approve</label>
      <strong>${esc(e.pinhuntId)}</strong> ${esc(e.title)}
      ${e.cleanedTest ? '<span class="warn">Test result (watermarked) — can’t be published</span>' : ""}
    </figcaption>
  </figure>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catalogue image review</title>
<style>
  body{font-family:system-ui,sans-serif;margin:16px;background:#fff;color:#1d1d2b}
  figure{margin:0 0 24px;border-bottom:1px solid #ddd;padding-bottom:16px}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .pair img{width:100%;aspect-ratio:1;object-fit:contain;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px;border:1px solid #ddd}
  .warn{color:#b00020;display:block}
  header{position:sticky;top:0;background:#fff;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #ddd;z-index:1}
  h1{font-size:20px;margin:0}
  button{padding:10px 14px;font-size:15px}
</style></head><body>
<header>
  <h1>Catalogue image review</h1>
  <button id="save">Download review.json</button>
</header>
<p>Before on the left, after on the right. Tick the ones to publish, then save the review file next to this page.</p>
${rows || "<p>Nothing cleaned yet. Run the clean step first.</p>"}
<script>
document.getElementById('save').onclick = () => {
  const out = {};
  document.querySelectorAll('input[data-id]').forEach(i => { out[i.dataset.id] = i.checked; });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  a.download = 'review.json';
  a.click();
};
</script>
</body></html>
`;
}

// ── publish ─────────────────────────────────────────────────────────────────

/** What publish would do: approved, paid-cleaned pins whose source allows edited copies. */
export function planPublish(manifest, review, sources) {
  const bySource = new Map(sources.map((s) => [s.id, s]));
  const publish = [];
  const skipped = [];
  for (const e of manifest.pins ?? []) {
    if (review[e.pinhuntId] !== true) continue;
    if (!e.cleanedFile) { skipped.push({ pinhuntId: e.pinhuntId, reason: "not cleaned" }); continue; }
    if (e.cleanedTest) { skipped.push({ pinhuntId: e.pinhuntId, reason: "test result (watermarked); run clean --paid" }); continue; }
    if (e.publishedUrl) { skipped.push({ pinhuntId: e.pinhuntId, reason: "already published" }); continue; }
    const rights = sourceAllows(bySource.get(e.source) ?? null, "publish");
    if (!rights.ok) { skipped.push({ pinhuntId: e.pinhuntId, reason: rights.reason }); continue; }
    publish.push(e);
  }
  return { publish, skipped };
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/**
 * Uploads each cleaned image as a new Storage object, records it in
 * pin_images (with the original URL), and points pins.image_url at it.
 * The original object and its pin_images row are never touched. Without
 * `apply` it only reports. The image is only switched if pins.image_url
 * still holds the URL we cleaned, so a newer photo is never overwritten.
 *
 * deps: { loadSources(), readFile(rel), upload(path, buf) → publicUrl,
 *         insertPinImage(row), setPinImage(pinId, url, expectedUrl) → boolean, now(), log }
 */
export async function runPublish(opts, manifest, review, deps) {
  const { publish, skipped } = planPublish(manifest, review, await deps.loadSources());
  deps.log(`publish${opts.apply ? "" : " (dry run — add --apply to write)"}: ${publish.length} to publish, ${skipped.length} skipped.`);
  for (const s of skipped) deps.log(`  skipped ${s.pinhuntId}: ${s.reason}`);
  if (!opts.apply) {
    for (const e of publish) deps.log(`  would publish ${e.pinhuntId}`);
    return { manifest, published: 0, failed: [], skipped, planned: publish.length };
  }

  const failed = [];
  let published = 0;
  for (const e of publish) {
    try {
      const buf = await deps.readFile(e.cleanedFile);
      const hash = sha256(buf);
      const url = await deps.upload(`cleaned/${e.pinhuntId}/${hash.slice(0, 16)}.jpg`, buf);
      const switched = await deps.setPinImage(e.pinId, url, e.originalUrl);
      if (!switched) throw new Error("pin's image changed since fetch; run fetch again");
      // Switched: record it straight away so revert always works.
      Object.assign(e, { publishedUrl: url, publishedAt: deps.now() });
      published += 1;
      deps.log(`  published ${e.pinhuntId}`);
      await deps.insertPinImage({
        pin_id: e.pinId,
        image_url: url,
        image_type: "front",
        is_primary: false,
        source: e.source,
        source_record_id: e.sourceRecordId,
        content_hash: hash,
        status: "approved",
        public_display_allowed: true,
        attribution_required: true,
        description: `Cleaned with Pixian on ${deps.now().slice(0, 10)}. Original: ${e.originalUrl}`,
      }).catch((err) => deps.log(`  warning ${e.pinhuntId}: published, but the pin_images record failed: ${err.message}`));
    } catch (err) {
      failed.push({ pinhuntId: e.pinhuntId, reason: err.message });
      deps.log(`  failed ${e.pinhuntId}: ${err.message}`);
    }
  }
  deps.log(`publish: ${published} published, ${failed.length} failed.`);
  return { manifest, published, failed, skipped, planned: publish.length };
}

/**
 * Puts the original image back for published pins (all, or the IDs given).
 * Only when pins.image_url still holds our cleaned copy. Dry run unless `apply`.
 * deps: { setPinImage(pinId, url, expectedUrl) → boolean, log }
 */
export async function runRevert(opts, manifest, deps) {
  const wanted = new Set(opts.pinhuntIds);
  const todo = (manifest.pins ?? []).filter((e) => e.publishedUrl && (!wanted.size || wanted.has(e.pinhuntId)));
  deps.log(`revert${opts.apply ? "" : " (dry run — add --apply to write)"}: ${todo.length} pin(s).`);
  let reverted = 0;
  for (const e of todo) {
    if (!opts.apply) { deps.log(`  would restore ${e.pinhuntId}`); continue; }
    const ok = await deps.setPinImage(e.pinId, e.originalUrl, e.publishedUrl);
    if (ok) {
      Object.assign(e, { publishedUrl: null, publishedAt: null });
      reverted += 1;
      deps.log(`  restored ${e.pinhuntId}`);
    } else deps.log(`  left ${e.pinhuntId}: its image changed since publish`);
  }
  return { manifest, reverted };
}

// ── output ──────────────────────────────────────────────────────────────────

/** Removes any secret values from text before it's printed. */
export function redact(text, secrets) {
  let out = String(text ?? "");
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("[redacted]");
  return out;
}
