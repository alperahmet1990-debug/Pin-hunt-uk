/**
 * Trusted catalogue import — reusable admin script (server-side only).
 *
 * Imports the "Master Catalogue" tab of the trusted test workbook into the
 * pins table, creates/updates pin_sets, rebuilds character links, archives
 * old speculative records, and remaps user-owned pins where the match is
 * confident. Idempotent: upserts by pinhunt_id, then Pin & Pop external id,
 * then normalised title+series+year.
 *
 * Usage:
 *   node scripts/import-trusted-catalogue.mjs <workbook.xlsx> --dry-run
 *   node scripts/import-trusted-catalogue.mjs <workbook.xlsx> --apply [--archive-rest] [--remap-user-pins]
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 * Writes an import log JSON next to the workbook.
 */
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

const [, , workbookPath, ...flags] = process.argv;
if (!workbookPath || !fs.existsSync(workbookPath)) {
  console.error("Usage: node import-trusted-catalogue.mjs <workbook.xlsx> [--dry-run|--apply] [--archive-rest] [--remap-user-pins]");
  process.exit(1);
}
const APPLY = flags.includes("--apply");
const ARCHIVE_REST = flags.includes("--archive-rest");
const REMAP = flags.includes("--remap-user-pins");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const clean = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s.length ? s : null;
};
const splitList = (v) =>
  [...new Set((clean(v) ?? "").split(/[;,]/).map((s) => s.trim()).filter(Boolean))];
