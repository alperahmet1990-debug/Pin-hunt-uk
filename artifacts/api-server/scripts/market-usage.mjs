/**
 * Soldgraph usage report (#409): credits and calls by month and route from
 * provider_usage, the month's budget (provider_budgets, or the default of
 * SOLDGRAPH_MONTHLY_LIMIT / 100) and what is left. Read-only; staging only.
 *
 * Usage (from artifacts/api-server, Node 22.18+):
 *   node --env-file=.env.staging scripts/market-usage.mjs [--months 3] [--usd-per-credit 0.0045]
 *
 * See scripts/MARKET-REFRESH.md.
 */
import { requireStaging } from "./lib/staging-guard.mjs";
import { loadMarketRefresh } from "./lib/market-refresh-loader.mjs";

const SECRETS = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SOLDGRAPH_API_KEY].filter(Boolean);
const redact = (text) => SECRETS.reduce((t, s) => t.split(s).join("[redacted]"), String(text));
const fail = (msg) => {
  console.error(redact(msg));
  process.exit(1);
};

const core = await loadMarketRefresh();
let opts;
try {
  opts = core.parseUsageArgs(process.argv.slice(2));
} catch (err) {
  fail(`${err.message}\nSee scripts/MARKET-REFRESH.md for usage.`);
}

const target = await requireStaging();
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(target.url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  process.exitCode = await core.executeUsageCli(opts, { db, env: process.env, print: (l) => console.log(redact(l)) });
} catch (err) {
  fail(`usage report failed: ${err instanceof Error ? err.message : "unknown error"}`);
}
