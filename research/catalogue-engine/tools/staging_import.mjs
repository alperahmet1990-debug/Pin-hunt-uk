// Staging import helper (#241): dry run, then import, of the APPROVED pins of one research run.
// Run from the repo root, with the staging API already running (start:staging):
//   node --env-file=artifacts/api-server/.env.staging research/catalogue-engine/tools/staging_import.mjs [--dry-run] [--run <runId>]
// It signs in as you (App Creator) with the staging anon key, lists the run's approved pins,
// dry-runs them in batches of 50, shows what would be refused, and imports the eligible ones
// only after you type the confirmation. Pins are created as needs_source_verification (not public).
// Staging only: it refuses unless the env file identifies the staging project.
import readline from "node:readline";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const runArg = args.includes("--run") ? args[args.indexOf("--run") + 1] : null;
const env = process.env;
const BATCH = 50;

function die(msg) { console.error(`\n✗ ${msg}`); process.exit(1); }

// ── Staging only ────────────────────────────────────────────────────────────
const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/i.exec(String(env.SUPABASE_URL ?? "").trim())?.[1]?.toLowerCase();
if (env.PINHUNT_ENV !== "staging") die("PINHUNT_ENV is not 'staging'. Run with --env-file=artifacts/api-server/.env.staging.");
if (!ref || ref !== String(env.STAGING_PROJECT_REF ?? "").toLowerCase()) die("SUPABASE_URL is not the staging project (STAGING_PROJECT_REF).");
if (!env.PRODUCTION_PROJECT_REF || ref === String(env.PRODUCTION_PROJECT_REF).toLowerCase()) die("Cannot confirm this is not production (PRODUCTION_PROJECT_REF).");
if (!env.SUPABASE_ANON_KEY) die("SUPABASE_ANON_KEY is missing from .env.staging.");
const API = (env.RESEARCH_API_BASE || `http://localhost:${env.PORT || 3000}/api`).replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api$/.test(API) && !env.RESEARCH_API_BASE) die(`Unexpected API base ${API}`);

// ── Prompts ─────────────────────────────────────────────────────────────────
function ask(q, hidden = false) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = s => { if (!s.startsWith(q)) return; rl.output.write(q); };
    rl.question(q, a => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(a.trim()); });
  });
}

async function signIn() {
  const email = env.PINHUNT_ADMIN_EMAIL || await ask("App Creator email (staging): ");
  const password = await ask("Password (not shown): ", true);
  const r = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) die(`Sign-in failed (${r.status}). Check the email and password for the STAGING project.`);
  return j.access_token;
}

async function api(token, method, p, body) {
  let r;
  try {
    r = await fetch(`${API}${p}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { die(`Cannot reach the API at ${API}. Is "pnpm --filter @workspace/api-server run start:staging" running?`); }
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}

const chunks = a => Array.from({ length: Math.ceil(a.length / BATCH) }, (_, i) => a.slice(i * BATCH, (i + 1) * BATCH));

// ── Main ────────────────────────────────────────────────────────────────────
const token = await signIn();
const runs = await api(token, "GET", "/admin/research/runs");
if (runs.status === 403) die("Signed in, but this account is not the App Creator on staging.");
if (runs.status !== 200) die(`Listing runs failed (${runs.status}): ${runs.body.error ?? ""}`);
const run = runArg ? runs.body.runs.find(r => r.id === runArg) : runs.body.runs[0];
if (!run) die(runArg ? `Run ${runArg} not found.` : "No research runs loaded yet. Load the pilot in Research Review first.");
console.log(`\nRun ${run.id} (loaded ${run.loaded_at}, engine ${run.engine_version ?? "?"}, commit ${run.git_commit ?? "?"})`);

const list = await api(token, "GET", `/admin/research/candidates?runId=${run.id}&status=approved&entity=pin`);
if (list.status !== 200) die(`Listing approved pins failed (${list.status}): ${list.body.error ?? ""}`);
const approved = list.body.candidates;
const keyOf = new Map(approved.map(c => [c.id, c.research_key]));
console.log(`Approved pins in this run: ${approved.length}`);
if (!approved.length) die("Nothing approved yet. Approve pins in Research Review first.");

const eligible = [], refused = [];
for (const ids of chunks(approved.map(c => c.id))) {
  const d = await api(token, "POST", "/admin/research/import/dry-run", { candidateIds: ids });
  if (d.status !== 200) die(`Dry run failed (${d.status}): ${d.body.error ?? ""}`);
  eligible.push(...d.body.wouldCreate.map(w => w.candidateId));
  refused.push(...d.body.refused);
}
console.log(`\nDry run: ${eligible.length} would be created, ${refused.length} refused.`);
for (const r of refused) console.log(`  refused  ${keyOf.get(r.candidateId) ?? r.candidateId}: ${r.message}${r.missing?.length ? ` (missing ${r.missing.join(", ")})` : ""}`);
if (DRY || !eligible.length) { console.log(DRY ? "\n--dry-run: nothing written." : "\nNothing eligible: nothing written."); process.exit(0); }

const confirm = await ask(`\nImport ${eligible.length} pins into STAGING as new, non-public pins? Type IMPORT ${eligible.length} to go: `);
if (confirm !== `IMPORT ${eligible.length}`) { console.log("Not confirmed: nothing written."); process.exit(0); }

const log = { at: new Date().toISOString(), runId: run.id, batches: [], refused };
for (const ids of chunks(eligible)) {
  const r = await api(token, "POST", "/admin/research/import", { candidateIds: ids });
  if (r.status !== 200) {
    console.error(`\n✗ Batch of ${ids.length} not imported (${r.status}): ${r.body.error ?? ""}`);
    for (const x of r.body.refused ?? []) console.error(`  refused  ${keyOf.get(x.candidateId) ?? x.candidateId}: ${x.message}`);
    log.batches.push({ ok: false, status: r.status, ids });
    break;
  }
  log.batches.push({ ok: true, batchId: r.body.batchId, created: r.body.created });
  console.log(`✓ batch ${r.body.batchId}: ${r.body.created.length} pins (${r.body.created[0]?.pinhuntId} … ${r.body.created.at(-1)?.pinhuntId})`);
}
const out = path.join(os.homedir(), `pinhunt-staging-import-${log.at.replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(out, JSON.stringify(log, null, 1));
const done = log.batches.filter(b => b.ok);
console.log(`\nImported ${done.reduce((n, b) => n + b.created.length, 0)} pins in ${done.length} batch(es). Log: ${out}`);
if (done.length) {
  console.log("\nCheck in the staging SQL editor (expect 0 public):");
  console.log(`  select verification_status, count(*) from pins where import_batch_id in (${done.map(b => `'${b.batchId}'`).join(", ")}) group by 1;`);
}
