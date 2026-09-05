/**
 * Collectible PinTrader export → Catalogue V2 importer.
 *
 * Reusable, idempotent. Identity key for re-runs: pin_external_ids
 * (source='collectible_pintrader', external_id=<CTP numeric id>) — running
 * this twice updates existing V2 pins in place rather than duplicating them.
 *
 * Field mapping, price/currency handling, image provenance, and the
 * A-HIGH-only automatic set creation rule all follow the approved
 * Catalogue V2 plan (see /Users/alperahmet/.claude/plans/hashed-sleeping-firefly.md
 * for the full rationale and classification breakdown).
 *
 * Usage:
 *   node --env-file=.env scripts/import-collectible-pintrader.mjs <export-dir> --dry-run
 *   node --env-file=.env scripts/import-collectible-pintrader.mjs <export-dir> --apply
 *
 * <export-dir>: folder containing numbered subfolders (0001, 0002, ...) of
 * extracted JSON records — NOT the zip files.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [, , exportDirArg, ...flags] = process.argv;
const APPLY = flags.includes("--apply");
if (!exportDirArg || !fs.existsSync(exportDirArg)) {
  console.error("Usage: node import-collectible-pintrader.mjs <export-dir> [--dry-run|--apply]");
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run with node --env-file=.env).");
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const SOURCE = "collectible_pintrader";
const STORAGE_BUCKET = "pin-catalogue";

// ── text/normalisation helpers ──────────────────────────────────────────────
const clean = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s.length ? s : null;
};
const normText = (s) => {
  if (s == null) return "";
  return String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
};
const tokenSet = (s) => new Set(normText(s).split(" ").filter(Boolean));
const overlaps = (a, b) => {
  if (!a.size || !b.size) return null;
  for (const t of a) if (b.has(t)) return true;
  return false;
};
const yearFromDate = (d) => {
  if (!d) return null;
  const m = String(d).match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
};
const sha256Buf = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const isValidJpeg = (buf) =>
  buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;

// ── price parsing — only a clean single-pin USD price is usable ────────────
function parsePinPriceUsd(raw) {
  if (!raw) return null;
  const s = String(raw);
  const m = s.match(/[\d,]+\.?\d*/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const qualifierMatch = s.match(/\(([^)]*)\)/);
  if (!qualifierMatch) return n; // no qualifier at all -- plain single-pin price
  const qualifier = qualifierMatch[1].toLowerCase();
  if (qualifier.includes("for the pin")) return n;
  return null; // "for the set", "per bag", "per box", etc. -- ambiguous, skip
}

