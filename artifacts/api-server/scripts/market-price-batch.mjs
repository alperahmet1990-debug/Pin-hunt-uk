/**
 * Capped batch pricing for many pins (default: verified 2025–26 pins), through
 * the same request path as a collector's "Get a price", with origin "batch".
 * Run by the maintainer on their own machine, against staging only. Agents
 * never run it with --apply: it calls a paid API and writes to a hosted
 * database.
 *
 * Every command is a dry run without --apply. --apply also needs
 * --max-credits (the run ceiling) and --confirm-credits equal to the planned
 * credits the dry run printed.
 *
 * Usage (from artifacts/api-server, Node 22.18+):
 *   node --env-file=.env.staging scripts/market-price-batch.mjs --markets UK,US
 *   node --env-file=.env.staging scripts/market-price-batch.mjs --markets UK,US --max-credits 1000
 *   SOLDGRAPH_ENABLED=true MARKET_VALUATION_V2_ENABLED=true node --env-file=.env.staging scripts/market-price-batch.mjs \
 *     --markets UK,US --max-credits 1000 --apply --confirm-credits 1000
 *   node --env-file=.env.staging scripts/market-price-batch.mjs --markets UK --ids-file top-pins.txt
 *
 * See scripts/PRICE-REQUEST.md ("Batch pricing").
 */
import { requireStaging } from "./lib/staging-guard.mjs";
import { BATCH_ENTRY, loadMarketRefresh } from "./lib/market-refresh-loader.mjs";

const SECRETS = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SOLDGRAPH_API_KEY].filter(Boolean);
const redact = (text) => SECRETS.reduce((t, s) => t.split(s).join("[redacted]"), String(text));
const print = (line) => console.log(redact(line));
const fail = (msg) => {
  console.error(redact(msg));
  process.exit(1);
};

const core = await loadMarketRefresh(BATCH_ENTRY);

// Arguments are checked before anything connects.
let opts;
try {
  opts = core.parseArgs(process.argv.slice(2));
} catch (err) {
  fail(`${err.message}\nSee scripts/PRICE-REQUEST.md ("Batch pricing") for usage.`);
}

// Staging only: the guard refuses production before any client exists.
const target = await requireStaging();
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(target.url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  process.exitCode = await core.executeBatchCli(opts, { db, env: process.env, print });
} catch (err) {
  fail(`batch failed: ${err instanceof Error ? err.message : "unknown error"}`);
}
