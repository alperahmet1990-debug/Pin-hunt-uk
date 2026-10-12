/**
 * staging-db — prepares the staging Supabase project from production's
 * SCHEMA (never its data), and checks it.
 *
 *   pnpm --filter @workspace/api-server run staging:check     prerequisites only, no connections
 *   pnpm --filter @workspace/api-server run staging:export    read-only schema export from production
 *   pnpm --filter @workspace/api-server run staging:restore   apply the export to an EMPTY staging project
 *   pnpm --filter @workspace/api-server run staging:verify    compare staging with the export; prove it holds no copied data
 *
 * Safety:
 * - Staging identity: the staging guard (refs, production refusal) runs first.
 *   Every connection uses user postgres.<ref>, which is how the pooler picks
 *   the project, so a connection can only reach the ref it names.
 * - Production is read-only: every production SQL script starts with
 *   `set default_transaction_read_only = on` and runs in a READ ONLY
 *   transaction that is rolled back; pg_dump runs with --schema-only.
 * - No data: the dump is checked for row data and refused if it has any;
 *   config.sql is built only from bucket settings, policies, triggers,
 *   realtime membership and two configuration tables. After restore, staging
 *   must have zero sign-ins, zero files and empty user tables.
 * - Restore refuses a non-empty staging project.
 * - Exports go to STAGING_EXPORT_DIR (default ~/PinHunt-Private/staging), which
 *   must be outside every git repository. Passwords are prompted, kept in
 *   memory, and passed only to psql/pg_dump.
 * Requires psql and pg_dump: Postgres.app (postgresapp.com) or Homebrew libpq.
 * Both are found automatically; no PATH changes needed.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STAGING_MARKER_BUCKET, assertStagingTarget, isValidRef } from "./lib/staging-guard.mjs";
import {
  CONFIG_QUERY,
  DATA_COUNTS_QUERY,
  FINGERPRINT_QUERY,
  assertPoolerHost,
  buildConfigSql,
  connectionArgs,
  copiedData,
  diffFingerprints,
  findTool,
  assertServerVersions,
  toolMajor,
  missingExtensionsSql,
  pgDumpArgs,
  productionReadOnlySql,
  sanitizeSchemaDump,
} from "./lib/staging-db.mjs";

const COMMANDS = ["check", "export", "restore", "verify"];
const command = process.argv[2];

function fail(message) {
  console.error(`[staging-db] ${message}`);
  process.exit(1);
}

function settings(env) {
  const target = assertStagingTarget(env);
  if (!isValidRef(env.PRODUCTION_PROJECT_REF)) throw new Error("PRODUCTION_PROJECT_REF is not set.");
  return {
    stagingRef: target.ref,
    productionRef: env.PRODUCTION_PROJECT_REF,
    stagingHost: assertPoolerHost(env.STAGING_DB_HOST, "STAGING_DB_HOST"),
    productionHost: assertPoolerHost(env.PRODUCTION_DB_HOST, "PRODUCTION_DB_HOST"),
    exportDir: path.resolve((env.STAGING_EXPORT_DIR || "~/PinHunt-Private/staging").replace(/^~(?=$|\/)/, os.homedir())),
  };
}

function tool(name) {
  const found = findTool(name, { exists: (p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } } });
  if (!found) throw new Error(`${name} not found. Install Postgres.app from postgresapp.com (drag it to Applications and open it once).`);
  return found;
}

function toolVersion(name) {
  const r = spawnSync(tool(name), ["--version"], { encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error(`${name} --version failed.`);
  return r.stdout.trim();
}

function assertOutsideGit(dir) {
  let probe = dir;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const r = spawnSync("git", ["-C", probe, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (r.status === 0 && r.stdout.trim() === "true") {
    throw new Error(`STAGING_EXPORT_DIR (${dir}) is inside a git repository. Exports must stay outside git.`);
  }
}

async function promptPassword(label) {
  if (!process.stdin.isTTY) throw new Error("run this in a terminal: passwords are typed at a hidden prompt.");
  process.stdout.write(`${label}: `);
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

function pgEnv(password) {
  return { ...process.env, PGPASSWORD: password, PGSSLMODE: "require", PGCONNECT_TIMEOUT: "15" };
}

/** Runs an SQL script with psql; returns trimmed stdout. */
function psql(conn, password, sql, { singleTransaction = false } = {}) {
  const args = [...conn, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", ...(singleTransaction ? ["--single-transaction"] : []), "-f", "-"];
  const r = spawnSync(tool("psql"), args, { input: sql, encoding: "utf8", env: pgEnv(password), maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`psql failed: ${(r.stderr || r.error?.message || "").trim().slice(0, 600)}`);
  return r.stdout.trim();
}

function psqlFile(conn, password, file) {
  const args = [...conn, "-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", file];
  const r = spawnSync(tool("psql"), args, { encoding: "utf8", env: pgEnv(password), maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`restoring ${path.basename(file)} failed (nothing from this file was applied): ${(r.stderr || "").trim().slice(0, 800)}`);
}

/** The ONLY way this tool runs SQL against production. */
function productionQuery(s, password, sql) {
  return psql(connectionArgs({ host: s.productionHost, ref: s.productionRef }), password, productionReadOnlySql(sql));
}

function stagingConn(s) {
  return connectionArgs({ host: s.stagingHost, ref: s.stagingRef });
}

function latestExport(s) {
  const pointer = path.join(s.exportDir, "LATEST");
  if (!fs.existsSync(pointer)) throw new Error(`no export found in ${s.exportDir}. Run staging:export first.`);
  const dir = path.join(s.exportDir, fs.readFileSync(pointer, "utf8").trim());
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  if (manifest.productionRef !== s.productionRef || manifest.productionRef === s.stagingRef) {
    throw new Error("the latest export doesn't come from PRODUCTION_PROJECT_REF. Run staging:export again.");
  }
  return { dir, manifest };
}

async function check(s) {
  assertOutsideGit(s.exportDir);
  console.log(`  ${toolVersion("pg_dump")}\n  ${toolVersion("psql")}`);
  console.log(`  staging ${s.stagingRef} ≠ production ${s.productionRef}; export dir ${s.exportDir} is outside git.`);
  console.log("  ok: nothing was connected to.");
}

async function exportSchema(s) {
  await check(s);
  fs.mkdirSync(s.exportDir, { recursive: true, mode: 0o700 });
  const name = `export-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const dir = path.join(s.exportDir, name);
  fs.mkdirSync(dir, { mode: 0o700 });

  const password = await promptPassword(`PRODUCTION database password (read-only use, project ${s.productionRef})`);
  const conn = connectionArgs({ host: s.productionHost, ref: s.productionRef });

  console.log("  1/3 schema-only dump (definitions, no rows)…");
  const raw = path.join(dir, "raw-dump.sql");
  const dump = spawnSync(tool("pg_dump"), pgDumpArgs(conn, raw, { major: toolMajor(toolVersion("pg_dump")) }), { encoding: "utf8", env: pgEnv(password) });
  if (dump.status !== 0) throw new Error(`pg_dump failed: ${(dump.stderr || "").trim().slice(0, 600)}`);
  const { sql, removed } = sanitizeSchemaDump(fs.readFileSync(raw, "utf8"));
  fs.writeFileSync(path.join(dir, "schema.sql"), sql, { mode: 0o600 });
  fs.rmSync(raw);

  console.log("  2/3 configuration (buckets, policies, auth triggers, realtime, reference rows)…");
  const cfg = JSON.parse(productionQuery(s, password, `set search_path = pg_catalog;\n${CONFIG_QUERY}`));
  fs.writeFileSync(path.join(dir, "config.sql"), buildConfigSql(cfg), { mode: 0o600 });

  const serverVersionNum = productionQuery(s, password, "select current_setting('server_version_num');");

  console.log("  3/3 schema fingerprint…");
  fs.writeFileSync(path.join(dir, "prod-fingerprint.txt"), productionQuery(s, password, FINGERPRINT_QUERY) + "\n", { mode: 0o600 });

  const manifest = {
    productionRef: s.productionRef,
    createdAt: new Date().toISOString(),
    pgDump: toolVersion("pg_dump"),
    serverVersionNum,
    extensions: cfg.extensions,
    counts: {
      buckets: cfg.buckets.length,
      storagePolicies: cfg.storagePolicies.length,
      authTriggers: cfg.authTriggers.length,
      realtimeTables: cfg.realtimeTables.length,
      catalogueSources: cfg.catalogueSources.length,
      featureFlags: cfg.featureFlags.length,
    },
    removedFromDump: removed,
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  fs.writeFileSync(path.join(s.exportDir, "LATEST"), name + "\n", { mode: 0o600 });
  console.log(`  done: ${dir}\n  ${JSON.stringify(manifest.counts)}`);
  if (cfg.authTriggers.length === 0) console.warn("  warning: no auth.users triggers found; new sign-ups won't get profiles.");
}

async function restore(s) {
  const { dir, manifest } = latestExport(s);
  const password = await promptPassword(`STAGING database password (project ${s.stagingRef})`);
  const conn = stagingConn(s);

  console.log("  1/6 checking staging is a fresh, empty project on a compatible Postgres version…");
  assertServerVersions(manifest.serverVersionNum, psql(conn, password, "select current_setting('server_version_num');"));
  const tables = Number(psql(conn, password, "select count(*) from pg_tables where schemaname = 'public';"));
  const counts = JSON.parse(psql(conn, password, DATA_COUNTS_QUERY));
  if (tables > 0 || counts["auth.users"] > 0 || counts["storage.objects"] > 0) {
    throw new Error(`staging isn't empty (${tables} public tables, ${counts["auth.users"]} users, ${counts["storage.objects"]} files). Restore only into a new project; use staging:verify to check an existing one.`);
  }

  console.log("  2/6 extensions…");
  const have = psql(conn, password, "select extname from pg_extension;").split("\n").filter(Boolean);
  const exts = missingExtensionsSql(manifest.extensions, have);
  if (exts.length) psql(conn, password, exts.join("\n"), { singleTransaction: true });
  console.log(`      enabled ${exts.length} missing extension(s).`);

  console.log("  3/6 schema…");
  psqlFile(conn, password, path.join(dir, "schema.sql"));
  console.log("  4/6 configuration…");
  psqlFile(conn, password, path.join(dir, "config.sql"));

  console.log("  5/6 staging marker and API schema reload…");
  psql(conn, password, `insert into storage.buckets (id, name, public) values ('${STAGING_MARKER_BUCKET}', '${STAGING_MARKER_BUCKET}', false) on conflict (id) do nothing;\nnotify pgrst, 'reload schema';`);

  console.log("  6/6 verifying…");
  await verify(s, { password, requireEmpty: true });
}

async function verify(s, { password, requireEmpty = false } = {}) {
  const { dir } = latestExport(s);
  const pw = password ?? (await promptPassword(`STAGING database password (project ${s.stagingRef})`));
  const conn = stagingConn(s);
  const stagingPrint = psql(conn, pw, FINGERPRINT_QUERY);
  const { missingInStaging, extraInStaging } = diffFingerprints(fs.readFileSync(path.join(dir, "prod-fingerprint.txt"), "utf8"), stagingPrint);
  const marker = psql(conn, pw, `select count(*) from storage.buckets where id = '${STAGING_MARKER_BUCKET}';`) === "1";
  const counts = JSON.parse(psql(conn, pw, DATA_COUNTS_QUERY));
  const copied = copiedData(counts);

  console.log(`  schema: ${missingInStaging.length} missing, ${extraInStaging.length} extra (vs production)`);
  for (const l of missingInStaging.slice(0, 20)) console.log(`    - missing: ${l}`);
  for (const l of extraInStaging.slice(0, 20)) console.log(`    + extra:   ${l}`);
  console.log(`  staging marker: ${marker ? "present" : "MISSING"}`);
  console.log(`  data: ${counts["auth.users"]} sign-ins, ${counts["storage.objects"]} files, non-empty user tables: ${copied.filter((c) => c.startsWith("public.")).join(", ") || "none"}`);

  const problems = [];
  if (missingInStaging.length || extraInStaging.length) problems.push("schema differs from production");
  if (!marker) problems.push("marker bucket missing");
  if (requireEmpty && copied.length) problems.push(`unexpected data after restore: ${copied.join(", ")}`);
  if (problems.length) throw new Error(problems.join("; "));
  console.log("  ok: staging matches production's schema.");
}

if (!COMMANDS.includes(command)) fail(`usage: staging-db.mjs <${COMMANDS.join("|")}>`);
try {
  const s = settings(process.env);
  console.log(`[staging-db] ${command}: staging ${s.stagingRef}`);
  await { check, export: exportSchema, restore, verify }[command](s);
} catch (err) {
  fail(err.message);
}
