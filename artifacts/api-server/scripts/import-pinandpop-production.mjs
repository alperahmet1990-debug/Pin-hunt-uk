#!/usr/bin/env node
/**
 * Pin & Pop catalogue -> PRODUCTION (separate, explicitly approved entry point;
 * artifacts/api-server/scripts/PINANDPOP.md "Production rollout", step 4;
 * docs/catalogue-sync/PRODUCTION-CATALOGUE-RESET.md, step 4).
 *
 * Maintainer decision, 14 Nov 2026: production's catalogue becomes Pin & Pop.
 * This tool only ADDS Pin & Pop data (pins, sets, memberships, external ids,
 * reference images, characters) and updates the pin_and_pop licence row. It
 * never deletes or changes old pins, collections or anything else: removing
 * the old catalogue is a separate, reviewed SQL step.
 *
 * It reuses the staging importer's own mapping and writer (lib/pinandpop.mjs),
 * so production gets exactly what staging got. No install: plain Node 20+.
 *
 * Modes (run from artifacts/api-server, with a PRODUCTION settings file):
 *   check                      read-only: guard, counts, ID-clash check  (default)
 *   check --csv <file>         ... plus validates the Pin & Pop CSV
 *   import --csv <file> --apply   writes the CSV's pins (asks you to type the production ref)
 *   characters --apply         fills characters from pin names (as staging did)
 *   sync --apply               fetches pins added since the CSV (needs PINANDPOP_API_TOKEN)
 *
 * Settings file (plain text, outside every repository, never shared):
 *   PINHUNT_ENV=production
 *   PRODUCTION_PROJECT_REF=<20 chars>
 *   STAGING_PROJECT_REF=<20 chars>
 *   SUPABASE_URL=https://<production ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<production secret key>
 *   PINANDPOP_API_TOKEN=<only for sync>
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRestClient } from "./lib/rest-client.mjs";
import { assertProductionMarker, assertProductionTarget, confirmWrite } from "./lib/production-guard.mjs";
import {
  PINANDPOP_CSV_COLUMNS, PINANDPOP_SOURCE, PINHUNT_ID_OFFSET, createPinAndPopClient, ensurePinAndPopSource, fillCharacters,
  normalisePinAndPop, parseCsv, pinhuntIdFor, setKeyFor, syncNewPins, syncSetCounts, writePinAndPopBatch,
} from "./lib/pinandpop.mjs";

const expand = (p) => path.resolve(String(p).replace(/^~(?=$|\/)/, os.homedir()));

export function validateCsv(rows) {
  const missing = PINANDPOP_CSV_COLUMNS.filter((c) => !(c in (rows[0] ?? {})));
  if (missing.length) throw new Error(`CSV is missing columns: ${missing.join(", ")}`);
  const report = { rows: rows.length, ok: 0, problems: {}, duplicateIds: 0, sets: 0 };
  const seen = new Set();
  const recs = [];
  for (const raw of rows) {
    const r = normalisePinAndPop(raw);
    if (r.problem) { report.problems[r.problem] = (report.problems[r.problem] ?? 0) + 1; continue; }
    if (seen.has(r.id)) { report.duplicateIds++; continue; }
    seen.add(r.id);
    recs.push(r);
  }
  report.ok = recs.length;
  report.sets = new Set(recs.map((r) => r.seriesSlug).filter(Boolean)).size;
  return { report, recs };
}

async function count(db, table, build = (q) => q) {
  const { count: n, error } = await build(db.from(table).select("*", { count: "exact", head: true }));
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

/** Old (non-Pin & Pop) pins whose PinHunt ID falls in the Pin & Pop range and would clash. */
async function idClashes(db, recs) {
  const want = new Set(recs.map((r) => pinhuntIdFor(r.id)));
  const { data, error } = await db.from("pins").select("pinhunt_id,catalogue_source")
    .gte("pinhunt_id", `PHUK-${PINHUNT_ID_OFFSET}`).or(`catalogue_source.is.null,catalogue_source.neq.${PINANDPOP_SOURCE}`).limit(1000);
  if (error) throw new Error(`id check: ${error.message}`);
  return (data ?? []).filter((p) => want.has(p.pinhunt_id)).map((p) => p.pinhunt_id);
}

