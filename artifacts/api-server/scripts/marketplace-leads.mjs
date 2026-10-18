/**
 * Marketplace leads for catalogue research (#415). Run by the maintainer on
 * their own machine, against staging only.
 *
 * Reads the near-miss listings the market refresh already stored, groups
 * them into leads (possible missing pins, variants, sets, and edition or year
 * checks on existing pins) and, with --out, writes a pinhunt-research-run/v1
 * file to load through Admin → Research Review → "Load research run".
 *
 * By default it makes NO provider call and writes nothing to the database.
 * The optional --probe-sets search goes through the market refresh's
 * Soldgraph client, budget and confirm-credits rules, and needs --apply.
 *
 * Usage (from artifacts/api-server, Node 22.18+):
 *   node --env-file=.env.staging scripts/marketplace-leads.mjs
 *   node --env-file=.env.staging scripts/marketplace-leads.mjs --out ~/pinhunt-leads/leads-2026-10-18.json
 *   node --env-file=.env.staging scripts/marketplace-leads.mjs --probe-sets --probe-sources soldgraph:ebay_gb_sold
 *
 * See scripts/MARKETPLACE-LEADS.md for the full walkthrough.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { REPO_ROOT, requireStaging } from "./lib/staging-guard.mjs";
import { LEADS_ENTRY, loadMarketRefresh } from "./lib/market-refresh-loader.mjs";

const SECRETS = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SOLDGRAPH_API_KEY].filter(Boolean);
const redact = (text) => SECRETS.reduce((t, s) => t.split(s).join("[redacted]"), String(text));
const print = (line) => console.log(redact(line));
const fail = (msg) => {
  console.error(redact(msg));
  process.exit(1);
};

const core = await loadMarketRefresh(LEADS_ENTRY);

// Arguments are checked before anything connects.
let opts;
try {
  opts = core.parseLeadsArgs(process.argv.slice(2));
} catch (err) {
  fail(`${err.message}\nSee scripts/MARKETPLACE-LEADS.md for usage.`);
}
if (!opts.gitCommit) {
  try {
    opts.gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    // executeLeadsCli explains what to do.
  }
}

// Staging only: the guard refuses production before any client exists.
const target = await requireStaging();
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(target.url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  process.exitCode = await core.executeLeadsCli(opts, {
    db,
    env: process.env,
    print,
    repoRoot: REPO_ROOT,
    fileExists: (file) => fs.existsSync(file),
    writeFile: (file, text) => fs.writeFileSync(file, text, { flag: "wx", mode: 0o600 }),
  });
} catch (err) {
  fail(`marketplace leads failed: ${err instanceof Error ? err.message : "unknown error"}`);
}