// ── CTP group classification: A-HIGH / A-REVIEW / B / C ────────────────────
// Ported verbatim from the read-only analysis pass validated in the approved
// plan (502 / 20 / 29 / 38 against the live 589-group export).
const FORCE_B = new Set([
  "sandals", "white glove", "square faces", "square characters",
  "character logo danglers", "star wars - vehicles", "star wars emblems",
  "best animated feature", "peek-a-boo", "black & white photos", "best friends",
]);
const FORCE_C = new Set(["minnie mouse as", "holidays #1", "from the sketch pad", "birthstone cameo brooch"]);
const BARE_FRANCHISE = new Set([
  "star wars", "pixar", "marvel", "disney parks", "disney", "princess", "villains",
  "toy story", "frozen", "coco", "moana", "zootopia",
]);
const A_SIGNALS = [
  /\bmystery\b/, /\bbooster\b/, /\bboxed set\b/, /\bframed\b/, /\bpin set\b/,
  /\bcard set\b/, /\bstarter set\b/, /\bopening day\b/, /\btrading (pin )?(event|night|board)\b/,
  /\bhidden mickey\b/, /\bhidden disney\b/, /\bannual passholder\b/, /\bmagicband\b/,
  /\bseries\b/, /\bcollection\b/, /\bset\b/, /\bpuzzle\b/, /\bcompleter\b/,
  /\bpark pack\b/, /\bmagical mystery pins\b/, /\bpinquest\b/, /\bdssh\b/, /\bdsf\b/,
  /\banniversary\b/, /\bcelebration\b/, /\bfestival\b/, /\bmemories\b/, /\bquotes\b/,
  /\bquotable\b/, /\breveal\s*\/?\s*conceal\b/, /\bcountdown\b/, /\bvariations of\b/,
  /\bstretch portrait/, /\blove is\b/, /\blove can\b/, /\bzodiac\b/, /\bportraits\b/,
  /\bwave \d/, /#\d/, /\bblind box\b/, /\bvinylmation\b/, /\bconcepts\b/,
  /\b(19|20)\d{2}\b/,
  /\bthrough the years\b/, /\bmuseum of\b/, /\bshields of\b/, /\bstained glass\b/,
  /\bas cars\b/, /\bconnection\b/, /\bpin celebration\b/, /\bparade of stars\b/,
  /\bpin trader/, /\ba piece of\b/, /\bmontage\b/, /\bsilhouettes\b/,
  /\bloungefly \w/, /\bdance/, /\bday \d{4}\b/, /\bhistory\b/,
];
function classifyGroupABC(g) {
  const gl = g.toLowerCase().trim();
  if (FORCE_B.has(gl)) return "B";
  if (FORCE_C.has(gl)) return "C";
  if (BARE_FRANCHISE.has(gl)) return "B";
  for (const pat of A_SIGNALS) if (pat.test(gl)) return "A";
  const words = gl.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return "B";
  return "C";
}
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
function subClassifyA(g) {
  const gl = g.toLowerCase().trim();
  if (new RegExp(`^hidden (mickey|disney) \\d{4}$`).test(gl)) return { tier: "A-REVIEW", reason: "bare-year Hidden Mickey umbrella" };
  if (/\bhidden (mickey|disney)\b/.test(gl) && /\d{4}/.test(gl) && /\b(wdw|dlr|dlp|hkdl|tdl|tokyo|shanghai|disneyland|walt disney world)\b/.test(gl)) {
    return { tier: "A-HIGH", reason: "Hidden Mickey wave qualified by year + park" };
  }
  if (new RegExp(`^park pack (${MONTHS}) \\d{4}$`).test(gl)) return { tier: "A-REVIEW", reason: "dated Park Pack wave" };
  if (gl.startsWith("park pack")) return { tier: "A-HIGH", reason: "named Park Pack" };
  if (gl.includes("monthly") && gl.includes("memories")) return { tier: "A-REVIEW", reason: "ongoing monthly program" };
  if (/^\w+ mouse memories( - \w+)?$/.test(gl) || gl.includes("mickey mouse memories")) return { tier: "A-REVIEW", reason: "ongoing monthly memories program" };
  if (/#\d/.test(gl) || /\bmystery (collection|set)\b/.test(gl) || /\b(booster|boxed|framed|starter|card) (set|pack)\b/.test(gl) || /\bpin set\b/.test(gl)) {
    return { tier: "A-HIGH", reason: "explicitly bounded/numbered product" };
  }
  if (/^[\w\s]+ \d{4}$/.test(gl) && gl.split(/\s+/).length <= 3) return { tier: "A-REVIEW", reason: "bare franchise/theme + year" };
  return { tier: "A-HIGH", reason: "named/dated/qualified program" };
}
function classifyGroup(g) {
  const abc = classifyGroupABC(g);
  if (abc !== "A") return { tier: abc, reason: abc === "B" ? "broad theme/category" : "ambiguous, needs review" };
  return subClassifyA(g);
}

// ── load export ──────────────────────────────────────────────────────────
function loadExportRecords(dir) {
  const records = [];
  const subDirs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  for (const sub of subDirs) {
    const subDir = path.join(dir, sub.name);
    for (const f of fs.readdirSync(subDir)) {
      if (!f.endsWith(".json")) continue;
      const fp = path.join(subDir, f);
      let d;
      try {
        d = JSON.parse(fs.readFileSync(fp, "utf8"));
      } catch (e) {
        records.push({ __file: path.relative(dir, fp), __parseError: e.message });
        continue;
      }
      records.push({ __file: path.relative(dir, fp), __raw: d });
    }
  }
  return records;
}