export async function main(argv = process.argv.slice(2), env = process.env, { fetchImpl = fetch, log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a), confirm = confirmWrite } = {}) {
  const mode = argv[0] && !argv[0].startsWith("--") ? argv[0] : "check";
  const apply = argv.includes("--apply");
  const csvArg = argv.includes("--csv") ? argv[argv.indexOf("--csv") + 1] : null;
  if (!["check", "import", "characters", "sync"].includes(mode)) throw new Error("mode must be check, import, characters or sync");

  const { ref } = assertProductionTarget(env);
  const db = createRestClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl);
  await assertProductionMarker(db);
  log("target confirmed: PRODUCTION (settings, address, database marker, no staging marker).");

  const before = {
    pins: await count(db, "pins"),
    pinAndPopPins: await count(db, "pins", (q) => q.eq("catalogue_source", PINANDPOP_SOURCE)),
    pinAndPopImages: await count(db, "pin_images", (q) => q.eq("source", PINANDPOP_SOURCE)),
  };
  log("production now:", JSON.stringify(before));

  let recs = null;
  if (csvArg) {
    const file = expand(csvArg);
    if (!fs.existsSync(file)) throw new Error(`CSV not found: ${file}`);
    const v = validateCsv(parseCsv(fs.readFileSync(file, "utf8")));
    recs = v.recs;
    log("CSV:", JSON.stringify(v.report));
    const clashes = await idClashes(db, recs);
    if (clashes.length) throw new Error(`${clashes.length} old pin(s) already use a Pin & Pop PinHunt ID (${clashes.slice(0, 5).join(", ")}). Nothing was changed.`);
    log("ID check: no old pin uses a Pin & Pop PinHunt ID.");
  }

  if (mode === "check" || !apply) {
    log(mode === "check" ? "check only: nothing written." : `dry run: nothing written. Add --apply to ${mode}.`);
    return { before, recs };
  }

  if (mode === "import") {
    if (!recs) throw new Error("import needs --csv <file>.");
    await confirm(ref, `import ${recs.length} Pin & Pop pins`);
    const fresh = before.pinAndPopPins === 0;
    await ensurePinAndPopSource(db);
    log("licence row updated (pin_and_pop, v1.3: attribution shown, images internal only).");
    const counts = new Map();
    for (const r of recs) if (r.seriesSlug) counts.set(setKeyFor(r.seriesSlug), (counts.get(setKeyFor(r.seriesSlug)) ?? 0) + 1);
    const ordered = [...recs].sort((a, b) => (a.seriesSlug ?? "￿").localeCompare(b.seriesSlug ?? "￿") || a.id - b.id);
    const totals = { pins: 0, sets: 0, memberships: 0, externalIds: 0, images: 0 };
    const t0 = Date.now();
    let start = 0;
    while (start < ordered.length) {
      let end = Math.min(start + 2000, ordered.length);
      while (end < ordered.length && ordered[end].seriesSlug && ordered[end].seriesSlug === ordered[end - 1].seriesSlug) end++;
      // 250 pins a request (staging used 500): production already has 075's
      // search indexes, which make each write slower, and on staging 1,000-row
      // writes into the indexed table once hit the statement timeout.
      const s = await writePinAndPopBatch(db, ordered.slice(start, end), { fresh, batchSize: Number(env.PINANDPOP_BATCH_SIZE ?? 250) });
      for (const k of Object.keys(totals)) totals[k] += s[k];
      log(`${end}/${ordered.length} pins written (${Math.round((Date.now() - t0) / 1000)}s)`);
      start = end;
    }
    if (!fresh) log(`set counts corrected: ${await syncSetCounts(db, counts)}`);
    log("import totals:", JSON.stringify(totals));
    const chars = await fillCharacters(db, { log: () => {} });
    log("characters:", JSON.stringify(chars));
  } else if (mode === "characters") {
    await confirm(ref, "fill characters on Pin & Pop pins");
    log("characters:", JSON.stringify(await fillCharacters(db, { log })));
  } else if (mode === "sync") {
    if (!env.PINANDPOP_API_TOKEN) throw new Error("sync needs PINANDPOP_API_TOKEN in the production settings file.");
    await confirm(ref, "add Pin & Pop pins published since the CSV");
    const client = createPinAndPopClient({ token: env.PINANDPOP_API_TOKEN });
    const stats = await syncNewPins({ supabase: db, client, log });
    log("sync:", JSON.stringify({ ...stats, skipped: stats.skipped.length }));
  }

  const after = {
    pins: await count(db, "pins"),
    pinAndPopPins: await count(db, "pins", (q) => q.eq("catalogue_source", PINANDPOP_SOURCE)),
    pinAndPopImages: await count(db, "pin_images", (q) => q.eq("source", PINANDPOP_SOURCE)),
  };
  log("production after:", JSON.stringify(after));
  log("Next: in the production SQL editor run `vacuum analyze pins;` so searches stay fast.");
  return { before, after };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`import-pinandpop-production: ${e.message}`); process.exit(1); });
}
