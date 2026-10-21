/**
 * Entry points for scripts/market-refresh.mjs and scripts/market-usage.mjs
 * (SG-06, #409). The scripts parse arguments first, pass the staging guard,
 * build the Supabase client and then call `executeRefreshCli` /
 * `executeUsageCli`. Output is plain text for the maintainer's terminal; it
 * never includes keys, listing titles, links or seller data.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SoldgraphClient, SoldgraphLogger } from "../../soldgraph/client";
import { createSoldgraphClientFromEnv } from "../../soldgraph/factory";
import type { MarketValuationV2 } from "../valuation-v2";
import {
  type CliOptions,
  type PinSummary,
  type ProbeResult,
  type PurgeResult,
  type RefreshDeps,
  type RefreshResult,
  type UsageMonth,
  RefreshUsageError,
  parseCliArgs,
  runProbe,
  runPurge,
  runRefresh,
  runUsageReport,
} from "./refresh";
import { describeFilter, refreshSource } from "./sources";
import { SupabaseRefreshStore } from "./store";
import type { BudgetStatus, RefreshStore } from "./types";

export { RefreshUsageError, parseCliArgs };
export type { CliOptions };

/** The client logs nothing to the terminal: its fields can include request ids. */
const quietLogger: SoldgraphLogger = { info() {}, warn() {}, error() {} };

export interface CliDeps {
  db?: SupabaseClient;
  /** Overrides db; for tests. */
  store?: RefreshStore;
  env: NodeJS.ProcessEnv;
  print: (line: string) => void;
  now?: () => number;
  createClient?: () => SoldgraphClient;
}