const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const toDateStr = (v) => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const normKey = (title, series, year) =>
  [title, series, year ?? ""].map((s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")).join("|");

/** Extract "Pin & Pop: 86328" style ids into { pin_and_pop: "86328" } */
function parseExternalIds(v) {
  const s = clean(v);
  if (!s) return null;
  const out = {};
  for (const part of s.split(/[;|]/)) {
    const m = part.match(/pin\s*&?\s*pop[:\s]+(\S+)/i);
    if (m) out.pin_and_pop = m[1];
    else {
      const kv = part.match(/^\s*([^:]+):\s*(.+)$/);
      if (kv) out[kv[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")] = kv[2].trim();
    }
  }
  return Object.keys(out).length ? out : { raw: s };
}

// ── Parse workbook ────────────────────────────────────────────────────────────

const wb = XLSX.readFile(workbookPath, { cellDates: true });
const master = XLSX.utils.sheet_to_json(wb.Sheets["Master Catalogue"], { defval: null });
const setSummary = XLSX.utils.sheet_to_json(wb.Sheets["Set Summary"] ?? {}, { defval: null });

const log = {
  startedAt: new Date().toISOString(),
  mode: APPLY ? "apply" : "dry-run",
  workbook: path.basename(workbookPath),
  totalRows: master.length,
  eligible: 0,
  skipped: [],
  duplicateIdsPrevented: [],
  sets: { created: 0, updated: 0, names: [] },
  pins: { inserted: 0, updated: 0, matchedBy: { pinhunt_id: 0, external_id: 0, normalised: 0 } },
  characterLinks: 0,
  archived: 0,
  remap: { matched: [], ambiguous: [], untouched: 0 },
  errors: [],
};

// Filter eligible rows
const seenIds = new Set();
const rows = [];
for (const [i, r] of master.entries()) {
  const status = clean(r["Catalogue status"]);
  const safe = clean(r["Safe for app search"]);
  const action = clean(r["Import action"]);
  const pid = clean(r["pinhunt_id"]);
  if (status !== "Trusted test record" || !/^yes$/i.test(safe ?? "") || !/^upsert$/i.test(action ?? "")) {
    log.skipped.push({ row: i + 2, pinhunt_id: pid, reason: `status=${status}, safe=${safe}, action=${action}` });
    continue;
  }
  if (!pid) { log.skipped.push({ row: i + 2, reason: "missing pinhunt_id" }); continue; }
  if (seenIds.has(pid)) { log.duplicateIdsPrevented.push(pid); continue; }
  seenIds.add(pid);
  rows.push(r);
}
log.eligible = rows.length;

// ── Build set records from Master rows (Set Summary used as cross-check) ────
const setsByKey = new Map();
for (const r of rows) {
  const series = clean(r["Normalised series name"]) ?? clean(r["Series"]);
  if (!series) continue;
  const rec = setsByKey.get(series) ?? {
    normalised_series: series,
    set_name: clean(r["Series"]) ?? series,
    collection_name: clean(r["Collection name"]),
    programme: clean(r["Programme"]),
    release_year: toInt(r["Release year"]),
    scope: clean(r["Release scope"]),
    collection_type: clean(r["Collection type"]),
    expected_pin_count: toInt(r["Expected pin count"]),
    released_pin_count: 0,
    source_url: clean(r["Source URL"]),
    secondary_source_url: clean(r["Validation source 2"]),
    validation_status: clean(r["Validation tier"]),
  };
  rec.released_pin_count += 1;
  setsByKey.set(series, rec);
}
for (const rec of setsByKey.values()) {
  rec.is_complete = rec.expected_pin_count != null && rec.released_pin_count >= rec.expected_pin_count;
}

// Cross-check against Set Summary tab
for (const s of setSummary) {
  const name = clean(s["Collection name"]);
  const match = [...setsByKey.values()].find((x) => x.collection_name === name || x.set_name === name);
  if (!match) log.errors.push(`Set Summary row not represented in eligible pins: ${name}`);
  else {
    const expected = toInt(s["Trusted pin rows"]);
    if (expected != null && expected !== match.released_pin_count) {
      log.errors.push(`Set count mismatch for ${name}: workbook says ${expected} trusted rows, import found ${match.released_pin_count}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Preload existing pins for identity matching
  const existing = [];
  for (let fromRow = 0; ; fromRow += 1000) {
    const { data, error } = await supabase
      .from("pins")
      .select("id, pinhunt_id, title, collection, release_year, external_identifiers, catalogue_status, image_url, back_image_url")
      .range(fromRow, fromRow + 999);
    if (error) throw new Error(`preload pins: ${error.message}`);
    existing.push(...data);
    if (data.length < 1000) break;
  }
  const byPinhuntId = new Map(existing.map((p) => [p.pinhunt_id, p]));
  const byPnp = new Map();
  for (const p of existing) {
    const pnp = p.external_identifiers?.pin_and_pop;
    if (pnp) byPnp.set(String(pnp), p);
  }
  const byNorm = new Map();
  for (const p of existing) {
    const k = normKey(p.title, p.collection, p.release_year);
    if (!byNorm.has(k)) byNorm.set(k, p); // first only; collisions treated as ambiguous
    else byNorm.set(k, "AMBIGUOUS");
  }

  // ── Upsert sets ──
  for (const rec of setsByKey.values()) {
    log.sets.names.push(rec.normalised_series);
    if (!APPLY) continue;
    const { data: existingSet } = await supabase
      .from("pin_sets").select("id").eq("normalised_series", rec.normalised_series).maybeSingle();
    const { error } = await supabase
      .from("pin_sets")
      .upsert({ ...rec, updated_at: new Date().toISOString() }, { onConflict: "normalised_series" });
    if (error) { log.errors.push(`set ${rec.normalised_series}: ${error.message}`); continue; }
    if (existingSet) log.sets.updated += 1; else log.sets.created += 1;
  }
  if (!APPLY) { log.sets.created = setsByKey.size; }

  // ── Upsert pins ──
  const trustedPinIds = [];
  for (const r of rows) {
    const pid = clean(r["pinhunt_id"]);
    const externalIds = parseExternalIds(r["external_ids"]);
    const characters = splitList(r["All characters"] ?? r["Characters"]);
    const mainCharacter = clean(r["Main character"]) ?? characters[0] ?? null;
    const series = clean(r["Series"]);
    const year = toInt(r["Release year"]);
    const title = clean(r["Pin name"]);

    // Identity resolution
    let target = byPinhuntId.get(pid) ?? null;
    let matchedBy = target ? "pinhunt_id" : null;
    if (!target && externalIds?.pin_and_pop) {
      target = byPnp.get(String(externalIds.pin_and_pop)) ?? null;
      if (target) matchedBy = "external_id";
    }
    if (!target) {
      const cand = byNorm.get(normKey(title, series, year));
      if (cand && cand !== "AMBIGUOUS") { target = cand; matchedBy = "normalised"; }
    }

    const frontUrl = clean(r["Front image URL"]);
    const backUrl = clean(r["Back image URL"]);
    // Keep any trusted existing image URL already present; never invent new ones.
    const imageUrl = frontUrl ?? target?.image_url ?? null;
    const backImageUrl = backUrl ?? target?.back_image_url ?? null;

    const payload = {
      pinhunt_id: pid,
      title,
      brand: clean(r["Brand"]),
      collection: series,
      release_year: year,
      release_date: toDateStr(r["Release date"]),
      limited_edition_size: toInt(r["Edition size"]),
      edition_type: clean(r["Edition type"]),
      retail_price: toNum(r["Original price"]),
      currency: clean(r["Currency"]) ?? "GBP",
      retailer: clean(r["Park / Retailer"]),
      external_identifiers: externalIds,
      source_url: clean(r["Source URL"]),
      main_character: mainCharacter,
      all_characters: characters.join("; ") || null,
      image_url: imageUrl,
      back_image_url: backImageUrl,
      needs_front_image: !imageUrl,
      needs_back_image: !backImageUrl,
      status: "active",
      verification_status: "verified",
      catalogue_status: "trusted",
      is_searchable: true,
      is_seed_record: false,
      needs_review: false,
      catalogue_source: "trusted_test_catalogue",
      catalogue_updated_at: new Date().toISOString(),
      programme: clean(r["Programme"]),
      collection_name: clean(r["Collection name"]),
      release_wave: clean(r["Release wave"]),
      release_scope: clean(r["Release scope"]),
      collection_type: clean(r["Collection type"]),
      normalised_series: clean(r["Normalised series name"]) ?? series,
      search_aliases: clean(r["Search aliases"]),
      main_subject: clean(r["Main subject"]),
      subject_type: clean(r["Subject type"]),
      validation_tier: clean(r["Validation tier"]),
      validation_notes: clean(r["Validation notes"]),
      validation_source_2: clean(r["Validation source 2"]),
      validated_date: toDateStr(r["Validated date"]),
      confidence_basis: clean(r["Confidence basis"]),
      raw_import_data: r,
      updated_at: new Date().toISOString(),
    };

    if (matchedBy) log.pins.matchedBy[matchedBy] += 1;

    if (!APPLY) {
      if (target) log.pins.updated += 1; else log.pins.inserted += 1;
      continue;
    }

    let pinRowId = target?.id ?? null;
    if (target) {
      const { error } = await supabase.from("pins").update(payload).eq("id", target.id);
      if (error) { log.errors.push(`update ${pid}: ${error.message}`); continue; }
      log.pins.updated += 1;
    } else {
      const { data, error } = await supabase.from("pins").insert(payload).select("id").single();
      if (error) { log.errors.push(`insert ${pid}: ${error.message}`); continue; }
      pinRowId = data.id;
      log.pins.inserted += 1;
    }
    trustedPinIds.push(pinRowId);

    // Rebuild character links: always clear stale links first, then reinsert.
    {
      const charIds = [];
      for (const name of characters) {
        const { data: ch, error } = await supabase
          .from("characters").upsert({ name }, { onConflict: "name" }).select("id").single();
        if (error) { log.errors.push(`character ${name}: ${error.message}`); continue; }
        charIds.push(ch.id);
      }
      await supabase.from("pin_characters").delete().eq("pin_id", pinRowId);
      if (charIds.length) {
        const { error } = await supabase
          .from("pin_characters")
          .insert(charIds.map((cid) => ({ pin_id: pinRowId, character_id: cid })));
        if (error) log.errors.push(`links ${pid}: ${error.message}`);
        else log.characterLinks += charIds.length;
      }
    }
  }

  // ── Fail-safe: never archive or remap after a dirty import pass ──
  const importClean = log.errors.length === 0;
  if (APPLY && !importClean && (ARCHIVE_REST || REMAP)) {
    console.error("Import pass had errors — skipping archive/remap. Fix and re-run.");
  }

  // ── Archive everything that is not trusted ──
  if (APPLY && ARCHIVE_REST && importClean) {
    const { data, error } = await supabase
      .from("pins")
      .update({ catalogue_status: "archived", is_searchable: false, archived_at: new Date().toISOString() })
      .neq("catalogue_status", "trusted")
      .select("id");
    if (error) log.errors.push(`archive: ${error.message}`);
    else log.archived = data.length;
  }

  // ── Remap user-owned pins that point at archived records ──
  if (APPLY && REMAP && importClean) {
    const { data: userPins, error } = await supabase
      .from("user_pins")
      .select("id, user_id, pin_id, status, pins!inner(id, pinhunt_id, title, collection, release_year, external_identifiers, catalogue_status)")
      .eq("pins.catalogue_status", "archived");
    if (error) log.errors.push(`remap query: ${error.message}`);
    const { data: trusted } = await supabase
      .from("pins")
      .select("id, pinhunt_id, title, collection, release_year, external_identifiers")
      .eq("catalogue_status", "trusted");
    const tByPnp = new Map();
    const tByNorm = new Map();
    for (const t of trusted ?? []) {
      const pnp = t.external_identifiers?.pin_and_pop;
      if (pnp) tByPnp.set(String(pnp), t);
      const k = normKey(t.title, t.collection, t.release_year);
      tByNorm.set(k, tByNorm.has(k) ? "AMBIGUOUS" : t);
    }
    for (const upn of userPins ?? []) {
      const old = upn.pins;
      let match = null;
      const pnp = old.external_identifiers?.pin_and_pop;
      if (pnp && tByPnp.has(String(pnp))) match = tByPnp.get(String(pnp));
      if (!match) {
        const cand = tByNorm.get(normKey(old.title, old.collection, old.release_year));
        if (cand === "AMBIGUOUS") {
          log.remap.ambiguous.push({ user_pin_id: upn.id, old_pinhunt_id: old.pinhunt_id, title: old.title });
          continue;
        }
        match = cand ?? null;
      }
      if (!match) { log.remap.untouched += 1; continue; }
      // Only repoint if the user doesn't already have the trusted pin.
      const { data: dup } = await supabase
        .from("user_pins").select("id").eq("user_id", upn.user_id).eq("pin_id", match.id).maybeSingle();
      if (dup) { log.remap.untouched += 1; continue; }
      const { error: e2 } = await supabase.from("user_pins").update({ pin_id: match.id }).eq("id", upn.id);
      if (e2) log.errors.push(`remap ${upn.id}: ${e2.message}`);
      else log.remap.matched.push({ user_pin_id: upn.id, old: old.pinhunt_id, new: match.pinhunt_id });
    }
  }

  log.finishedAt = new Date().toISOString();
  const logPath = path.join(
    path.dirname(workbookPath),
    `trusted-import-log-${APPLY ? "apply" : "dryrun"}-${Date.now()}.json`,
  );
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(JSON.stringify({
    mode: log.mode, totalRows: log.totalRows, eligible: log.eligible,
    skipped: log.skipped.length, duplicateIdsPrevented: log.duplicateIdsPrevented.length,
    sets: { count: setsByKey.size, created: log.sets.created, updated: log.sets.updated },
    pins: log.pins, characterLinks: log.characterLinks,
    archived: log.archived,
    remap: { matched: log.remap.matched.length, ambiguous: log.remap.ambiguous.length, untouched: log.remap.untouched },
    errors: log.errors,
    logPath,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