// ── simple async concurrency pool ───────────────────────────────────────────
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return results;
}

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  const raw = loadExportRecords(exportDirArg);
  const parseErrors = raw.filter((r) => r.__parseError);
  const records = raw.filter((r) => !r.__parseError).map((r) => r.__raw);
  console.log(`Loaded ${records.length} records (${parseErrors.length} parse errors) from ${exportDirArg}`);

  // Preload existing V2 identity map (source='collectible_pintrader') for idempotency.
  const existingExt = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("pin_external_ids")
      .select("pin_id, external_id")
      .eq("source", SOURCE)
      .range(from, from + 999);
    if (error) throw new Error(`preload pin_external_ids: ${error.message}`);
    existingExt.push(...data);
    if (data.length < 1000) break;
  }
  const existingByCtpId = new Map(existingExt.map((r) => [r.external_id, r.pin_id]));

  // Preload existing V2 pin_sets keyed by normalised_series (for idempotent set upsert).
  const existingSets = [];
  {
    const { data, error } = await supabase
      .from("pin_sets")
      .select("id, normalised_series")
      .eq("catalogue_source", SOURCE);
    if (error) throw new Error(`preload pin_sets: ${error.message}`);
    existingSets.push(...data);
  }
  const setIdByNormSeries = new Map(existingSets.map((s) => [s.normalised_series, s.id]));

  // Next pinhunt_id counter.
  let nextPinhuntNum;
  {
    const { data, error } = await supabase.from("pins").select("pinhunt_id").order("pinhunt_id", { ascending: false }).limit(1);
    if (error) throw new Error(`preload max pinhunt_id: ${error.message}`);
    const maxNum = data.length ? Number(data[0].pinhunt_id.replace("PHUK-", "")) : 0;
    nextPinhuntNum = maxNum + 1;
  }

  let importBatchId = null;
  if (APPLY) {
    const { data, error } = await supabase
      .from("import_batches")
      .insert({ filename: "collectible-pintrader-export", file_hash: "n/a", status: "running", total_rows: records.length, started_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error) throw new Error(`create import_batches row: ${error.message}`);
    importBatchId = data.id;
  }

  const log = {
    mode: APPLY ? "apply" : "dry-run",
    startedAt: new Date().toISOString(),
    totalRecords: records.length,
    parseErrors: parseErrors.length,
    importBatchId,
    pins: { inserted: 0, updated: 0 },
    externalIds: { pinpics: 0, pintradingdb: 0, collectiblePintrader: 0 },
    price: { populated: 0, needsReview: 0 },
    images: { totalSeen: 0, valid: 0, invalid: 0, uploaded: 0, reusedStorageObject: 0, skippedAlreadyImported: 0, duplicateHashGroups: 0 },
    sets: { aHigh: 0, aReview: 0, b: 0, c: 0, created: 0, existing: 0, memberships: 0, reviewQueue: {} },
    errors: [],
  };
  const setDedup = new Map(); // normSeries -> {tier, count} for the review-queue summary
  const imageHashSeenThisRun = new Map(); // hash -> storage path (for run-local storage dedup)

  async function processRecord(rec) {
    const ctpId = String(rec.id);
    const rel = rec.related_ids || {};
    const pinpicsId = rel.PINPICS != null ? String(rel.PINPICS) : null;
    const pintradingdbId = rel.PINTRADINGDB != null ? String(rel.PINTRADINGDB) : null;
    const name = clean(rec.name);
    const releaseDate = clean(rec.release_date);
    const releaseYear = yearFromDate(releaseDate);
    const editionSize = Number.isFinite(rec.edition_size) ? rec.edition_size : null;
    const priceUsd = parsePinPriceUsd(rec.price);
    const priceAmbiguous = rec.price && priceUsd == null;
    if (priceUsd != null) log.price.populated += 1;
    if (priceAmbiguous) log.price.needsReview += 1;

    const groups = Array.isArray(rec.groups) ? rec.groups.map(clean).filter(Boolean) : [];
    const groupClassifications = groups.map((g) => ({ group: g, ...classifyGroup(g) }));
    for (const gc of groupClassifications) {
      const key = gc.tier;
      log.sets[{ "A-HIGH": "aHigh", "A-REVIEW": "aReview", B: "b", C: "c" }[key]] += 1;
      if (key !== "A-HIGH") {
        log.sets.reviewQueue[gc.tier] = log.sets.reviewQueue[gc.tier] || {};
        log.sets.reviewQueue[gc.tier][gc.group] = (log.sets.reviewQueue[gc.tier][gc.group] || 0) + 1;
      }
    }

    const existingPinId = existingByCtpId.get(ctpId) ?? null;
    const pinhuntId = existingPinId ? null : `PHUK-${String(nextPinhuntNum++).padStart(8, "0")}`;

    const rawImportData = { ...rec };
    delete rawImportData.images; // images are stored separately, referenced by hash/path

    const payload = {
      title: name,
      brand: "Disney",
      collection: groups[0] ?? "Uncategorised",
      release_date: releaseDate,
      release_year: releaseYear,
      edition_type: clean(rec.release_format),
      limited_edition_size: editionSize,
      retail_price: priceUsd,
      currency: priceUsd != null ? "USD" : "GBP",
      description: clean(rec.comment),
      origin: clean(rec.origin),
      catalogue_source: SOURCE,
      catalogue_updated_at: new Date().toISOString(),
      is_legacy_v1: false,
      is_seed_record: false,
      status: "active",
      catalogue_status: "active",
      verification_status: "verified",
      is_searchable: true,
      needs_review: !!priceAmbiguous,
      import_batch_id: importBatchId,
      raw_import_data: rawImportData,
      updated_at: new Date().toISOString(),
    };
    if (pinhuntId) {
      payload.pinhunt_id = pinhuntId;
      payload.created_at = new Date().toISOString();
    }

    let pinId = existingPinId;
    if (APPLY) {
      if (existingPinId) {
        const { error } = await supabase.from("pins").update(payload).eq("id", existingPinId);
        if (error) { log.errors.push(`update pin ctpId=${ctpId}: ${error.message}`); return; }
        log.pins.updated += 1;
      } else {
        const { data, error } = await supabase.from("pins").insert(payload).select("id").single();
        if (error) { log.errors.push(`insert pin ctpId=${ctpId}: ${error.message}`); return; }
        pinId = data.id;
        log.pins.inserted += 1;
      }

      const extRows = [{ pin_id: pinId, source: SOURCE, external_id: ctpId }];
      if (pinpicsId) extRows.push({ pin_id: pinId, source: "pinpics", external_id: pinpicsId });
      if (pintradingdbId) extRows.push({ pin_id: pinId, source: "pintradingdb", external_id: pintradingdbId });
      const { error: extErr } = await supabase.from("pin_external_ids").upsert(extRows, { onConflict: "pin_id,source" });
      if (extErr) log.errors.push(`external_ids pin=${pinId}: ${extErr.message}`);
      else {
        log.externalIds.collectiblePintrader += 1;
        if (pinpicsId) log.externalIds.pinpics += 1;
        if (pintradingdbId) log.externalIds.pintradingdb += 1;
      }

      // ── Images ──
      const imgs = Array.isArray(rec.images) ? rec.images : [];
      for (let idx = 0; idx < imgs.length; idx++) {
        log.images.totalSeen += 1;
        let buf;
        try { buf = Buffer.from(imgs[idx]?.data ?? "", "base64"); } catch { buf = Buffer.alloc(0); }
        if (!isValidJpeg(buf)) { log.images.invalid += 1; continue; }
        log.images.valid += 1;
        const hash = sha256Buf(buf);

        const { data: existingImg } = await supabase
          .from("pin_images").select("id").eq("pin_id", pinId).eq("source", SOURCE).eq("content_hash", hash).maybeSingle();
        if (existingImg) { log.images.skippedAlreadyImported += 1; continue; }

        let storagePath = imageHashSeenThisRun.get(hash);
        if (!storagePath) {
          const { data: reuseRow } = await supabase
            .from("pin_images").select("image_url").eq("source", SOURCE).eq("content_hash", hash).limit(1).maybeSingle();
          if (reuseRow) {
            storagePath = reuseRow.image_url;
            log.images.reusedStorageObject += 1;
          } else {
            const objectPath = `collectible-pintrader/${ctpId}/${String(idx + 1).padStart(2, "0")}.jpg`;
            const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, buf, { contentType: "image/jpeg", upsert: true });
            if (upErr) { log.errors.push(`upload ctpId=${ctpId} idx=${idx}: ${upErr.message}`); continue; }
            const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
            storagePath = pub.publicUrl;
            log.images.uploaded += 1;
          }
          imageHashSeenThisRun.set(hash, storagePath);
        }

        const { error: imgErr } = await supabase.from("pin_images").insert({
          pin_id: pinId,
          image_url: storagePath,
          image_type: "reference",
          is_primary: idx === 0,
          source: SOURCE,
          source_record_id: ctpId,
          content_hash: hash,
          public_display_allowed: true,
          attribution_required: true,
        });
        if (imgErr) log.errors.push(`pin_images insert ctpId=${ctpId} idx=${idx}: ${imgErr.message}`);
      }
      if (imgs.length && !existingPinId) {
        const first = imgs[0];
        let buf; try { buf = Buffer.from(first?.data ?? "", "base64"); } catch { buf = Buffer.alloc(0); }
        if (isValidJpeg(buf)) {
          const storagePath = imageHashSeenThisRun.get(sha256Buf(buf));
          if (storagePath) await supabase.from("pins").update({ image_url: storagePath }).eq("id", pinId);
        }
      }

      // ── Sets (A-HIGH only) ──
      for (const gc of groupClassifications) {
        if (gc.tier !== "A-HIGH") continue;
        const normSeries = `Collectible PinTrader | ${normText(gc.group)}`;
        let setId = setIdByNormSeries.get(normSeries);
        if (!setId) {
          const { data: setRow, error: setErr } = await supabase
            .from("pin_sets")
            .upsert(
              { normalised_series: normSeries, set_name: gc.group, catalogue_source: SOURCE, original_source_name: gc.group, is_legacy_v1: false, released_pin_count: 0 },
              { onConflict: "normalised_series" }
            )
            .select("id")
            .single();
          if (setErr) { log.errors.push(`set upsert "${gc.group}": ${setErr.message}`); continue; }
          setId = setRow.id;
          setIdByNormSeries.set(normSeries, setId);
          log.sets.created += 1;
        }
        const { error: memErr } = await supabase.from("pin_set_memberships").upsert({ pin_id: pinId, set_id: setId }, { onConflict: "pin_id,set_id" });
        if (memErr) log.errors.push(`membership pin=${pinId} set=${setId}: ${memErr.message}`);
        else log.sets.memberships += 1;
      }
    } else {
      // Dry-run: still validate/hash images for accurate counts, no writes.
      const imgs = Array.isArray(rec.images) ? rec.images : [];
      for (const im of imgs) {
        log.images.totalSeen += 1;
        let buf; try { buf = Buffer.from(im?.data ?? "", "base64"); } catch { buf = Buffer.alloc(0); }
        if (!isValidJpeg(buf)) { log.images.invalid += 1; continue; }
        log.images.valid += 1;
        const hash = sha256Buf(buf);
        if (imageHashSeenThisRun.has(hash)) log.images.reusedStorageObject += 1;
        else imageHashSeenThisRun.set(hash, true);
      }
      if (existingPinId) log.pins.updated += 1; else log.pins.inserted += 1;
      log.externalIds.collectiblePintrader += 1;
      if (pinpicsId) log.externalIds.pinpics += 1;
      if (pintradingdbId) log.externalIds.pintradingdb += 1;
      for (const gc of groupClassifications) {
        if (gc.tier !== "A-HIGH") continue;
        const normSeries = `Collectible PinTrader | ${normText(gc.group)}`;
        if (!setDedup.has(normSeries)) { setDedup.set(normSeries, gc.group); log.sets.created += 1; }
        log.sets.memberships += 1;
      }
    }
  }

  await runPool(records, APPLY ? 6 : 12, processRecord);

  if (APPLY && importBatchId) {
    await supabase.from("import_batches").update({
      status: log.errors.length ? "failed" : "completed",
      completed_at: new Date().toISOString(),
      inserted_rows: log.pins.inserted,
      updated_rows: log.pins.updated,
      error_rows: log.errors.length,
    }).eq("id", importBatchId);
  }

  log.finishedAt = new Date().toISOString();
  const distinctReviewGroups = {};
  for (const tier of Object.keys(log.sets.reviewQueue)) distinctReviewGroups[tier] = Object.keys(log.sets.reviewQueue[tier]).length;

  const summary = {
    mode: log.mode,
    totalRecords: log.totalRecords,
    parseErrors: log.parseErrors,
    pins: log.pins,
    externalIds: log.externalIds,
    price: log.price,
    images: log.images,
    setMemberships: { aHigh: log.sets.aHigh, aReview: log.sets.aReview, b: log.sets.b, c: log.sets.c },
    setsAutoCreated: log.sets.created,
    setMembershipRowsWritten: log.sets.memberships,
    distinctReviewGroupsByTier: distinctReviewGroups,
    errors: log.errors.slice(0, 30),
    errorCount: log.errors.length,
  };
  console.log(JSON.stringify(summary, null, 2));

  const logPath = path.join(exportDirArg, `import-log-${log.mode}-${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log("Full log written to", logPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
