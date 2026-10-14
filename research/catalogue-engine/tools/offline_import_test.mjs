// Offline import replay (#241): migrations 002–045 on PGlite (in-process, throwaway), load a
// research run as the API does, simulate a reviewer's direct check + approval of every pin that
// passes the approval rules, then run the import's judging (the real research-import.ts) and write
// exactly the rows the import route would write, against the real schema and constraints.
// Touches no hosted database.
// Usage (scratch dir with @electric-sql/pglite@0.5.7, {"type":"module"}, research-run.ts and
// research-import.ts copied in, the latter importing "./research-run.ts"):
//   node --experimental-strip-types offline_import_test.mjs <repo> <payload.json> <scratch-dir>
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

const [REPO, PAYLOAD, LIBDIR] = process.argv.slice(2);
const { validateResearchRun, checkDecision } = await import(path.resolve(LIBDIR, "research-run.ts"));
const { judgeCandidate, buildPinRow, MAX_IMPORT_BATCH } = await import(path.resolve(LIBDIR, "research-import.ts"));
const STUBS = fs.readFileSync(path.join(REPO, "supabase/verify/local-replay.mjs"), "utf8").match(/const STUBS = `([\s\S]*?)`;/)[1];

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(STUBS);
const MIG = path.join(REPO, "supabase/migrations");
const files = fs.readdirSync(MIG).filter(f => f.endsWith(".sql") && f !== "001_pins_catalogue.sql").sort();
const failed = [];
for (const f of files) { try { await db.exec(fs.readFileSync(path.join(MIG, f), "utf8")); } catch (e) { failed.push(f); } }
if (failed.some(f => f.startsWith("045"))) { console.log("FAIL: 045 did not apply"); process.exit(1); }
console.log(`migrations applied ${files.length - failed.length}/${files.length}${failed.length ? " (pre-existing: " + failed.join(", ") + ")" : ""}`);

const uid = (await db.query(`insert into auth.users (email) values ('creator@example.test') returning id`)).rows[0].id;
if (!(await db.query(`select 1 from profiles where id=$1`, [uid])).rows.length) {
  const cols = (await db.query(`select column_name, is_nullable, column_default from information_schema.columns where table_name='profiles' and table_schema='public'`)).rows;
  const req = cols.filter(c => c.is_nullable === "NO" && !c.column_default && c.column_name !== "id").map(c => c.column_name);
  await db.query(`insert into profiles (${["id", ...req].join(",")}) values (${["id", ...req].map((_, i) => "$" + (i + 1)).join(",")})`, [uid, ...req.map(() => "x")]);
}

const v = validateResearchRun(JSON.parse(fs.readFileSync(PAYLOAD, "utf8")));
if (!v.ok) { console.log("FAIL: payload rejected", v.errors.slice(0, 5)); process.exit(1); }
const run = v.run;
const runId = (await db.query(`insert into catalogue_research_runs (engine_version, git_commit, summary, loaded_by) values ($1,$2,$3,$4) returning id`,
  [run.engineVersion, run.gitCommit, JSON.stringify(run.counts), uid])).rows[0].id;
