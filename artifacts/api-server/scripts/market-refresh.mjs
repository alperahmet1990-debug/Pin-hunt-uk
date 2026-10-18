/**
 * Soldgraph market refresh pilot (#409). Run by the maintainer on their own
 * machine, against staging only. Agents never run it: --apply calls a paid
 * API and writes to a hosted database.
 *
 *   refresh (default)  plan, then (with --apply) search, store and revalue
 *   probe              exactly one search; prints field names only
 *   purge              delete expired market_listings rows
 *
 * Every command is a dry run without --apply. --apply on refresh and probe
 * also needs --confirm-credits equal to the worst case the dry run printed.
 *
 * Usage (from artifacts/api-server, Node 22.18+):
 *   node --env-file=.env.staging scripts/market-refresh.mjs --pinhunt-ids PHUK-00000001,PHUK-00000002 --sources soldgraph:ebay_gb_sold
 *   node --env-file=.env.staging scripts/market-refresh.mjs --ids-file pilot-pins.txt --sources soldgraph:ebay_gb_sold,soldgraph:ebay_fr_sold
 *   SOLDGRAPH_ENABLED=true MARKET_VALUATION_V2_ENABLED=true node --env-file=.env.staging scripts/market-refresh.mjs ... --apply --confirm-credits N
 *   node --env-file=.env.staging scripts/market-refresh.mjs probe --pinhunt-id PHUK-00000001 --source soldgraph:ebay_gb_sold
 *   node --env-file=.env.staging scripts/market-refresh.mjs purge [--source soldgraph:ebay_gb_sold] [--apply]
 *
 * See scripts/MARKET-REFRESH.md for the full walkthrough.
 */
import { requireStaging } from "./lib/staging-guard.mjs";
import { loadMarketRefresh } from "./lib/market-refresh-loader.mjs";

const SECRETS = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SOLDGRAPH_API_KEY].filter(Boolean);
const redact = (text) => SECRETS.reduce((t, s) => t.split(s).join("[redacted]"), String(text));
const print = (line) => console.log(redact(line));
const fail = (msg) => {
  console.error(redact(msg));
  process.exit(1);
};

const core = await loadMarketRefresh();

// Arguments are checked before anything connects.
let opts;
try {
  opts = core.parseCliArgs(process.argv.slice(2));
} catch (err) {
  fail(`${err.message}\nSee scripts/MARKET-REFRESH.md for usage.`);
}

// Staging only: the guard refuses production before any client exists.
const target = await requireStaging();
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(target.url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  process.exitCode = await core.executeRefreshCli(opts, { db, env: process.env, print });
} catch (err) {
  fail(`${opts.command} failed: ${err instanceof Error ? err.message : "unknown error"}`);
}