function deps(d: CliDeps): RefreshDeps {
  const store = d.store ?? (d.db ? new SupabaseRefreshStore(d.db, d.env) : null);
  if (!store) throw new Error("no database");
  return {
    store,
    env: d.env,
    now: d.now,
    createClient: d.createClient ?? (() => createSoldgraphClientFromEnv(d.env, { logger: quietLogger })),
  };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function formatBudget(b: BudgetStatus): string {
  const origin = b.origin === "row" ? "provider_budgets row" : "default, no provider_budgets row";
  const left = b.hardStop ? `${Math.max(0, b.limitCredits - b.usedCredits)} left (hard stop)` : "soft cap";
  return `Month ${b.month}: ${b.usedCredits} of ${b.limitCredits} credits used (${origin}), ${left}.`;
}

export function formatValuation(v: MarketValuationV2): string {
  // Includes the region reasons (#450): region_unverified, cross_market_duplicate, converted_price.
  const why = Object.entries(v.excluded ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([r, n]) => `${r} ${n}`).join(", ");
  const leftOut = why ? ` (left out: ${why})` : "";
  if (v.fair === null) return `${v.market} ${v.confidence.band}${leftOut}`;
  return `${v.market} fair ${v.fair.toFixed(2)} ${v.currency} (${v.confidence.band}, ${v.soldCount} sold, ${v.activeCount} listed)${leftOut}`;
}

function formatPin(p: PinSummary): string {
  const parts = [
    p.pinhuntId,
    `searched ${p.searchesRun}`,
    p.sharedSearches ? `shared ${p.sharedSearches}` : "",
    p.searchesFailed ? `failed ${p.searchesFailed}` : "",
    p.cachedSources.length ? `cached ${p.cachedSources.length}` : "",
    `found ${p.found}`,
    `accepted ${p.accepted}`,
    `near-misses ${p.nearMisses}`,
    Object.keys(p.rejectedReasons ?? {}).length
      ? `turned down ${Object.entries(p.rejectedReasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(", ")}`
      : "",
    p.droppedAsDuplicate ? `kept on a better-matching pin ${p.droppedAsDuplicate}` : "",
    p.stoppedBy ? `STOPPED (${p.stoppedBy})` : "",
  ].filter(Boolean);
  let val = "";
  if (p.valuation?.status === "saved") val = p.valuation.valuations.map(formatValuation).join(" | ");
  else if (p.valuation?.status === "disabled") val = "valuation not written (MARKET_VALUATION_V2_ENABLED is off)";
  else if (p.valuation?.status === "error") val = "valuation failed";
  return `  ${parts.join("  ")}${val ? `\n      ${val}` : ""}`;
}

export function formatRefresh(r: RefreshResult, opts: Extract<CliOptions, { command: "refresh" }>, env: NodeJS.ProcessEnv): string[] {
  const p = r.plan;
  const out: string[] = [];
  out.push(r.applied ? "Market refresh: APPLY" : "Market refresh: dry run (no provider calls, nothing written)");
  out.push(formatBudget(p.budget));
  out.push(`Sources: ${opts.sources.join(", ")}  (queries per source per pin: ${opts.queriesPerSource}; cache: sold ${opts.soldTtlDays}d, active ${opts.activeTtlDays}d)`);
  for (const f of p.filters ?? []) {
    const spec = refreshSource(f.sourceId);
    if (spec) out.push(`  ${f.sourceId}: ${describeFilter(spec)}`);
  }
  if (p.missingSources.length) out.push(`  No market_sources row: ${p.missingSources.join(", ")}`);
  if (p.disabledSources.length) out.push(`  Not enabled in market_sources: ${p.disabledSources.join(", ")}`);
  out.push(`Pins: ${p.pins.length} found${p.missingPins.length ? `, ${p.missingPins.length} not found: ${p.missingPins.join(", ")}` : ""}`);
  if (!r.applied) {
    for (const pin of p.pins) {
      const cached = pin.cachedSources.length ? `  cached (fresh): ${pin.cachedSources.join(", ")}` : "";
      out.push(`  ${pin.pinhuntId}  planned searches ${pin.searches.length}${cached}`);
    }
  }
  out.push(
    `Worst case: ${p.worstCaseCredits} credit(s) for ${p.uniqueSearches} search(es)` +
    (p.sharedSearches ? ` (${p.sharedSearches} more reuse an identical search)` : "") + ".",
  );
  if (p.overBudget) out.push(`OVER BUDGET: only ${p.remainingCredits} credit(s) left this month. Use fewer pins or sources.`);
  if (env.MARKET_VALUATION_V2_ENABLED !== "true") {
    out.push("Note: MARKET_VALUATION_V2_ENABLED is not \"true\", so listings are stored but valuations are not written.");
  }
  if (r.blockers.length) {
    out.push("Not applied:");
    for (const b of r.blockers) out.push(`  - ${b}`);
  }
  if (!opts.apply) {
    out.push(`To run it: add --apply --confirm-credits ${p.worstCaseCredits} (see MARKET-REFRESH.md).`);
  }
  if (r.applied) {
    out.push("Per pin:");
    for (const pin of r.pins) out.push(formatPin(pin));
    out.push(
      `Done: ${r.creditsSpent} paid search(es) sent, ${r.listingsWritten} listing row(s) written` +
      (r.storedRowsReplaced ? `, ${r.storedRowsReplaced} stored duplicate(s) removed from worse-matching pins` : "") +
      (r.otherPinsRevalued ? `, ${r.otherPinsRevalued} other pin(s) revalued` : "") + ".",
    );
    if (r.stoppedBy) out.push(`Stopped early (${r.stoppedBy}); pins after that were not searched.`);
    if (r.budgetAfter) out.push(`After: ${formatBudget(r.budgetAfter)}`);
  }
  return out;
}

export function formatProbe(r: ProbeResult): string[] {
  const out: string[] = [];
  out.push(r.applied ? "Single probe: APPLY (1 search)" : "Single probe: dry run (no provider call)");
  out.push(formatBudget(r.budget));
  const spec = refreshSource(r.sourceId);
  out.push(`Source ${r.sourceId}: route "${r.route}", country=${r.country}, ${spec ? describeFilter(spec) : "no item_location filter"}`);
  out.push(r.pinFound ? `Query: ${r.query ?? "(none could be built)"}` : "Pin not found.");
  if (r.blockers.length) {
    out.push("Not applied:");
    for (const b of r.blockers) out.push(`  - ${b}`);
  }
  if (!r.applied && !r.blockers.length) out.push("To run it: add --apply --confirm-credits 1.");
  if (r.error) out.push(`Probe failed: ${r.error}`);
  if (r.report) {
    out.push(`Rows: ${r.report.rows} (pages ${r.pages}${r.truncated ? ", more available" : ""}). Field names and types only:`);
    for (const f of r.report.fields) {
      out.push(`  ${f.name}: ${f.types.join("|")}  in ${f.present}/${r.report.rows}${f.nested ? `  { ${f.nested.join(", ")} }` : ""}`);
    }
    if (r.report.hiddenKeys) out.push(`  (${r.report.hiddenKeys} key(s) not shaped like field names were not shown)`);
    out.push(`Adapter: ${r.mapped} row(s) mapped, ${r.withPrice ?? 0} with a price, ${r.withSoldDate ?? 0} with a sold date${Object.keys(r.dropped ?? {}).length ? `, dropped ${JSON.stringify(r.dropped)}` : ""}.`);
    out.push(`Matching v2: ${r.matchAccepted} accepted${Object.keys(r.matchRejected ?? {}).length ? `, rejected ${JSON.stringify(r.matchRejected)}` : ""}.`);
    if (r.itemCountries) {
      const byCount = Object.entries(r.itemCountries).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(", ");
      out.push(`Item country (parsed from location, counts only): ${byCount}.`);
    }
    if (r.responseKeys) {
      out.push(`Response keys: ${r.responseKeys.body.join(", ") || "(none)"}`);
      out.push(`Result keys: ${r.responseKeys.result.join(", ") || "(none)"}`);
    }
  }
  return out;
}

export function formatPurge(r: PurgeResult): string[] {
  const total = r.expired.reduce((n, e) => n + e.count, 0);
  const out = [r.applied ? "Purge expired market listings: APPLY" : "Purge expired market listings: dry run (nothing deleted)"];
  for (const e of r.expired) out.push(`  ${e.sourceId}: ${e.count} expired row(s)`);
  if (r.kept.length) {
    out.push(`Kept, no age-based expiry: ${r.kept.join(", ")}`);
    out.push("  These sources have unlimited retention (Soldgraph sets no limit; see docs/market-data/RIGHTS.md), so purge never deletes their rows.");
    out.push("  To delete every row of one source on purpose, run purge_market_listings('<source>', true) in the SQL editor.");
  }
  out.push(r.applied ? `Deleted ${r.deleted} row(s).` : `${total} row(s) would be deleted. Add --apply to delete them.`);
  return out;
}

export function formatUsage(months: UsageMonth[]): string[] {
  const out = ["Soldgraph usage by month and route (provider_usage)"];
  for (const m of months) {
    const left = m.remainingCredits === null ? "soft cap" : `${m.remainingCredits} left`;
    const usd = m.estimatedUsd !== undefined ? `, ~$${m.estimatedUsd.toFixed(2)}` : "";
    out.push(`${m.month}: ${m.credits} credit(s), ${m.requests} call(s)${usd}; budget ${m.limitCredits}${m.budgetOrigin === "default" ? " (default)" : ""}, ${left}`);
    for (const r of m.byRoute) {
      out.push(`  ${r.route}: ${r.credits} credit(s), ${r.requests} call(s)${r.failed ? `, ${r.failed} not completed` : ""}`);
    }
  }
  return out;
}

// ─── Entry points ────────────────────────────────────────────────────────────

/** Runs a parsed market-refresh command. Returns the process exit code. */
export async function executeRefreshCli(opts: CliOptions, d: CliDeps): Promise<number> {
  const rd = deps(d);
  if (opts.command === "refresh") {
    const r = await runRefresh(opts, rd);
    formatRefresh(r, opts, d.env).forEach(l => d.print(l));
    return opts.apply && !r.applied ? 1 : 0;
  }
  if (opts.command === "probe") {
    if (!refreshSource(opts.source)) throw new RefreshUsageError("unknown source");
    const r = await runProbe(opts, rd);
    formatProbe(r).forEach(l => d.print(l));
    return (opts.apply && !r.applied) || r.error ? 1 : 0;
  }
  const r = await runPurge(opts, rd);
  formatPurge(r).forEach(l => d.print(l));
  return 0;
}

export interface UsageCliOptions {
  months: number;
  usdPerCredit: number | null;
}

export function parseUsageArgs(argv: string[]): UsageCliOptions {
  const out: UsageCliOptions = { months: 3, usdPerCredit: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const v = argv[++i];
    if (flag === "--months") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 24) throw new RefreshUsageError("--months must be a whole number from 1 to 24.");
      out.months = n;
    } else if (flag === "--usd-per-credit") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 10) throw new RefreshUsageError("--usd-per-credit must be a number from 0 to 10.");
      out.usdPerCredit = n;
    } else {
      throw new RefreshUsageError(`Unknown flag ${flag}.`);
    }
  }
  return out;
}

export async function executeUsageCli(opts: UsageCliOptions, d: CliDeps): Promise<number> {
  const months = await runUsageReport(opts, deps(d));
  formatUsage(months).forEach(l => d.print(l));
  return 0;
}
