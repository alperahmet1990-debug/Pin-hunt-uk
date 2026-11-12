// Catalogue gap report: pure comparison logic (no network, no database, no file access).
// Shared by compare.mjs (terminal) and compare.html (browser, built by build-page.mjs).
// Inputs are the files produced by supabase/verify/catalogue-gap/*.sql.
// See docs/catalogue-sync/GAP-REPORT.md.


// ── loading ─────────────────────────────────────────────────────────────────

/** RFC 4180 CSV → array of objects keyed by the header row. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] === undefined || r[i] === "" ? null : r[i]])));
}

/**
 * Accepts the summary / work result however it was saved from the SQL editor:
 * the raw JSON cell, "Copy as JSON" ([{ "summary": {...} }]), or a one-cell CSV.
 */
export function parseJsonExport(text) {
  const t = text.trim().replace(/^﻿/, "");
  let v;
  try { v = JSON.parse(t); } catch {
    const csv = parseCsv(t);
    if (csv.length !== 1) throw new Error("not JSON, and not a one-cell CSV");
    v = JSON.parse(Object.values(csv[0])[0]);
  }
  if (Array.isArray(v) && v.length === 1) v = v[0];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1 && (keys[0] === "summary" || keys[0] === "work")) v = v[keys[0]];
    if (typeof v === "string") v = JSON.parse(v);
  }
  return v;
}

