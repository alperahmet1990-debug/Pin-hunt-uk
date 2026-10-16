/**
 * Copy the public catalogue from main into staging (#372). Run by the
 * maintainer on their own machine; agents never run it.
 *
 * Reads main with its anon (public) key only, so it sees exactly what any
 * app user sees. Writes staging with the staging service role, after the
 * staging guard. Copies only the catalogue tables listed in
 * lib/catalogue-copy.mjs; never accounts, collections, messages,
 * submissions or files. Never deletes. Dry run unless --apply.
 *
 * Usage (from artifacts/api-server):
 *   node --env-file=.env.staging scripts/copy-catalogue-to-staging.mjs           # dry run
 *   node --env-file=.env.staging scripts/copy-catalogue-to-staging.mjs --apply
 *
 * Needs, in .env.staging, besides the usual staging settings:
 *   MAIN_SUPABASE_URL       https://<PRODUCTION_PROJECT_REF>.supabase.co
 *   MAIN_SUPABASE_ANON_KEY  main's anon / publishable key (never the service-role key)
 */
import { createClient } from "@supabase/supabase-js";
import { requireStaging } from "./lib/staging-guard.mjs";
import { assertAnonKey, assertMainTarget, runCopy } from "./lib/catalogue-copy.mjs";

const flags = process.argv.slice(2);
const unknown = flags.filter((f) => f !== "--apply");
if (unknown.length) {
  console.error(`Unknown option ${unknown[0]}. Usage: copy-catalogue-to-staging.mjs [--apply]`);
  process.exit(1);
}
const APPLY = flags.includes("--apply");

// Staging only: refuses production and any project not prepared by staging-db restore.
const target = await requireStaging();

let mainTarget;
try {
  mainTarget = assertMainTarget(process.env, target.ref);
  assertAnonKey(process.env.MAIN_SUPABASE_ANON_KEY, { stagingServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
} catch (err) {
  console.error(`[copy-catalogue] Refusing to run: ${err.message}`);
  process.exit(1);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const main = createClient(mainTarget.url, process.env.MAIN_SUPABASE_ANON_KEY, noSession);
const staging = createClient(target.url, process.env.SUPABASE_SERVICE_ROLE_KEY, noSession);
console.log(`[copy-catalogue] main ${mainTarget.ref} (public key, read-only) → staging ${target.ref} — ${APPLY ? "APPLY" : "dry run"}`);

async function readAll(client, table, columns, filters = []) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = client.from(table).select(columns);
    for (const [op, col, value] of filters) q = q[op](col, value);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

try {
  const result = await runCopy({ apply: APPLY }, {
    readMain: (table, filters) => readAll(main, table, "*", filters),
    readStaging: (table, columns) => readAll(staging, table, columns.join(", ")),
    async upsert(table, rows, key) {
      const { error } = await staging.from(table).upsert(rows, { onConflict: key.join(",") });
      if (error) throw new Error(error.message);
    },
    log: (msg) => console.log(msg),
  });
  if (result.failed.length) process.exitCode = 1;
} catch (err) {
  console.error(`[copy-catalogue] failed: ${err.message}`);
  process.exit(1);
}
