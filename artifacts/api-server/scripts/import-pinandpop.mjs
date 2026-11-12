/**
 * Pin & Pop catalogue: reset, CSV seed and API sync. STAGING ONLY until the
 * production rollout in scripts/PINANDPOP.md.
 *
 *   node --env-file=.env.staging scripts/import-pinandpop.mjs csv <file.csv>            # validate only
 *   node --env-file=.env.staging scripts/import-pinandpop.mjs csv <file.csv> --apply    # import
 *   node --env-file=.env.staging scripts/import-pinandpop.mjs reset-old                 # show what would go
 *   node --env-file=.env.staging scripts/import-pinandpop.mjs reset-old --apply         # delete non-P&P catalogue
 *   node --env-file=.env.staging scripts/import-pinandpop.mjs sync [--apply]            # new pins (id_after)
 *   node --env-file=.env.staging scripts/import-pinandpop.mjs sync --full [--apply]     # re-read all, update edits, archive removed
 *   node --env-file=.env.staging scripts/import-pinandpop.mjs characters [--apply]      # characters from pin names (auto/blank pins only)
 *
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and, for sync, PINANDPOP_API_TOKEN.
 * Back up first (see PINANDPOP.md): reset-old deletes collection entries and boards.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { requireStaging } from "./lib/staging-guard.mjs";
import {
  PINANDPOP_CSV_COLUMNS, PINANDPOP_SOURCE, createPinAndPopClient, ensurePinAndPopSource, highestStoredPinAndPopId,
  normalisePinAndPop, parseCsv, pinhuntIdFor, setKeyFor, syncNewPins, syncSetCounts, writePinAndPopBatch, fillCharacters,
} from "./lib/pinandpop.mjs";

await requireStaging();

const [, , mode, ...rest] = process.argv;
const APPLY = rest.includes("--apply");
const FULL = rest.includes("--full");
const args = rest.filter((a) => !a.startsWith("--"));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function count(table, build = (q) => q) {
  const { count: n, error } = await build(supabase.from(table).select("*", { count: "exact", head: true }));
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

// ── CSV ──────────────────────────────────────────────────────────────────────
function validate(rows) {
  const report = { rows: rows.length, ok: 0, problems: {}, duplicateIds: 0, noSeries: 0, noYear: 0, noEdition: 0, noOrigin: 0, noImage: 0, sets: 0, sameNameInSet: 0 };
  const seen = new Set();
  const recs = [];
  const nameInSet = new Map();
  for (const raw of rows) {
    const r = normalisePinAndPop(raw);
    if (r.problem) { report.problems[r.problem] = (report.problems[r.problem] ?? 0) + 1; continue; }
    if (seen.has(r.id)) { report.duplicateIds++; continue; }
    seen.add(r.id);
    if (!r.seriesSlug) report.noSeries++;
    if (r.releaseYear == null) report.noYear++;
    if (!r.edition) report.noEdition++;
    if (!r.origin) report.noOrigin++;
    if (!r.coverImage) report.noImage++;
    const k = `${r.seriesSlug}|${r.name.toLowerCase()}`;
    nameInSet.set(k, (nameInSet.get(k) ?? 0) + 1);
    recs.push(r);
  }
  report.ok = recs.length;
  report.sets = new Set(recs.map((r) => r.seriesSlug).filter(Boolean)).size;
  report.sameNameInSet = [...nameInSet.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0);
  return { report, recs };
}

async function csvMode(file) {
  if (!file || !fs.existsSync(file)) throw new Error("usage: csv <file.csv> [--apply]");
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  const missing = PINANDPOP_CSV_COLUMNS.filter((c) => !(c in (rows[0] ?? {})));
  if (missing.length) throw new Error(`CSV is missing columns: ${missing.join(", ")}`);
  const { report, recs } = validate(rows);
  log("validation", JSON.stringify(report));
  if (!APPLY) { log("dry run: nothing written. Re-run with --apply."); return; }

  const existing = await count("pins", (q) => q.eq("catalogue_source", PINANDPOP_SOURCE));
  const fresh = existing === 0;
  log(`existing Pin & Pop pins: ${existing}${fresh ? " (fresh import: skipping per-pin clean-up)" : ""}`);
  await ensurePinAndPopSource(supabase);
  const t0 = Date.now();
  const CHUNK = 5000;
  const counts = new Map();
  for (const r of recs) if (r.seriesSlug) counts.set(setKeyFor(r.seriesSlug), (counts.get(setKeyFor(r.seriesSlug)) ?? 0) + 1);
  // Members of a set sit together, and a chunk never ends mid-set, so each new set is created with its full count.
  const ordered = [...recs].sort((a, b) => (a.seriesSlug ?? "￿").localeCompare(b.seriesSlug ?? "￿") || a.id - b.id);
  const totals = { pins: 0, sets: 0, memberships: 0, externalIds: 0, images: 0 };
  let start = 0;
  while (start < ordered.length) {
    let end = Math.min(start + CHUNK, ordered.length);
    while (end < ordered.length && ordered[end].seriesSlug && ordered[end].seriesSlug === ordered[end - 1].seriesSlug) end++;
    const s = await writePinAndPopBatch(supabase, ordered.slice(start, end), { fresh });
    for (const k of Object.keys(totals)) totals[k] += s[k];
    log(`${end}/${ordered.length} pins written (${Math.round((Date.now() - t0) / 1000)}s)`);
    start = end;
  }
  if (!fresh) log(`set counts corrected: ${await syncSetCounts(supabase, counts)}`);
  log("import totals", JSON.stringify(totals));
}

// ── reset the old (non-Pin & Pop) catalogue ──────────────────────────────────
async function resetOld() {
  const notPP = (q) => q.or(`catalogue_source.is.null,catalogue_source.neq.${PINANDPOP_SOURCE}`);
  const plan = {
    pins: await count("pins", notPP),
    pin_sets: await count("pin_sets", notPP),
    user_pins: await count("user_pins"),
    user_boards: await count("user_boards"),
  };
  log("would delete (cascades remove images, memberships, external ids, valuations):", JSON.stringify(plan));
  if (!APPLY) { log("dry run: nothing deleted. Re-run with --apply after backing up."); return; }
  if (await count("pins", (q) => q.eq("catalogue_source", PINANDPOP_SOURCE))) {
    throw new Error("Pin & Pop pins already exist: reset-old only runs before the import, so it can't remove collector data on P&P pins.");
  }
  // user_pins.pin_id is ON DELETE RESTRICT; boards hold pinhunt_ids with no FK.
  let r = await supabase.from("user_pins").delete().not("id", "is", null);
  if (r.error) throw new Error(`user_pins: ${r.error.message}`);
  r = await supabase.from("user_boards").delete().not("id", "is", null);
  if (r.error) throw new Error(`user_boards: ${r.error.message}`);
  r = await supabase.from("pin_submissions").update({ approved_pin_id: null }).not("approved_pin_id", "is", null);
  if (r.error) throw new Error(`pin_submissions: ${r.error.message}`);
  r = await notPP(supabase.from("pins").delete());
  if (r.error) throw new Error(`pins: ${r.error.message}`);
  r = await notPP(supabase.from("pin_sets").delete());
  if (r.error) throw new Error(`pin_sets: ${r.error.message}`);
  log("after:", JSON.stringify({ pins: await count("pins"), pin_sets: await count("pin_sets"), pin_images: await count("pin_images"), user_pins: await count("user_pins") }));
}

// ── API sync ─────────────────────────────────────────────────────────────────
async function syncMode() {
  const client = createPinAndPopClient({ token: process.env.PINANDPOP_API_TOKEN });
  if (!FULL) {
    if (!APPLY) {
      const after = await highestStoredPinAndPopId(supabase);
      const first = await client.pages({ idAfter: after, maxPages: 1 }).next();
      log(`dry run: after id ${after}, first page has ${first.value?.items.length ?? 0} new pins${first.value?.hasMore ? " (more pages follow)" : ""}. Re-run with --apply.`);
      return;
    }
    const stats = await syncNewPins({ supabase, client, log });
    log("sync", JSON.stringify({ ...stats, skipped: stats.skipped.length }));
    return;
  }
  // Full refresh: every pin, so edits to existing pins land and removed pins are archived.
  const seen = new Set();
  const t0 = Date.now();
  let buffer = [];
  const counts = new Map();
  const totals = { fetched: 0, written: 0, skipped: 0 };
  for await (const page of client.pages({})) {
    for (const item of page.items) {
      const r = normalisePinAndPop(item);
      if (r.problem) { totals.skipped++; continue; }
      seen.add(pinhuntIdFor(r.id));
      buffer.push(r);
      if (r.seriesSlug) counts.set(setKeyFor(r.seriesSlug), (counts.get(setKeyFor(r.seriesSlug)) ?? 0) + 1);
    }
    totals.fetched += page.items.length;
    if (buffer.length >= 2000 || !page.hasMore) {
      if (APPLY) totals.written += (await writePinAndPopBatch(supabase, buffer)).pins;
      buffer = [];
      log(`${totals.fetched} fetched (${Math.round((Date.now() - t0) / 1000)}s, ${client.requestCount} requests)`);
    }
  }
  // Archive Pin & Pop pins the API no longer returns (never delete: collectors may own them).
  const stored = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("pins").select("pinhunt_id").eq("catalogue_source", PINANDPOP_SOURCE)
      .is("archived_at", null).order("pinhunt_id").range(from, from + 999);
    if (error) throw new Error(error.message);
    stored.push(...data.map((d) => d.pinhunt_id));
    if (data.length < 1000) break;
  }
  const gone = stored.filter((id) => !seen.has(id));
  log(`stored ${stored.length}, returned by API ${seen.size}, no longer returned ${gone.length}`);
  if (totals.fetched < 0.9 * stored.length) {
    throw new Error("API returned under 90% of stored pins; refusing to archive anything (partial outage?).");
  }
  if (APPLY && gone.length) {
    for (let i = 0; i < gone.length; i += 150) {
      const { error } = await supabase.from("pins").update({ catalogue_status: "archived", is_searchable: false, archived_at: new Date().toISOString() })
        .in("pinhunt_id", gone.slice(i, i + 150));
      if (error) throw new Error(error.message);
    }
  }
  if (APPLY) log(`set counts corrected: ${await syncSetCounts(supabase, counts)}`);
  log("full sync", JSON.stringify({ ...totals, archived: APPLY ? gone.length : 0, dryRun: !APPLY }));
}

try {
  if (mode === "csv") await csvMode(args[0]);
  else if (mode === "reset-old") await resetOld();
  else if (mode === "sync") await syncMode();
  else if (mode === "characters") {
    // Characters from pin names, for automatic or blank pins only (never a person's edits).
    const stats = await fillCharacters(supabase, { apply: APPLY, log });
    log("characters", JSON.stringify(stats), APPLY ? "" : "(dry run: nothing written; re-run with --apply)");
  }
  else throw new Error("mode must be csv, reset-old, sync or characters (see the header of this file)");
} catch (err) {
  console.error("FAILED:", err.message);
  process.exit(1);
}
