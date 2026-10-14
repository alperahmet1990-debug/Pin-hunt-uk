// Offline load test: replay migrations 002–045 on PGlite (in-process, throwaway), then load a
// research run exactly as POST /api/admin/research/runs maps it, then simulate one set-level
// direct check + approval and the constraints that guard them. Touches no hosted database.
// Usage (scratch dir with @electric-sql/pglite@0.5.7 installed and {"type":"module"} package.json):
//   node --experimental-strip-types offline_load_test.mjs <repo> <payload.json> <repo>/artifacts/api-server/src/lib/research-run.ts
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

const [REPO, PAYLOAD, RUNLIB] = process.argv.slice(2);
const { validateResearchRun } = await import(path.resolve(RUNLIB));
const harness = fs.readFileSync(path.join(REPO, "supabase/verify/local-replay.mjs"), "utf8");
const STUBS = harness.match(/const STUBS = `([\s\S]*?)`;/)[1];

const t0 = Date.now();
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(STUBS);
const MIG = path.join(REPO, "supabase/migrations");
const files = fs.readdirSync(MIG).filter(f => f.endsWith(".sql") && f !== "001_pins_catalogue.sql").sort();
const failed = [];
for (const f of files) {
  try { await db.exec(fs.readFileSync(path.join(MIG, f), "utf8")); } catch (e) { failed.push(`${f}: ${String(e.message).split("\n")[0]}`); }
}
console.log(`migrations applied ${files.length - failed.length}/${files.length}`, failed.length ? failed : "");
if (failed.some(f => f.startsWith("045"))) { console.log("FAIL: 045 did not apply"); process.exit(1); }

// A staging App Creator profile (the FK target for loaded_by / checked_by / decided_by).
const uid = (await db.query(`insert into auth.users (email) values ('creator@example.test') returning id`)).rows[0].id;
let prof = (await db.query(`select id from profiles where id = $1`, [uid])).rows[0];
if (!prof) {
  const cols = (await db.query(`select column_name, is_nullable, column_default from information_schema.columns where table_name='profiles' and table_schema='public'`)).rows;
  const req = cols.filter(c => c.is_nullable === "NO" && !c.column_default && c.column_name !== "id").map(c => c.column_name);
  const names = ["id", ...req], vals = [uid, ...req.map(c => (c.includes("name") ? "creator" : "x"))];
  await db.query(`insert into profiles (${names.join(",")}) values (${names.map((_, i) => "$" + (i + 1)).join(",")})`, vals);
}

const v = validateResearchRun(JSON.parse(fs.readFileSync(PAYLOAD, "utf8")));
if (!v.ok) { console.log("FAIL: payload rejected by validateResearchRun", v.errors.slice(0, 5)); process.exit(1); }
const run = v.run;

// ── Load, mirroring the route ──
await db.exec("begin");
const runId = (await db.query(
  `insert into catalogue_research_runs (engine_version, git_commit, summary, packet_hashes, loaded_by, status)
   values ($1,$2,$3,'[]'::jsonb,$4,'loaded') returning id`, [run.engineVersion, run.gitCommit, JSON.stringify(run.counts), uid])).rows[0].id;
const dupIds = [...new Set(run.candidates.map(c => c.duplicate_pinhunt_id).filter(Boolean))];
const idByKey = new Map();
for (const c of run.candidates) {
  const r = await db.query(
    `insert into catalogue_candidates (run_id, research_key, entity_type, set_research_key, proposed, record_confidence,
       engine_verified, review_reasons, warnings, duplicate_status, duplicate_pin_id, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,null,$11) returning id`,
    [runId, c.research_key, c.entity_type, c.set_research_key, JSON.stringify(c.proposed), c.record_confidence,
     c.engine_verified, c.review_reasons, c.warnings, c.duplicate_status, c.engine_verified ? "needs_direct_verification" : "researched"]);
  idByKey.set(c.research_key, r.rows[0].id);
}
let ev = 0;
for (const c of run.candidates) for (const e of c.evidence) {
  await db.query(
    `insert into catalogue_evidence (candidate_id, field, value, source_url, publisher, source_class, method, note, claim_ref)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [idByKey.get(c.research_key), e.field, JSON.stringify(e.value), e.source_url, e.publisher, e.source_class, e.method, e.note, e.claim_ref]);
  ev++;
}
await db.exec("commit");
const counts = (await db.query(`select entity_type, status, count(*)::int n from catalogue_candidates group by 1,2 order by 1,2`)).rows;
console.log(`loaded run: ${run.candidates.length} candidates, ${ev} evidence rows (dup pinhunt_ids referenced: ${dupIds.length})`, JSON.stringify(counts));

// ── Simulate one set-level check + approval on the first set that has an official page ──
const pick = (await db.query(
  `select c.set_research_key sk, e.source_url url, array_agg(distinct c.id) ids
     from catalogue_candidates c join catalogue_evidence e on e.candidate_id = c.id
    where c.entity_type='pin' and e.source_class='official' and e.field in ('characters','pin_name')
      and cardinality(c.warnings)=0
    group by 1,2 order by count(distinct c.id) desc limit 1`)).rows[0];
const checks = [];
const expectFail = async (label, sql, params) => {
  try { await db.query(sql, params); checks.push([label, "FAIL (accepted)"]); } catch { checks.push([label, "ok (refused)"]); }
};
// Approval without a direct check must be refused by the table constraint.
await expectFail("approve without direct check refused", `update catalogue_candidates set status='approved', decided_by=$1, decided_at=now() where id=$2`, [uid, pick.ids[0]]);
// Human check without attribution must be refused.
await expectFail("unattributed human check refused", `insert into catalogue_evidence (candidate_id, field, value, source_url, source_class, method) values ($1,'characters','{"confirmed":true}',$2,'official','human_direct_check')`, [pick.ids[0], pick.url]);
// Excluded source can never enter staging.
await expectFail("excluded source refused", `insert into catalogue_evidence (candidate_id, field, value, source_url, source_class, method) values ($1,'characters','["x"]','https://pinandpop.com/x','fan','search_snippet')`, [pick.ids[0]]);
// Proper per-pin check + approval.
for (const id of pick.ids) {
  await db.query(`insert into catalogue_evidence (candidate_id, field, value, source_url, publisher, source_class, method, checked_by)
                  values ($1,'characters','{"confirmed":true}',$2,'disneystore.co.uk','official','human_direct_check',$3)`, [id, pick.url, uid]);
  await db.query(`update catalogue_candidates set status='direct_verified', direct_verified_by=$1, direct_verified_at=now() where id=$2`, [uid, id]);
  await db.query(`update catalogue_candidates set status='approved', decided_by=$1, decided_at=now() where id=$2 and status='direct_verified'`, [uid, id]);
}
const approved = (await db.query(`select count(*)::int n from catalogue_candidates where status='approved'`)).rows[0].n;
checks.push([`set check on ${pick.sk}: ${pick.ids.length} pins verified + approved`, approved === pick.ids.length ? "ok" : `FAIL (${approved})`]);
// Nothing reaches pins: research tables only.
const pinsTouched = (await db.query(`select count(*)::int n from pins`)).rows[0].n;
checks.push([`pins table untouched (rows: ${pinsTouched})`, pinsTouched === 0 ? "ok" : "check"]);
for (const [l, r] of checks) console.log(`${r.startsWith("ok") ? "PASS" : "FAIL"}  ${l}  ${r}`);
console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (checks.some(([, r]) => !r.startsWith("ok"))) process.exitCode = 1;