/** Which of the five queries a downloaded file came from, by its contents (names don't matter). */
export function identifyExport(text) {
  const t = text.trim().replace(/^﻿/, "");
  const firstLine = t.split(/\r?\n/, 1)[0];
  if (/^"?summary"?$/.test(firstLine) || /^\[?\s*\{\s*"summary"/.test(t)) return "summary";
  if (/^"?work"?$/.test(firstLine) || /^\[?\s*\{\s*"work"/.test(t)) return "work";
  if (t.startsWith("{")) {
    try { const v = JSON.parse(t); if (v.migration_markers) return "summary"; if ("pin_submissions" in v) return "work"; } catch { /* not JSON */ }
  }
  const cols = firstLine.split(",").map((c) => c.replace(/"/g, "").trim());
  if (cols[0] === "part" && cols.includes("payload")) return "combined";
  if (cols.includes("pins_json") || (cols.includes("content_md5") && cols.includes("pinhunt_id"))) return "pins";
  if (cols.includes("images_json") || cols.includes("is_pin_front_photo")) return "images";
  if (cols.includes("files_json") || (cols.includes("bucket_id") && cols.includes("etag"))) return "storage";
  return null;
}

/**
 * Builds one project's data from its downloaded files: { fileName: text, … }.
 * Files are recognised by their contents, so the SQL editor's own file names
 * are fine. A query saved in several parts (large results) is merged; overlaps
 * are harmless.
 */
export function sideFromFiles(files, label = "folder") {
  // Gather every piece first: from the all-in-one download and/or the five separate ones.
  const got = { summary: [], work: [], pins: [], images: [], storage: [] };
  const packedCol = { pins: "pins_json", images: "images_json", storage: "files_json" };
  const toStrings = (x) => Object.fromEntries(Object.entries(x).map(([k, v]) =>
    [k, v === null || typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v)]));
  const kinds = {};
  const unknown = [];
  for (const [name, text] of Object.entries(files)) {
    const kind = identifyExport(text);
    if (!kind) { unknown.push(name); continue; }
    kinds[name] = kind;
    if (kind === "combined") {
      for (const r of parseCsv(text)) {
        const part = r.part === "files" ? "storage" : r.part;
        if (part === "summary" || part === "work") got[part].push({ name, text: r.payload });
        else if (got[part]) got[part].push(...JSON.parse(r.payload ?? "[]").map(toStrings));
      }
    } else if (kind === "summary" || kind === "work") {
      got[kind].push({ name, text });
    } else {
      for (const r of parseCsv(text)) {
        if (r[packedCol[kind]]) got[kind].push(...JSON.parse(r[packedCol[kind]]).map(toStrings));
        else got[kind].push(r);
      }
    }
  }
  const problem = (msg) => { throw new Error(`${label}: ${msg}`); };
  if (got.summary.length !== 1) problem(got.summary.length ? `more than one summary (${got.summary.map((x) => x.name).join(", ")}); remove the extra file` : "no summary found (the all-in-one query, or query 1)");
  if (got.work.length > 1) problem(`more than one work-in-progress result (${got.work.map((x) => x.name).join(", ")}); remove the extra file`);
  const summary = parseJsonExport(got.summary[0].text);
  if (!got.pins.length && Number(summary.pins?.total ?? 0) > 0) problem("no pins found (the all-in-one query, or query 2)");
  const dedupe = (rows) => [...new Map(rows.map((r) => [r.id ?? `${r.bucket_id}/${r.name}`, r])).values()];
  const hasSeparate = (k) => Object.values(kinds).includes(k);
  const hasCombined = Object.values(kinds).includes("combined");
  return {
    summary,
    pins: dedupe(got.pins),
    images: dedupe(got.images),
    storage: hasCombined || hasSeparate("storage") ? dedupe(got.storage) : null,
    work: got.work.length ? parseJsonExport(got.work[0].text) : null,
    files: kinds,
    unknown,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

const REF_RE = /^[a-z0-9]{20}$/;
export const isRef = (r) => REF_RE.test(String(r ?? ""));

/** "https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>" → parts. */
export function parseImageUrl(url) {
  if (!url) return null;
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/.exec(url);
  if (m) return { ref: m[1], bucket: m[2], path: decodeURIComponent(m[3]) };
  const h = /^https?:\/\/([^/]+)/.exec(url);
  return { ref: null, host: h ? h[1] : null, bucket: null, path: null };
}

export const normText = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
export const nameKey = (p) => `${normText(p.title)}|${normText(p.normalised_series || p.collection)}|${p.release_year ?? ""}`;

const isTrue = (v) => v === true || v === "true" || v === "t";
const isPnp = (src) => ["pinandpop", "pinpop"].includes(String(src ?? "").toLowerCase().replace(/[^a-z]/g, ""));
const emptyish = (v) => v === null || v === undefined || v === false || v === "" ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) || (Array.isArray(v) && v.length === 0);

/** Field-by-field difference of two scrubbed `content` objects. */
export function fieldDiff(a, b) {
  const out = [];
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const inA = a && k in a;
    const inB = b && k in b;
    // A column that only one project has is a schema difference, not a data
    // difference, unless the side that has it holds a real value.
    if (!inA && emptyish(b[k])) continue;
    if (!inB && emptyish(a[k])) continue;
    if (JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b?.[k] ?? null)) {
      out.push({ field: k, staging: a?.[k] ?? null, production: b?.[k] ?? null, schemaOnly: !inA || !inB });
    }
  }
  return out.sort((x, y) => x.field.localeCompare(y.field));
}

/**
 * Same rule as clean-catalogue-images publish: the licence must be confirmed
 * (filled in, not pending, not no-derivatives) for edited images; every image
 * needs public display + storage allowed in PRODUCTION's catalogue_sources.
 */
export function rightsCheck(source, sources, { edited = false } = {}) {
  if (isPnp(source)) return { ok: false, reason: "Pin & Pop image: reference-only in the current rules; never promoted" };
  if (!source) return { ok: false, reason: "no source recorded: provenance unknown" };
  const row = sources?.find((s) => s.id === source);
  if (!row) return { ok: false, reason: `source "${source}" isn't in production's catalogue_sources` };
  if (!isTrue(row.public_display_allowed)) return { ok: false, reason: `source "${source}": public display not allowed` };
  if (!isTrue(row.storage_allowed)) return { ok: false, reason: `source "${source}": storage not allowed` };
  if (edited) {
    const lic = String(row.exact_license_variant ?? "").toLowerCase();
    if (!lic) return { ok: false, reason: `source "${source}": licence not recorded (needed for edited photos)` };
    if (lic.includes("pending")) return { ok: false, reason: `source "${source}": licence still pending (needed for edited photos)` };
    if (/\bnd\b|no.?deriv/.test(lic)) return { ok: false, reason: `source "${source}": licence forbids edits` };
  }
  return { ok: true, reason: "" };
}

const looksEdited = (img) => /(^|\/)cleaned\//.test(parseImageUrl(img.image_url)?.path ?? "") ||
  ["pinhunt_board_scan", "pinhunt_bulk_upload"].includes(img.source);

// ── comparison ──────────────────────────────────────────────────────────────

export function compare(staging, production, { stagingRef, productionRef }) {
  const checks = [];
  const review = [];
  const add = (category, severity, s, p, detail, action) => review.push({
    category, severity,
    staging_pinhunt_id: s?.pinhunt_id ?? null, staging_id: s?.id ?? null, staging_title: s?.title ?? null,
    production_pinhunt_id: p?.pinhunt_id ?? null, production_id: p?.id ?? null, production_title: p?.title ?? null,
    detail, suggested_action: action,
  });

  // 0. Integrity of the exports
  for (const [label, side] of [["staging", staging], ["production", production]]) {
    const env = side.summary.environment;
    if (env && env !== label) checks.push({ level: "error", text: `The ${label} folder says it came from "${env}". The files may be swapped.` });
    if (!env) checks.push({ level: "warn", text: `${label}: no project marker (pinhunt_environment(), 073_RUNBOOK.md), so the folder can't prove which project it came from. Check you ran it in the right project.` });
    const total = Number(side.summary.pins?.total ?? NaN);
    if (total !== side.pins.length) checks.push({ level: "error", text: `${label}: 2_pins.csv has ${side.pins.length} rows but the project has ${total} pins. The export was cut short; see "Large results" in GAP-REPORT.md.` });
    const imgTotal = (side.summary.pin_images ?? []).reduce((n, r) => n + Number(r.count), 0);
    if (imgTotal !== side.images.length) checks.push({ level: "error", text: `${label}: 3_images.csv has ${side.images.length} rows but the project has ${imgTotal}. The export was cut short.` });
  }
  if (stagingRef === productionRef) checks.push({ level: "error", text: "The staging and production refs are the same." });

  const prodById = new Map(production.pins.map((p) => [p.id, p]));
  const prodByPhid = new Map(production.pins.map((p) => [p.pinhunt_id, p]));
  const stagingById = new Map(staging.pins.map((p) => [p.id, p]));
  const prodByName = new Map();
  for (const p of production.pins) {
    const k = nameKey(p);
    if (!prodByName.has(k)) prodByName.set(k, []);
    prodByName.get(k).push(p);
  }
  const prodByExt = new Map();
  for (const p of production.pins) for (const e of String(p.external_ids ?? "").split(";").filter(Boolean)) {
    if (!prodByExt.has(e)) prodByExt.set(e, []);
    prodByExt.get(e).push(p);
  }
  const parse = (p) => { try { return p.content ? JSON.parse(p.content) : null; } catch { return null; } };

  // 1. Pins
  const pinClass = new Map(); // staging id → { kind, prod }
  const pins = { same: 0, changed: [], collisions: [], idMismatch: [], stagingOnly: [], prodOnlyVisible: [], prodOnlyOther: 0 };
  for (const s of staging.pins) {
    const p = prodById.get(s.id);
    if (p && p.pinhunt_id === s.pinhunt_id) {
      if (s.content_md5 === p.content_md5) { pins.same++; pinClass.set(s.id, { kind: "same", prod: p }); continue; }
      const sc = parse(s);
      const pc = parse(p);
      const diffs = sc && pc ? fieldDiff(sc, pc) : null;
      const real = diffs ? diffs.filter((d) => !d.schemaOnly || !emptyish(d.staging)) : null;
      if (diffs && real.length === 0) { pins.same++; pinClass.set(s.id, { kind: "same", prod: p }); continue; }
      pins.changed.push({ s, p, diffs: real });
      pinClass.set(s.id, { kind: "changed", prod: p });
      add("field_change", "review", s, p,
        real ? real.map((d) => `${d.field}: ${JSON.stringify(d.production)} -> ${JSON.stringify(d.staging)}`).join("; ") : "fields differ (archived pin: details not exported)",
        "Approve or reject each field change before applying it in production");
      continue;
    }
    if (p) {
      pins.idMismatch.push({ s, p });
      pinClass.set(s.id, { kind: "id_mismatch", prod: p });
      add("id_mismatch", "review", s, p, `same internal id, but PinHunt ID ${p.pinhunt_id} in production and ${s.pinhunt_id} in staging`, "Investigate; do not promote until explained");
      continue;
    }
    const q = prodByPhid.get(s.pinhunt_id);
    if (q) {
      pins.collisions.push({ s, p: q });
      pinClass.set(s.id, { kind: "collision", prod: q });
      add("id_collision", "review", s, q,
        `PinHunt ID ${s.pinhunt_id} is a different record in each project (production: "${q.title}" / ${q.collection ?? ""}; staging: "${s.title}" / ${s.collection ?? ""})`,
        "Decide whether these are the same pin. If not, the staging pin needs a new production PinHunt ID");
      continue;
    }
    const byExt = String(s.external_ids ?? "").split(";").filter(Boolean).flatMap((e) => (prodByExt.get(e) ?? []).map((m) => ({ m, why: `shares external id ${e}` })));
    const byName = (prodByName.get(nameKey(s)) ?? []).map((m) => ({ m, why: "same title, series and year" }));
    const possible = [...new Map([...byExt, ...byName].map((x) => [x.m.id, x])).values()];
    pins.stagingOnly.push({ s, possible });
    pinClass.set(s.id, { kind: possible.length ? "staging_only_possible_match" : "staging_only", prod: null });
    if (possible.length) {
      for (const { m, why } of possible) add("possible_duplicate", "review", s, m, `Only in staging, but ${why} with a production pin`, "Decide: same pin (merge any changes into the production pin) or a different pin (add as new)");
    } else {
      add("new_pin", "review", s, null, `Only in staging (${s.verification_status ?? "?"}${isTrue(s.is_searchable) ? ", searchable" : ""}). No production pin shares its ID, external ids, or title + series + year`, "Confirm it's a real, distinct pin; production assigns its own PinHunt ID");
    }
  }
  for (const p of production.pins) {
    if (stagingById.has(p.id)) continue;
    if (p.verification_status === "verified" && isTrue(p.is_searchable) && p.catalogue_status !== "archived") pins.prodOnlyVisible.push(p);
    else pins.prodOnlyOther++;
  }

  // 2. Photos
  const sources = production.summary.catalogue_sources ?? [];
  const prodImgIds = new Set(production.images.map((i) => i.id));
  const prodHashes = new Set(production.images.map((i) => i.content_hash).filter(Boolean));
  const prodUrls = new Set([...production.images.map((i) => i.image_url), ...production.pins.flatMap((p) => [p.image_url, p.back_image_url])].filter(Boolean));
  const photos = { dependsOnStaging: [], brokenProd: [], ready: [], blocked: [], needsPinDecision: [], alreadyThere: 0, pendingInStaging: [], untracked: [] };

  for (const p of production.pins) for (const col of ["image_url", "back_image_url"]) {
    const u = parseImageUrl(p[col]);
    if (u?.ref === stagingRef) {
      photos.dependsOnStaging.push({ p, col, url: p[col] });
      add("production_uses_staging_file", "critical", null, p, `production ${col} is a file in STAGING storage (${u.bucket}/${u.path})`, "Copy the file into production storage and repoint the pin before anything happens to staging");
    }
  }
  for (const i of production.images) {
    const u = parseImageUrl(i.image_url);
    if (u?.ref === stagingRef && !production.pins.some((p) => p.image_url === i.image_url || p.back_image_url === i.image_url)) {
      photos.dependsOnStaging.push({ p: { pinhunt_id: i.pinhunt_id, id: i.pin_id }, col: `pin_images ${i.id}`, url: i.image_url });
      add("production_uses_staging_file", "critical", null, { pinhunt_id: i.pinhunt_id, id: i.pin_id }, `production pin_images row ${i.id} points at STAGING storage`, "Copy the file into production storage and repoint the record");
    }
  }
  if (production.storage) {
    const have = new Set(production.storage.map((o) => `${o.bucket_id}/${o.name}`));
    for (const p of production.pins) for (const col of ["image_url", "back_image_url"]) {
      const u = parseImageUrl(p[col]);
      if (u?.ref === productionRef && !have.has(`${u.bucket}/${u.path}`)) {
        photos.brokenProd.push({ p, col });
        add("production_missing_file", "review", null, p, `production ${col} points at ${u.bucket}/${u.path}, which isn't in production storage`, "Find the file or clear the link");
      }
    }
  }

  for (const i of staging.images) {
    if (isPnp(i.source)) continue;
    const u = parseImageUrl(i.image_url);
    const s = stagingById.get(i.pin_id);
    if (i.status === "pending") {
      photos.pendingInStaging.push(i);
      add("photo_pending_in_staging", "review", s, null, `photo ${i.id} awaits review in staging (${i.source ?? "no source"})`, "Review it (in production once the tools move there; it would need re-submitting or promoting)");
      continue;
    }
    if (i.status !== "approved") continue;
    if (u?.ref !== stagingRef) continue; // already hosted elsewhere (usually production's bucket via the copy)
    if (prodImgIds.has(i.id) || (i.content_hash && prodHashes.has(i.content_hash)) || prodUrls.has(i.image_url)) { photos.alreadyThere++; continue; }
    const cls = pinClass.get(i.pin_id);
    const target = cls?.prod && (cls.kind === "same" || cls.kind === "changed") ? cls.prod : null;
    const rights = rightsCheck(i.source, sources, { edited: looksEdited(i) });
    const shownInStaging = isTrue(i.is_pin_front_photo) || isTrue(i.is_pin_back_photo);
    const replaces = target && (isTrue(i.is_pin_back_photo) ? target.back_image_url : target.image_url);
    const item = { i, s, target, rights, shownInStaging, replaces };
    if (!target) {
      photos.needsPinDecision.push(item);
      add("photo_needs_pin_decision", "review", s, cls?.prod ?? null, `approved staging photo ${i.id} belongs to a pin that isn't matched to production (${cls?.kind ?? "pin not exported"})`, "Resolve the pin first, then the photo");
    } else if (!rights.ok) {
      photos.blocked.push(item);
      add("photo_rights_blocked", "review", s, target, `approved staging photo ${i.id}: ${rights.reason}`, "Hold until the rights record allows it");
    } else {
      photos.ready.push(item);
      add(replaces ? "photo_would_replace" : "photo_ready", replaces ? "review" : "info", s, target,
        `approved staging photo ${i.id} (${i.source})${shownInStaging ? ", shown in staging" : ""}${replaces ? `; production already shows ${parseImageUrl(replaces)?.ref === productionRef ? "its own photo" : "another photo"}` : "; production has no photo"}`,
        replaces ? "Choose: keep production's photo or replace it" : "Copy file to production and set it as the pin photo");
    }
  }
  const trackedUrls = new Set(staging.images.map((i) => i.image_url));
  for (const s of staging.pins) for (const col of ["image_url", "back_image_url"]) {
    const u = parseImageUrl(s[col]);
    if (u?.ref === stagingRef && !trackedUrls.has(s[col])) {
      photos.untracked.push({ s, col });
      add("photo_without_record", "review", s, pinClass.get(s.id)?.prod ?? null, `staging ${col} is a staging file with no pin_images record, so its source and rights are unknown`, "Find its origin before promoting; otherwise leave it");
    }
  }

  // 3. Work in progress (staging)
  const work = summariseWork(staging.work, staging.pins, pinClass, prodByPhid);

  return { checks, pins, photos, work, review };
}

function summariseWork(work, stagingPins, pinClass, prodByPhid) {
  if (!work) return null;
  const byPhid = new Map(stagingPins.map((p) => [p.pinhunt_id, p]));
  const targetKind = (phid) => {
    if (!phid) return "no pin chosen";
    const s = byPhid.get(phid);
    if (!s) return prodByPhid.has(phid) ? "pin only in production" : "pin not found";
    const k = pinClass.get(s.id)?.kind ?? "unknown";
    return { same: "same pin in both", changed: "same pin in both (fields differ)", collision: "ID collision", id_mismatch: "ID mismatch",
      staging_only: "pin only in staging", staging_only_possible_match: "pin only in staging (possible duplicate)" }[k] ?? k;
  };
  const tally = (items, keyFn) => items.reduce((m, x) => { const k = keyFn(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});

  const out = {};
  const subs = work.pin_submissions;
  if (subs) {
    out.submissions = {
      drafts: subs.draft_count,
      byStatus: tally(subs.items, (x) => x.status),
      approvedTargets: tally(subs.items.filter((x) => x.status === "approved"), (x) => targetKind(x.approved_pinhunt_id)),
    };
  }
  const bs = work.board_scans;
  if (bs) {
    const stage = (i) => i.decision === "excluded" ? "excluded"
      : i.pin_image_id ? "published (photo approved)"
      : i.image_review === "rejected" ? "photo rejected"
      : i.has_cleaned_photo && (i.decision === "confirmed" || i.decision === "corrected") ? "match confirmed, cleaned photo awaiting approval"
      : i.decision === "confirmed" || i.decision === "corrected" ? "match confirmed, not cleaned"
      : i.match_status === "suggested" ? "match suggested, not reviewed"
      : i.match_status;
    const keep = bs.items.filter((i) => i.decision !== "excluded");
    out.boardScans = {
      boards: bs.boards.length,
      boardsWithoutPublicDisplay: bs.boards.filter((b) => !b.permission_public_display).length,
      items: bs.items.length,
      byStage: tally(bs.items, stage),
      confirmedTargets: tally(keep.filter((i) => i.decision === "confirmed" || i.decision === "corrected"), (i) => targetKind(i.decided_pinhunt_id)),
    };
  }
  const bi = work.bulk_images;
  if (bi) {
    out.bulkImages = {
      batches: bi.batches.length,
      batchesWithoutPublicDisplay: bi.batches.filter((b) => !b.permission_public_display).length,
      items: bi.items.length,
      byStatus: tally(bi.items, (i) => i.status),
      confirmedTargets: tally(bi.items.filter((i) => i.confirmed), (i) => targetKind(i.matched_pinhunt_id)),
      replacedExistingPhoto: bi.items.filter((i) => i.replaced_image_url).length,
    };
  }
  if (work.catalogue_candidates) out.candidates = work.catalogue_candidates;
  return out;
}

// ── output ──────────────────────────────────────────────────────────────────

const esc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const table = (head, rows) => rows.length ? [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n") : "_None._";
const kv = (o) => o && Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k}: **${v}**`).join(" · ") : "none";
const LIMIT = 40;
const capped = (arr) => arr.slice(0, LIMIT);
const more = (arr) => arr.length > LIMIT ? `\n\n_+${arr.length - LIMIT} more in review.csv._` : "";

export function renderMarkdown(r, { staging, production }) {
  const L = [];
  const crit = r.review.filter((x) => x.severity === "critical").length;
  const decisions = r.review.filter((x) => x.severity === "review").length;
  L.push("# Waiting for production: catalogue gap report", "");
  L.push(`Staging export: ${staging.summary.generated_at} · Production export: ${production.summary.generated_at}. A snapshot: catalogue work may have continued since.`, "");
  L.push("Nothing here was matched automatically. Every \"possible\" item is for a person to decide.", "");
  if (r.checks.length) { L.push("## Export checks", ""); for (const c of r.checks) L.push(`- **${c.level.toUpperCase()}**: ${c.text}`); L.push(""); }

  L.push("## At a glance", "");
  L.push(table(["", "Count"], [
    ["Production photos stored in STAGING (critical)", r.photos.dependsOnStaging.length],
    ["Pins only in staging, no likely production match", r.pins.stagingOnly.filter((x) => !x.possible.length).length],
    ["Pins only in staging, possible duplicate of a production pin", r.pins.stagingOnly.filter((x) => x.possible.length).length],
    ["PinHunt ID collisions (same ID, different record)", r.pins.collisions.length],
    ["Same pin in both, fields differ", r.pins.changed.length],
    ["Approved staging photos ready (pin matched, rights OK)", r.photos.ready.length],
    ["...of which would replace a production photo", r.photos.ready.filter((x) => x.replaces).length],
    ["Approved staging photos blocked by rights", r.photos.blocked.length],
    ["Approved staging photos whose pin needs a decision first", r.photos.needsPinDecision.length],
    ["Photos pending review in staging", r.photos.pendingInStaging.length],
    ["Staging pin photos with no provenance record", r.photos.untracked.length],
    ["Production links to files missing from production storage", r.photos.brokenProd.length],
    ["Same pin in both, identical", r.pins.same],
    ["Visible production pins missing from staging (staging copy is stale)", r.pins.prodOnlyVisible.length],
    ["Items needing a decision (total)", decisions],
    ["Critical items", crit],
  ]), "");

  L.push("## Production depends on staging storage", "");
  L.push(table(["Production pin", "Where", "File"], capped(r.photos.dependsOnStaging).map((x) => [x.p.pinhunt_id, x.col, parseImageUrl(x.url)?.path])) + more(r.photos.dependsOnStaging), "");

  L.push("## Pins only in staging", "");
  L.push(table(["Staging ID", "Title", "Series", "Year", "Status", "Possible production match"],
    capped(r.pins.stagingOnly).map(({ s, possible }) => [s.pinhunt_id, s.title, s.normalised_series || s.collection, s.release_year, s.verification_status,
      possible.map((x) => `${x.m.pinhunt_id} "${x.m.title}" (${x.why})`).join("; ") || "none"])) + more(r.pins.stagingOnly), "");

  L.push("## PinHunt ID collisions", "");
  L.push(table(["PinHunt ID", "Staging record", "Production record"],
    capped(r.pins.collisions).map(({ s, p }) => [s.pinhunt_id, `${s.title} / ${s.collection ?? ""}`, `${p.title} / ${p.collection ?? ""}`])) + more(r.pins.collisions), "");

  L.push("## Field differences on the same pin", "");
  L.push(table(["PinHunt ID", "Title", "Changes (production -> staging)"],
    capped(r.pins.changed).map(({ s, diffs }) => [s.pinhunt_id, s.title, diffs ? diffs.map((d) => `${d.field}: ${JSON.stringify(d.production)} -> ${JSON.stringify(d.staging)}`).join("; ") : "archived: not exported"])) + more(r.pins.changed), "");

  L.push("## Approved staging photos", "");
  const photoRows = [...r.photos.ready.map((x) => ["ready", x]), ...r.photos.blocked.map((x) => ["blocked", x]), ...r.photos.needsPinDecision.map((x) => ["pin decision first", x])];
  L.push(table(["State", "Staging pin", "Photo id", "Source", "Production pin", "Production photo now", "Note"],
    capped(photoRows).map(([st, x]) => [st, x.s?.pinhunt_id, x.i.id, x.i.source, x.target?.pinhunt_id ?? "", x.target ? (x.replaces ? "has one" : "none") : "", x.rights.ok ? "" : x.rights.reason])) + more(photoRows), "");

  if (r.work) {
    L.push("## Work in progress in staging", "");
    if (r.work.submissions) L.push(`- **New-pin submissions:** drafts ${r.work.submissions.drafts}; ${kv(r.work.submissions.byStatus)}. Approved ones point at: ${kv(r.work.submissions.approvedTargets)}.`);
    if (r.work.boardScans) {
      const b = r.work.boardScans;
      L.push(`- **Board scanning:** ${b.boards} board(s), ${b.items} pin crop(s)${b.boardsWithoutPublicDisplay ? `, ${b.boardsWithoutPublicDisplay} board(s) without public-display permission` : ""}. ${kv(b.byStage)}. Confirmed matches point at: ${kv(b.confirmedTargets)}.`);
    } else L.push("- **Board scanning:** not set up in staging (migration 075 not applied).");
    if (r.work.bulkImages) {
      const b = r.work.bulkImages;
      L.push(`- **Bulk image matcher:** ${b.batches} batch(es), ${b.items} photo(s)${b.batchesWithoutPublicDisplay ? `, ${b.batchesWithoutPublicDisplay} batch(es) without public-display permission` : ""}. ${kv(b.byStatus)}. Confirmed matches point at: ${kv(b.confirmedTargets)}. Replaced an existing photo: ${b.replacedExistingPhoto}.`);
    } else L.push("- **Bulk image matcher:** not set up in staging (migration 076 not applied).");
    if (r.work.candidates) L.push(`- **Research candidates:** ${kv(r.work.candidates.by_status)}.`);
    L.push("");
  }

  L.push("## Pin & Pop exposure check", "");
  const pnpRows = (side) => (side.summary.pin_images ?? []).filter((r) => isPnp(r.source)).reduce((n, r) => n + Number(r.count), 0);
  const pnpHosted = (side) => Object.entries(side.summary.pin_image_hosts ?? {}).filter(([h]) => /pin-?(and|&|n)?-?pop/i.test(h)).reduce((n, [, c]) => n + Number(c), 0);
  const activity = (side) => {
    const w = side.work;
    if (!w) return "not exported";
    const b = w.board_scans ? `${w.board_scans.items.length} board-scan crop(s)` : "board scanning not installed";
    const k = w.bulk_images ? `${w.bulk_images.items.length} bulk photo(s), ${w.bulk_images.items.filter((i) => isTrue(i.match_verified)).length} confirmed by comparing with a reference photo (PinHunt's own or Pin & Pop's)` : "bulk matcher not installed";
    return `${b}; ${k}`;
  };
  L.push(table(["", "Staging", "Production"], [
    ["Pin & Pop reference image records (the only Pin & Pop images the matching tools can use)", pnpRows(staging), pnpRows(production)],
    ["Pin photos (front or back) hosted by Pin & Pop", pnpHosted(staging), pnpHosted(production)],
    ["Matching-tool activity", activity(staging), activity(production)],
  ]));
  L.push("", "Board scanning and the bulk matcher can only send a Pin & Pop image to the AI service when reference records exist. A count of 0 means none could have been sent from records that exist now; it can't show records that were added and later deleted.", "");

  L.push("## Migrations detected", "");
  const ms = staging.summary.migration_markers ?? {};
  const mp = production.summary.migration_markers ?? {};
  const keys = [...new Set([...Object.keys(ms), ...Object.keys(mp)])].sort();
  const yes = (v) => (v === true ? "yes" : v === false ? "**no**" : "?");
  L.push(table(["Migration", "Staging", "Production", ""], keys.map((k) => [k === "073_marker" ? "073 project marker" : k, yes(ms[k]), yes(mp[k]), ms[k] !== mp[k] ? "differs" : ""])));
  L.push("", "056, 061, 063, 064 and 074 only change existing functions or permissions, so they can't be detected here. Check them with their `supabase/verify/NNN_verify.sql` scripts.", "");

  L.push("## Project summaries", "");
  for (const [label, side] of [["Staging", staging], ["Production", production]]) {
    const s = side.summary;
    L.push(`**${label}:** ${s.pins?.total} pins (${kv(s.pins?.by_verification_status)}); ${s.pins?.with_image_url} with a photo. Photo hosts: ${kv(s.pin_image_hosts)}. Buckets: ${(s.storage_buckets ?? []).map((b) => `${b.bucket} ${b.objects} files`).join(", ")}.`, "");
  }
  L.push("Full list of items: `review.csv` (one row per decision).");
  return L.join("\n") + "\n";
}

export function renderReviewCsv(review) {
  const cols = ["category", "severity", "staging_pinhunt_id", "staging_id", "staging_title", "production_pinhunt_id", "production_id", "production_title", "detail", "suggested_action", "decision"];
  const cell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const order = { critical: 0, review: 1, info: 2 };
  const rows = [...review].sort((a, b) => order[a.severity] - order[b.severity] || a.category.localeCompare(b.category));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}

// ── before sharing ──────────────────────────────────────────────────────────

/** Replaces the two project refs with STAGING / PRODUCTION in shareable text. */
export function redactRefs(text, { stagingRef, productionRef }) {
  let out = text;
  if (stagingRef) out = out.split(stagingRef).join("STAGING");
  if (productionRef) out = out.split(productionRef).join("PRODUCTION");
  return out;
}

/**
 * Looks for things that should never be in a shared report. "block" means
 * don't share until it's explained; "note" is expected content, listed so you
 * know it's there.
 */
export function privacyScan(text, { stagingRef, productionRef } = {}) {
  const findings = [];
  const count = (re) => (text.match(re) ?? []).length;
  const block = (what, n) => n && findings.push({ level: "block", what, count: n });
  const note = (what, n) => n && findings.push({ level: "note", what, count: n });
  block("email addresses", count(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g));
  block("tokens or keys (JWT)", count(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g));
  block("Supabase keys", count(/sb_(secret|publishable)_[A-Za-z0-9_-]+|service_role/g));
  block("Pin & Pop links or names in URLs", count(/https?:\/\/[^\s|)]*pin-?(and|&|n)?-?pop[^\s|)]*/gi));
  block("private storage paths (board scans, bulk uploads, contributed originals)", count(/\b(board-scans|bulk-image-matcher|pin-contributed-images|pin-submissions)\/[^\s|,]+/g));
  if (stagingRef) block("staging project ref (not secret, but identifies the project)", text.split(stagingRef).length - 1);
  if (productionRef) block("production project ref (not secret, but identifies the project)", text.split(productionRef).length - 1);
  note("PinHunt IDs (PHUK-…): catalogue identifiers", count(/PHUK-\d{8}/g));
  note("internal record ids (UUIDs) of pins and photos: catalogue records, not people", count(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi));
  return { ok: !findings.some((f) => f.level === "block"), findings };
}