for (const c of run.candidates) {
  const r = await db.query(`insert into catalogue_candidates (run_id, research_key, entity_type, set_research_key, proposed, record_confidence, engine_verified, review_reasons, warnings, duplicate_status, status)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [runId, c.research_key, c.entity_type, c.set_research_key, JSON.stringify(c.proposed), c.record_confidence, c.engine_verified, c.review_reasons, c.warnings, c.duplicate_status,
     c.engine_verified ? "needs_direct_verification" : "researched"]);
  c._id = r.rows[0].id;
}

// Reviewer: direct check + approval where the approval rules allow it (variants get a note).
let approved = 0, notApprovable = 0;
for (const c of run.candidates.filter(c => c.entity_type === "pin")) {
  await db.query(`insert into catalogue_evidence (candidate_id, field, value, source_url, source_class, method, checked_by) values ($1,'characters','{"confirmed":true}','https://www.disneystore.co.uk/x','official','human_direct_check',$2)`, [c._id, uid]);
  await db.query(`update catalogue_candidates set status='direct_verified', direct_verified_by=$1, direct_verified_at=now() where id=$2`, [uid, c._id]);
  const problem = checkDecision({ decision: "approve", notes: c.warnings.length ? "confirmed on page" : null,
    candidate: { entity_type: "pin", status: "direct_verified", record_confidence: c.record_confidence, review_reasons: c.review_reasons, warnings: c.warnings, direct_verified_by: uid } });
  if (problem) { notApprovable++; continue; }
  await db.query(`update catalogue_candidates set status='approved', decided_by=$1, decided_at=now() where id=$2`, [uid, c._id]);
  approved++;
}

// Import: judge with the real rules, then write what the route writes, batch by batch.
const cands = (await db.query(`select id, entity_type, status, proposed, review_reasons, warnings, duplicate_status, duplicate_pin_id, direct_verified_by, decided_by
  from catalogue_candidates where entity_type='pin' and status='approved'`)).rows;
const existing = new Set((await db.query(`select title, collection from pins`)).rows.map(p => `${p.title}|${p.collection ?? ""}`.toLowerCase()));
const verdicts = cands.map(c => judgeCandidate(c, existing));
const ok = verdicts.filter(x => x.ok), refused = verdicts.filter(x => !x.ok);
const reasons = refused.reduce((m, r) => ((m[r.reason + (r.missing ? `(${r.missing.join("/")})` : "")] = (m[r.reason + (r.missing ? `(${r.missing.join("/")})` : "")] ?? 0) + 1), m), {});
let created = 0;
for (let i = 0; i < ok.length; i += MAX_IMPORT_BATCH) {
  const chunk = ok.slice(i, i + MAX_IMPORT_BATCH);
  await db.exec("begin");
  const batch = (await db.query(`insert into import_batches (filename, file_hash, status, total_rows, imported_by) values ('research-import-test','x','running',$1,$2) returning id`, [chunk.length, uid])).rows[0].id;
  for (const vd of chunk) {
    const pid = (await db.query(`select next_pinhunt_id() as id`)).rows[0].id;
    const row = { ...vd.row, pinhunt_id: pid, import_batch_id: batch };
    const cols = Object.keys(row);
    const pin = (await db.query(`insert into pins (${cols.join(",")}) values (${cols.map((_, k) => "$" + (k + 1)).join(",")}) returning id`, cols.map(k => row[k]))).rows[0].id;
    const moved = await db.query(`update catalogue_candidates set status='imported', imported_pin_id=$1, import_batch_id=$2 where id=$3 and status='approved' returning id`, [pin, batch, vd.candidateId]);
    if (!moved.rows.length) throw new Error("candidate changed");
    created++;
  }
  await db.query(`update import_batches set status='completed', inserted_rows=$1, completed_at=now() where id=$2`, [chunk.length, batch]);
  await db.exec("commit");
}

const checks = [];
const pub = (await db.query(`select count(*)::int n from pins where verification_status='verified' and import_batch_id is not null`)).rows[0].n;
checks.push([`imported pins are not public (verified count ${pub})`, pub === 0]);
const linked = (await db.query(`select count(*)::int n from catalogue_candidates where status='imported' and imported_pin_id is not null and import_batch_id is not null`)).rows[0].n;
checks.push([`every imported candidate is linked to its pin and batch (${linked}/${created})`, linked === created]);
const ids = (await db.query(`select count(distinct pinhunt_id)::int d, count(*)::int n from pins where import_batch_id is not null`)).rows[0];
checks.push([`pinhunt_ids are unique (${ids.d}/${ids.n})`, ids.d === ids.n]);
try {
  await db.query(`update catalogue_candidates set status='imported' where status='approved' and imported_pin_id is null`);
  checks.push(["constraint refuses 'imported' without a pin", false]);
} catch { checks.push(["constraint refuses 'imported' without a pin", true]); }

console.log(`pins approved by simulated review: ${approved} (not approvable by rules: ${notApprovable})`);
console.log(`import: ${created} created as new non-public pins; refused ${refused.length}`, JSON.stringify(reasons));
for (const [l, okk] of checks) console.log(`${okk ? "PASS" : "FAIL"}  ${l}`);
if (checks.some(([, okk]) => !okk)) process.exitCode = 1;
